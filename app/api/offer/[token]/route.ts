/**
 * GET /api/offer/:token
 *
 * Public, token-gated view of a single offer for the customer approval page.
 * Returns only what the customer needs (no internal margin / reference value).
 */

import { NextResponse } from "next/server";
import { getBuybackByToken, listItems } from "@/lib/buybackAirtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { token: string } },
) {
  const buyback = await getBuybackByToken(params.token);
  if (!buyback) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  // Pass the Ref alongside the record id — the Items table's `Buyback` linked
  // field ARRAYJOINs to primary field values (Ref), not record IDs. Without
  // ref the customer-facing offer page renders zero line items.
  const items = await listItems(buyback.id, buyback.ref);
  return NextResponse.json({
    ref: buyback.ref,
    customerName: buyback.customerName,
    status: buyback.status,
    offerAmount: buyback.offerAmount,
    itemCount: buyback.itemCount,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity,
      grade: it.grade,
      offer: it.offer,
    })),
  });
}
