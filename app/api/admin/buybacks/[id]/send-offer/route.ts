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

  // Hard-fail with a clear message if the buyback row has no usable email.
  // Without this, SendGrid returns a confusing "Does not contain a valid
  // address" 400 — staff have no way to know the underlying problem.
  const email = (buyback.customerEmail ?? "").trim();
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!looksLikeEmail) {
    return NextResponse.json(
      {
        error:
          "This buyback has no valid customer email on file. " +
          "Open the row in Airtable and set the `Customer Email` field, then try again.",
      },
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
