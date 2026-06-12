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
 *
 * Error handling note:
 *   This endpoint is hit directly by a customer from /offer/[token] — when it
 *   blows up they only see a "502 Bad Gateway" with no detail in the browser
 *   console. To make debugging tractable we:
 *     1) wrap the whole body in a try/catch and serialize any thrown error
 *        into `{ error, hint }` JSON, so the frontend's setError(...) shows
 *        the actual reason ("FedEx didn't return a 2 Day rate", etc.);
 *     2) console.error every failure path with [offer.approve] prefix so
 *        Vercel function logs show the stack;
 *     3) validate the ship-to address (the customer's own address) BEFORE
 *        hitting Shippo so we fail fast with a clean message rather than
 *        bubbling up a cryptic Shippo 400.
 */

import { NextResponse } from "next/server";
import { getBuybackByToken, updateBuyback } from "@/lib/buybackAirtable";
import { createInboundLabel } from "@/lib/shippo";
import { sendLabelEmail } from "@/lib/email";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Shippo's combined POST /shipments/ + POST /transactions/ round-trip can
// occasionally exceed the default 10s hobby-plan limit on cold starts,
// causing Vercel's edge to return a generic 502 with an HTML body that
// hides our nice JSON error. Bumping to 60s gives Shippo room to respond.
// (On hobby plans Vercel silently caps at 10s; on Pro/Enterprise this
// actually takes effect.)
export const maxDuration = 60;

interface Body {
  decision?: "accept" | "decline";
  ship?: {
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
}

/**
 * Confirm our receiving address (the address the label ships *to*) is fully
 * configured in env. If not, Shippo will reject the shipment with a vague
 * address-validation error — we'd rather surface a precise "SHIP_TO_STREET
 * not set" message that points the operator to the fix.
 */
function checkReceivingAddress(): string | null {
  const missing: string[] = [];
  if (!env.SHIP_TO_STREET) missing.push("SHIP_TO_STREET");
  if (!env.SHIP_TO_CITY) missing.push("SHIP_TO_CITY");
  if (!env.SHIP_TO_STATE) missing.push("SHIP_TO_STATE");
  if (!env.SHIP_TO_ZIP) missing.push("SHIP_TO_ZIP");
  // FedEx requires a phone number on every shipment.
  if (!env.SHIP_TO_PHONE) missing.push("SHIP_TO_PHONE");
  if (missing.length) {
    return `Server is missing our receiving address (${missing.join(", ")}). Set these env vars in Vercel and redeploy.`;
  }
  return null;
}

/** Basic shape-check on the customer's ship-from address. */
function checkCustomerAddress(s?: Body["ship"]): string | null {
  if (!s) return "Please enter your shipping address.";
  const fields = [
    ["street", s.street],
    ["city", s.city],
    ["state", s.state],
    ["zip", s.zip],
  ] as const;
  for (const [name, v] of fields) {
    if (!v || !v.trim()) return `Please fill in your ${name}.`;
  }
  if (!/^\d{5}(-\d{4})?$/.test((s.zip ?? "").trim())) {
    return "ZIP code should be 5 digits (or 5+4).";
  }
  if ((s.state ?? "").trim().length !== 2) {
    return "State should be the 2-letter code (e.g. CA).";
  }
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  try {
    let body: Body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const buyback = await getBuybackByToken(params.token);
    if (!buyback) {
      return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    }

    if (buyback.status === "Declined") {
      return NextResponse.json({ ok: true, status: "Declined" });
    }

    if (body.decision === "decline") {
      await updateBuyback(buyback.id, { Status: "Declined" });
      return NextResponse.json({ ok: true, status: "Declined" });
    }

    // ---- Accept path ----

    // Pre-flight checks so we don't waste a Shippo API call when env or
    // the customer's address is obviously wrong.
    const recvErr = checkReceivingAddress();
    if (recvErr) {
      console.error("[offer.approve] receiving address misconfigured:", recvErr);
      return NextResponse.json({ error: recvErr }, { status: 500 });
    }
    const fromErr = checkCustomerAddress(body.ship);
    if (fromErr) {
      return NextResponse.json({ error: fromErr }, { status: 400 });
    }

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
        console.error("[offer.approve] Shippo label failed:", label.error);
        return NextResponse.json(
          { error: label.error ?? "Could not generate a shipping label." },
          { status: 502 },
        );
      }
      labelUrl = label.labelUrl;
      tracking = label.trackingNumber;
      carrier = label.carrier;
      // Note: we intentionally do not persist the customer's ship-from address
      // back to Airtable — Shippo has it on the label and the table doesn't have
      // those columns. If we ever want it stored, add Ship Street/City/State/Zip
      // fields to the Buybacks base and re-include them here.
      await updateBuyback(buyback.id, {
        "Label URL": labelUrl,
        "Tracking Number": tracking,
        Carrier: carrier,
      });
    }

    // Send the email but do NOT block the response on email failures — if
    // SendGrid hiccups we still want the customer to see the success page
    // with the download button. Log so staff can resend manually if needed.
    try {
      await sendLabelEmail(
        { ...buyback, labelUrl, trackingNumber: tracking, carrier },
        labelUrl ?? "",
        tracking ?? "",
        carrier,
      );
    } catch (e: any) {
      console.error("[offer.approve] sendLabelEmail failed:", e?.message ?? e);
    }

    await updateBuyback(buyback.id, { Status: "Label Sent" });

    return NextResponse.json({
      ok: true,
      status: "Label Sent",
      labelUrl,
      tracking,
    });
  } catch (e: any) {
    // Catch-all so the customer never sees a generic 502 from Vercel — they
    // get a JSON body with a real reason instead.
    console.error("[offer.approve] unhandled error:", e?.stack ?? e?.message ?? e);
    return NextResponse.json(
      { error: e?.message ?? "Something went wrong on the server." },
      { status: 500 },
    );
  }
}
