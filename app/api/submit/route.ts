/**
 * POST /api/submit
 *
 * Public endpoint hit by the /sell form. Takes the seller's contact info and a
 * list of coin line items, prices them (CDN bid/ask + junk melt), persists a
 * new buyback + items to Airtable, and returns a reference.
 *
 * We do NOT auto-send an offer here — Marley/Ben review and send from admin.
 * VIP batches (>= VIP_THRESHOLD) are flagged so they get the personal touch
 * Marley asked to preserve for big fish like Teresa.
 */

import { NextResponse } from "next/server";
import type { BuybackItem, SellerContact, SubmitResult } from "@/lib/types";
import { computeTotals, isVip, suggestedItemOffer } from "@/lib/pricing";
import { getSpot, junkSilverMelt } from "@/lib/metals";
import { priceSlab } from "@/lib/lookup";
import {
  addItems,
  createBuyback,
  upsertCustomer,
} from "@/lib/buybackAirtable";
import { makeRef, makeToken } from "@/lib/ref";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubmitBody {
  contact?: SellerContact;
  items?: BuybackItem[];
  notes?: string;
}

export async function POST(req: Request) {
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contact = body.contact;
  if (!contact?.name?.trim() || !contact?.email?.trim()) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  const items = (body.items ?? []).filter((it) => it.description?.trim());
  if (!items.length) {
    return NextResponse.json({ error: "Add at least one coin to your list." }, { status: 400 });
  }

  // Price the items server-side (don't trust client-sent prices).
  const spot = await getSpot();
  const priced: BuybackItem[] = await Promise.all(
    items.map(async (raw) => {
      const item: BuybackItem = { ...raw };
      if (!item.quantity || item.quantity < 1) item.quantity = 1;

      if (item.category === "Junk Silver" && typeof (item as any).faceValue === "number") {
        const melt = junkSilverMelt((item as any).faceValue, spot.silver);
        item.cdnBid = melt;
        item.cdnAsk = melt;
        item.offer = suggestedItemOffer(item, env.JUNK_MARGIN);
        return item;
      }
      if (item.certNumber && item.gradingService) {
        try {
          const result = await priceSlab({
            grading_service: item.gradingService,
            cert_number: item.certNumber,
            grade_numeric: item.grade ? Number((item.grade.match(/\d{1,2}/) ?? [])[0]) || null : null,
            has_cac_sticker: Boolean(item.cac),
            denomination: item.denomination ?? null,
            year: item.year ?? null,
            mint_mark: null,
            pcgs_number: null,
          } as any);
          if (result?.pricing) {
            item.cdnBid = result.pricing.bid ?? null;
            item.cdnAsk = result.pricing.ask ?? null;
          }
        } catch {
          /* leave unpriced; admin fills it */
        }
      }
      if (item.cdnBid != null) item.offer = suggestedItemOffer(item);
      return item;
    }),
  );

  const totals = computeTotals(priced);
  const vip = isVip(totals.estimatedValue);
  const ref = makeRef();
  const approvalToken = makeToken();

  try {
    const customerId = await upsertCustomer(contact);
    const buybackId = await createBuyback({
      ref,
      contact,
      customerId,
      status: "New",
      vip,
      itemCount: totals.itemCount,
      estimatedValue: totals.estimatedValue,
      avgCoinValue: totals.avgCoinValue,
      approvalToken,
      source: "Web Form",
      notes: body.notes,
    });
    await addItems(buybackId, priced);

    const result: SubmitResult = {
      ok: true,
      ref,
      id: buybackId,
      estimatedValue: totals.estimatedValue,
      itemCount: totals.itemCount,
      vip,
      message: vip
        ? "Thanks! Because of the size of your collection, one of our specialists will reach out personally."
        : "Thanks! We've received your list and will email you an itemized offer shortly.",
    };
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[submit] failed:", e?.message);
    return NextResponse.json(
      { error: "We couldn't save your submission. Please try again or email buyback@wittercoin.com." },
      { status: 500 },
    );
  }
}
