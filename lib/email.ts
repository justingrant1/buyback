/**
 * Transactional email via SendGrid.
 *
 * Two templates, both built inline (no SendGrid dynamic templates needed):
 *   - offerEmail   : itemized bid sheet + an "Approve / Decline" link
 *   - labelEmail   : the prepaid shipping label after a customer approves
 *
 * Degrades to a logged STUB when SENDGRID_API_KEY is unset so the rest of the
 * flow works in development.
 */

import { env, hasSendgridCreds } from "@/lib/env";
import type { BuybackItem, BuybackRecord } from "@/lib/types";

const SENDGRID_API = "https://api.sendgrid.com/v3/mail/send";

export interface SendResult {
  ok: boolean;
  stub: boolean;
  error?: string;
}

async function send(opts: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  if (!hasSendgridCreds()) {
    console.log(`[email STUB] -> ${opts.to} :: ${opts.subject}`);
    return { ok: true, stub: true };
  }
  try {
    const res = await fetch(SENDGRID_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          { to: [{ email: opts.to, name: opts.toName ?? opts.to }] },
        ],
        from: { email: env.SENDGRID_FROM_EMAIL, name: env.SENDGRID_FROM_NAME },
        subject: opts.subject,
        content: [
          { type: "text/plain", value: opts.text },
          { type: "text/html", value: opts.html },
        ],
      }),
    });
    if (!res.ok && res.status !== 202) {
      const t = await res.text().catch(() => "");
      return { ok: false, stub: false, error: `SendGrid ${res.status}: ${t.slice(0, 300)}` };
    }
    return { ok: true, stub: false };
  } catch (e: any) {
    return { ok: false, stub: false, error: e?.message ?? "Unknown SendGrid error" };
  }
}

/** The offer / bid-sheet email with an approve link. */
export async function sendOfferEmail(
  buyback: BuybackRecord,
  items: BuybackItem[],
): Promise<SendResult> {
  const url = `${env.APP_BASE_URL}/offer/${buyback.approvalToken}`;
  const money = (n?: number | null) =>
    n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const rows = items
    .map(
      (it) => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(it.description)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${it.quantity}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${escapeHtml(it.grade ?? "")}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${money(it.offer)}</td>
      </tr>`,
    )
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <h2 style="color:#155e75">Witter Coin — Your Buyback Offer</h2>
    <p>Hi ${escapeHtml(buyback.customerName || "there")},</p>
    <p>Thanks for sending in your coins. Our total bid for your coins is
       <strong style="font-size:20px;color:#0e7490">${money(buyback.offerAmount)}</strong>.
       The itemized breakdown is below.</p>
    <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px">
      <thead>
        <tr style="background:#f1f5f9">
          <th style="padding:8px 10px;text-align:left">Coin</th>
          <th style="padding:8px 10px">Qty</th>
          <th style="padding:8px 10px;text-align:left">Grade</th>
          <th style="padding:8px 10px;text-align:right">Offer</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:24px 0">
      <a href="${url}"
         style="background:#0e7490;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
         Review &amp; Approve Your Offer
      </a>
    </p>
    <p style="color:#475569;font-size:13px">Once you approve, we'll email you a prepaid FedEx shipping label.
       Reference: ${escapeHtml(buyback.ref)}</p>
    <p>Best,<br/>Marley<br/>Witter Coin Buybacks</p>
  </div>`;

  const text = `Witter Coin — Your Buyback Offer
Hi ${buyback.customerName || "there"},

Our total bid for your coins is ${money(buyback.offerAmount)}.

Review & approve here: ${url}

Reference: ${buyback.ref}

Best,
Marley — Witter Coin Buybacks`;

  return send({
    to: buyback.customerEmail,
    toName: buyback.customerName,
    subject: `Your Witter Coin buyback offer — ${money(buyback.offerAmount)}`,
    html,
    text,
  });
}

/** The prepaid label email sent after the customer approves. */
export async function sendLabelEmail(
  buyback: BuybackRecord,
  labelUrl: string,
  trackingNumber: string,
  carrier: string,
): Promise<SendResult> {
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a">
    <h2 style="color:#155e75">Your Prepaid Shipping Label</h2>
    <p>Hi ${escapeHtml(buyback.customerName || "there")},</p>
    <p>Thanks for approving your offer! Here is your prepaid ${escapeHtml(carrier)} label.</p>
    <p style="margin:24px 0">
      <a href="${labelUrl}" style="background:#0e7490;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">
        Download Shipping Label (PDF)
      </a>
    </p>
    <p>Tracking number: <strong>${escapeHtml(trackingNumber)}</strong></p>
    <p style="color:#475569;font-size:13px">Please pack your coins securely and drop off at any ${escapeHtml(carrier)} location.
       Reference: ${escapeHtml(buyback.ref)}</p>
    <p>Best,<br/>Marley<br/>Witter Coin Buybacks</p>
  </div>`;

  const text = `Your Prepaid Shipping Label
Download: ${labelUrl}
Tracking: ${trackingNumber} (${carrier})
Reference: ${buyback.ref}`;

  return send({
    to: buyback.customerEmail,
    toName: buyback.customerName,
    subject: `Your prepaid shipping label — ${buyback.ref}`,
    html,
    text,
  });
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
