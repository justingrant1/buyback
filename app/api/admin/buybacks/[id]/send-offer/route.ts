/**
 * POST /api/admin/buybacks/:id/send-offer
 *
 * Sends the itemized offer email to the customer and flips the buyback to
 * "Offer Sent". The email contains the approve link (/offer/:token). Requires
 * the buyback to already have an Offer Amount set (from the admin editor).
 */

import { NextResponse } from "next/server";
import { getBuyback, listItems, updateBuyback } from "@/lib/buybackAirtable";
import { sendOfferEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const buyback = await getBuyback(params.id);
  if (!buyback) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (buyback.offerAmount == null || buyback.offerAmount <= 0) {
    return NextResponse.json(
      { error: "Set an offer amount before sending." },
      { status: 400 },
    );
  }

  const items = await listItems(params.id);
  const result = await sendOfferEmail(buyback, items);
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Email failed" }, { status: 502 });
  }

  await updateBuyback(params.id, {
    Status: "Offer Sent",
    "Offer Sent At": new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, stub: result.stub });
}
