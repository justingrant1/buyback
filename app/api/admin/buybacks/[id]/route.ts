/**
 * GET    /api/admin/buybacks/:id   -> buyback + its line items
 * PATCH  /api/admin/buybacks/:id   -> update status / offer / per-line offers
 *
 * The PATCH handler recomputes the batch offer + margin from the line offers
 * (or an explicit offerAmount), keeping Airtable's summary fields in sync.
 */

import { NextResponse } from "next/server";
import {
  getBuyback,
  listItems,
  updateBuyback,
  updateItemOffers,
} from "@/lib/buybackAirtable";
import { batchMargin, round2 } from "@/lib/pricing";
import type { BuybackStatus } from "@/lib/types";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const buyback = await getBuyback(params.id);
  if (!buyback) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await listItems(params.id, buyback.ref);
  return NextResponse.json({ buyback, items });

}

interface PatchBody {
  status?: BuybackStatus;
  offerAmount?: number;
  /**
   * Per-coin offers, keyed by the line-item record id. When present, the batch
   * Offer Amount is recomputed from the sum of these line offers (the explicit
   * offerAmount, if any, is ignored).
   */
  itemOffers?: { id: string; offer: number | null }[];
  notes?: string;
  dateReceived?: string;
}


export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await getBuyback(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fields: Record<string, unknown> = {};
  if (body.status) fields.Status = body.status;
  if (body.notes != null) fields.Notes = body.notes;
  if (body.dateReceived) fields["Date Received"] = body.dateReceived;

  // Per-coin offers win: persist each line and recompute the batch total from
  // their sum so the customer-facing total always matches the breakdown.
  let computedTotal: number | null = null;
  if (Array.isArray(body.itemOffers) && body.itemOffers.length) {
    const lines = body.itemOffers.map((o) => ({
      id: o.id,
      offer: o.offer == null ? null : round2(Number(o.offer)),
    }));
    await updateItemOffers(lines);
    computedTotal = round2(
      lines.reduce((sum, o) => sum + (o.offer ?? 0), 0),
    );
  }

  const offerAmount =
    computedTotal != null
      ? computedTotal
      : typeof body.offerAmount === "number"
        ? body.offerAmount
        : null;

  if (offerAmount != null) {
    fields["Offer Amount"] = offerAmount;
    fields["Margin %"] = Number(
      (batchMargin(existing.estimatedValue, offerAmount) * 100).toFixed(2),
    );
  }

  try {
    if (Object.keys(fields).length) await updateBuyback(params.id, fields);
    const updated = await getBuyback(params.id);
    const items = await listItems(params.id, updated?.ref);
    return NextResponse.json({ buyback: updated, items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}


