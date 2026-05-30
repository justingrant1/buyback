/**
 * POST /api/price-items
 *
 * Body: { items: BuybackItem[] }
 * Returns: { items: BuybackItem[] } with cdnBid / cdnAsk attached where we could
 * resolve pricing, plus computed totals.
 *
 * Resolution strategy per line:
 *   1. If the line has a cert number + grading service, run the full Slab Pricer
 *      lookup (PCGS cert -> PCGS# -> CDN).
 *   2. Else if junk silver / gold category, compute melt from live spot.
 *   3. Else leave bid/ask null for Marley to fill manually in admin.
 *
 * This route is intentionally resilient: a failure on one line never fails the
 * whole batch — that line just comes back unpriced.
 */

import { NextResponse } from "next/server";
import type { BuybackItem } from "@/lib/types";
import { computeTotals, suggestedItemOffer } from "@/lib/pricing";
import { getSpot, junkSilverMelt } from "@/lib/metals";
import { priceSlab } from "@/lib/lookup";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { items?: BuybackItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return NextResponse.json({ error: "No items provided" }, { status: 400 });
  }

  const spot = await getSpot();

  const priced: BuybackItem[] = await Promise.all(
    items.map(async (raw) => {
      const item: BuybackItem = { ...raw };
      if (item.description == null) item.description = "";
      if (!item.quantity || item.quantity < 1) item.quantity = 1;

      // 2. Metals path.

      if (item.category === "Junk Silver" && typeof (item as any).faceValue === "number") {
        const melt = junkSilverMelt((item as any).faceValue, spot.silver);
        item.cdnBid = melt;
        item.cdnAsk = melt;
        item.notes = appendNote(item.notes, `Silver spot $${spot.silver}/oz (${spot.asOf})`);
        item.offer = suggestedItemOffer(item, env.JUNK_MARGIN);
        return item;
      }

      // 1. Cert / slab path via the shared Slab Pricer core.
      if (item.certNumber && item.gradingService) {
        try {
          const result = await priceSlab({
            grading_service: item.gradingService,
            cert_number: item.certNumber,
            grade_numeric: parseGrade(item.grade),
            has_cac_sticker: Boolean(item.cac),
            denomination: item.denomination ?? null,
            year: item.year ?? null,
            mint_mark: null,
            pcgs_number: null,
          } as any);
          if (result?.pricing) {
            item.cdnBid = result.pricing.bid ?? null;
            item.cdnAsk = result.pricing.ask ?? null;
            if (!item.description && result.slab) {
              item.description = composeDescription(result.slab);
            }
          }
        } catch (e: any) {
          item.notes = appendNote(item.notes, `Auto-price failed: ${e?.message ?? "error"}`);
        }
      }

      if (item.cdnBid != null) item.offer = suggestedItemOffer(item);
      return item;
    }),
  );

  const totals = computeTotals(priced);
  return NextResponse.json({ items: priced, totals, spot });
}

function parseGrade(grade?: string): number | null {
  if (!grade) return null;
  const m = grade.match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

function composeDescription(slab: any): string {
  return [slab.year, slab.mint_mark, slab.denomination, slab.grade_label]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function appendNote(existing: string | undefined, note: string): string {
  return existing ? `${existing}; ${note}` : note;
}
