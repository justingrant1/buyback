/**
 * POST /api/offer/:token/approve
 *
 * Customer accepts (or declines) their offer.
 *  - decline: mark Declined, done.
 *  - accept:  generate a prepaid FedEx label (Shippo) for the customer to ship
 *             coins to us, store it on the buyback, email the label, and flip to
 *             "Label Sent".
 *
 * Idempotent-ish: if a label already exists we just re-send it rather than
 * buying a second one.
 */

import { NextResponse } from "next/server";
import { getBuybackByToken, updateBuyback } from "@/lib/buybackAirtable";
import { createInboundLabel } from "@/lib/shippo";
import { sendLabelEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  decision?: "accept" | "decline";
  ship?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const buyback = await getBuybackByToken(params.token);
  if (!buyback) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

  if (buyback.status === "Declined") {
    return NextResponse.json({ ok: true, status: "Declined" });
  }

  if (body.decision === "decline") {
    await updateBuyback(buyback.id, { Status: "Declined" });
    return NextResponse.json({ ok: true, status: "Declined" });
  }

  // ---- Accept path ----
  await updateBuyback(buyback.id, {
    Status: "Approved",
    "Approved At": new Date().toISOString(),
  });

  // Generate (or reuse) the prepaid inbound label (customer -> us).
  let labelUrl = buyback.labelUrl ?? null;
  let tracking = buyback.trackingNumber ?? null;
  let carrier = buyback.carrier ?? "FedEx";

  if (!labelUrl) {
    const label = await createInboundLabel({
      reference: buyback.ref,
      offerAmount: buyback.offerAmount ?? 0,
      from: {
        name: buyback.customerName,
        email: buyback.customerEmail,
        street1: body.ship?.street ?? "",
        city: body.ship?.city ?? "",
        state: body.ship?.state ?? "",
        zip: body.ship?.zip ?? "",
        country: "US",
      },
    });

    if (!label.ok) {
      return NextResponse.json(
        { error: label.error ?? "Could not generate a shipping label." },
        { status: 502 },
      );
    }
    labelUrl = label.labelUrl;
    tracking = label.trackingNumber;
    carrier = label.carrier;
    await updateBuyback(buyback.id, {
      "Label URL": labelUrl,
      "Tracking Number": tracking,
      Carrier: carrier,
      ...(body.ship
        ? {
            "Ship Street": body.ship.street ?? "",
            "Ship City": body.ship.city ?? "",
            "Ship State": body.ship.state ?? "",
            "Ship Zip": body.ship.zip ?? "",
          }
        : {}),
    });
  }

  await sendLabelEmail(
    { ...buyback, labelUrl, trackingNumber: tracking, carrier },
    labelUrl ?? "",
    tracking ?? "",
    carrier,
  );
  await updateBuyback(buyback.id, { Status: "Label Sent" });

  return NextResponse.json({ ok: true, status: "Label Sent", labelUrl, tracking });
}
