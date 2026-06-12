/**
 * Shipping-label creation behind a small interface.
 *
 * Uses Shippo's REST API to buy a prepaid FedEx label that the customer uses to
 * ship coins to us. Service tier is selected based on the offer amount:
 *   - Offer  < $5,000  -> FedEx 2 Day
 *   - Offer >= $5,000  -> FedEx Standard Overnight
 *
 * When SHIPPO_API_TOKEN is not set (e.g. before the key is provided), this
 * degrades to a deterministic STUB so the rest of the flow — emails, Airtable
 * updates, the admin UI — can be built and tested end-to-end without a live
 * account.
 *
 * Swap in the real account by setting SHIPPO_API_TOKEN and the SHIP_TO_* vars.
 */

import { env, hasShippoCreds } from "@/lib/env";

export interface ShipFromAddress {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
  email?: string;
}

export interface LabelResult {
  ok: boolean;
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
  service: string;
  cost?: number;
  stub: boolean;
  error?: string;
}

const SHIPPO_API = "https://api.goshippo.com";

/** Offer value at/above which we ship Standard Overnight instead of 2 Day. */
const OVERNIGHT_THRESHOLD_USD = 5000;

/**
 * Minimum offer amount that qualifies for a prepaid FedEx label. Anything
 * below this is cheap enough that the customer ships at their own expense
 * to our SF address — we email them instructions instead of buying a label.
 */
export const PREPAID_LABEL_THRESHOLD_USD = 2000;

/**
 * Single source of truth for which shipment treatment an offer gets.
 * Used by both the approve route (to decide whether to call Shippo) and the
 * offer page (to decide whether to render the address form).
 */
export type ShipmentPlan =
  | { kind: "self_ship" } // < $2,000 — customer mails at their own cost
  | { kind: "fedex_2day" } //  $2,000 – $4,999
  | { kind: "fedex_overnight" }; // >= $5,000

export function shipmentPlanForOffer(offerAmount?: number | null): ShipmentPlan {
  const amt = offerAmount ?? 0;
  if (amt < PREPAID_LABEL_THRESHOLD_USD) return { kind: "self_ship" };
  if (amt >= OVERNIGHT_THRESHOLD_USD) return { kind: "fedex_overnight" };
  return { kind: "fedex_2day" };
}

/**
 * Pick the FedEx service tier based on the offer amount.
 *  - >= $5,000  => FedEx Standard Overnight
 *  - otherwise  => FedEx 2 Day
 */
export function fedexServiceForOffer(offerAmount?: number | null): {
  token: "fedex_2_day" | "fedex_standard_overnight";
  label: string;
  match: RegExp;
} {
  if ((offerAmount ?? 0) >= OVERNIGHT_THRESHOLD_USD) {
    return {
      token: "fedex_standard_overnight",
      label: "FedEx Standard Overnight",
      match: /standard.?overnight/i,
    };
  }
  return {
    token: "fedex_2_day",
    label: "FedEx 2 Day",
    match: /2.?day/i,
  };
}

/**
 * Create a prepaid inbound label (customer -> us). `from` is the customer.
 * `parcelOz` lets you size the box; defaults to a small padded mailer.
 * `offerAmount` selects FedEx tier: <$5k => 2 Day, >=$5k => Standard Overnight.
 */
export async function createInboundLabel(opts: {
  from: ShipFromAddress;
  parcelOz?: number;
  reference?: string;
  offerAmount?: number | null;
}): Promise<LabelResult> {
  const to = ourReceivingAddress();
  const svc = fedexServiceForOffer(opts.offerAmount);

  if (!hasShippoCreds()) {
    // ---- STUB MODE ----
    const fake = `STUB${Date.now().toString().slice(-10)}`;
    return {
      ok: true,
      trackingNumber: fake,
      labelUrl: `https://example.com/stub-label/${fake}.pdf`,
      carrier: "FedEx",
      service: svc.label,
      cost: 0,
      stub: true,
    };
  }


  try {
    // 1. Create a shipment and request only the FedEx service tier we want.
    //    Carrier-account filtering would be more precise, but service-level
    //    filtering works without us caching the FedEx carrier_account id here.
    const shipment = await shippoPost("/shipments/", {
      address_from: toShippoAddress(opts.from),
      address_to: toShippoAddress(to),
      parcels: [
        {
          length: "9",
          width: "6",
          height: "3",
          distance_unit: "in",
          weight: String(opts.parcelOz ?? 16),
          mass_unit: "oz",
        },
      ],
      async: false,
      metadata: opts.reference ?? "",
    });

    const rates: any[] = shipment.rates ?? [];
    if (!rates.length) {
      // Shippo sometimes returns a shipment with status="QUEUED" and no rates
      // when the address fails validation, or returns `messages` describing
      // why no carrier could quote. Surface those — they're the most useful
      // signal for diagnosing why a label can't be created.
      const messages = (shipment.messages ?? [])
        .map((m: any) => `${m.source ?? ""}: ${m.text ?? m.code ?? JSON.stringify(m)}`)
        .filter(Boolean)
        .join(" | ");
      console.error(
        "[shippo] no rates returned. shipment.status=%s messages=%s addressFrom=%j addressTo=%j",
        shipment.status,
        messages || "(none)",
        toShippoAddress(opts.from),
        toShippoAddress(to),
      );
      return errLabel(
        messages
          ? `Shipping carrier rejected this address: ${messages}`
          : "No Shippo rates returned for this address. Please double-check the street, city, state, and ZIP.",
      );
    }

    // FedEx ONLY — never fall back to another carrier. Pick the tier based on
    // offer amount (2 Day vs Standard Overnight).
    const fedexRates = rates.filter((r) => /fedex/i.test(r.provider));
    if (!fedexRates.length) {
      // Dump everything we can to diagnose why FedEx silently dropped from
      // the rate list while other carriers returned. Shippo records the
      // per-carrier failure reason on shipment.messages[] (e.g. "FedEx:
      // Address could not be verified" or "FedEx account not authorized").
      const messages = (shipment.messages ?? [])
        .map((m: any) => `${m.source ?? ""}: ${m.text ?? m.code ?? JSON.stringify(m)}`)
        .filter(Boolean);
      const carriers = await listCarrierAccounts().catch(() => null);
      const fedexAccounts = carriers
        ? carriers
            .filter((c: any) => /fedex/i.test(c.carrier))
            .map((c: any) => ({
              object_id: c.object_id,
              carrier: c.carrier,
              account_id: c.account_id,
              active: c.active,
              test: c.test,
              parameters_keys: Object.keys(c.parameters ?? {}),
            }))
        : "(could not fetch /carrier_accounts/)";
      console.error(
        "[shippo] no FedEx rates. providers=%j shipment.status=%s shipment.messages=%j fedexAccounts=%j addressFrom=%j addressTo=%j",
        rates.map((r) => `${r.provider}/${r.servicelevel?.name ?? r.servicelevel?.token ?? "?"}`),
        shipment.status,
        messages,
        fedexAccounts,
        toShippoAddress(opts.from),
        toShippoAddress(to),
      );
      // Surface Shippo's own message verbatim if we have one — that's the
      // FedEx-side reason and is the only thing that will actually unblock us.
      const fedexMsg = messages.find((m: string) => /fedex/i.test(m));
      return errLabel(
        fedexMsg
          ? `FedEx rejected this shipment: ${fedexMsg}`
          : "No FedEx rates returned for this address. Check Vercel logs for the [shippo] diagnostic line — it includes Shippo's per-carrier messages and the connected FedEx account info.",
      );
    }

    // Match the exact tier we want. If FedEx didn't return it for some reason,
    // refuse to fall back to a slower service for $5k+ shipments — surface the
    // error so staff can intervene rather than silently shipping 2-day on a
    // high-value buyback.
    const preferred = fedexRates.find(
      (r) =>
        svc.match.test(r.servicelevel?.name ?? "") ||
        r.servicelevel?.token === svc.token,
    );

    if (!preferred) {
      console.error(
        "[shippo] FedEx tier %s not in returned rates: %j",
        svc.label,
        fedexRates.map((r) => r.servicelevel?.name ?? r.servicelevel?.token ?? "?"),
      );
      return errLabel(
        `FedEx did not return a "${svc.label}" rate for this address. ` +
          `Available tiers: ${fedexRates
            .map((r) => r.servicelevel?.name ?? r.servicelevel?.token ?? "?")
            .join(", ")}.`,
      );
    }



    // 2. Buy the label (transaction).
    const tx = await shippoPost("/transactions/", {
      rate: preferred.object_id,
      label_file_type: "PDF",
      async: false,
    });

    if (tx.status !== "SUCCESS") {
      return errLabel(`Shippo transaction failed: ${JSON.stringify(tx.messages ?? tx.status)}`);
    }

    return {
      ok: true,
      trackingNumber: tx.tracking_number,
      labelUrl: tx.label_url,
      carrier: preferred.provider,
      service: preferred.servicelevel?.name ?? "",
      cost: Number(preferred.amount) || undefined,
      stub: false,
    };
  } catch (e: any) {
    return errLabel(e?.message ?? "Unknown Shippo error");
  }
}

function ourReceivingAddress(): ShipFromAddress {
  return {
    name: env.SHIP_TO_NAME,
    street1: env.SHIP_TO_STREET,
    city: env.SHIP_TO_CITY,
    state: env.SHIP_TO_STATE,
    zip: env.SHIP_TO_ZIP,
    country: "US",
    phone: env.SHIP_TO_PHONE,
    email: env.SHIP_TO_EMAIL,
  };
}

function toShippoAddress(a: ShipFromAddress) {
  return {
    name: a.name,
    street1: a.street1,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country ?? "US",
    phone: a.phone ?? "",
    email: a.email ?? "",
  };
}

async function shippoPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${SHIPPO_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `ShippoToken ${env.SHIPPO_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Shippo ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

async function shippoGet(path: string): Promise<any> {
  const res = await fetch(`${SHIPPO_API}${path}`, {
    method: "GET",
    headers: {
      Authorization: `ShippoToken ${env.SHIPPO_API_TOKEN}`,
    },
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Shippo GET ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Diagnostic helper: list every carrier account connected to the Shippo
 * account this API token belongs to. Used only when FedEx silently drops
 * out of a rate response — we log what the API actually sees so we can
 * tell whether the FedEx account is connected at all (vs. just toggled
 * in the UI) and whether it's flagged active/test.
 */
async function listCarrierAccounts(): Promise<any[]> {
  const j = await shippoGet("/carrier_accounts/");
  return Array.isArray(j.results) ? j.results : [];
}

function errLabel(error: string): LabelResult {
  return {
    ok: false,
    trackingNumber: "",
    labelUrl: "",
    carrier: "",
    service: "",
    stub: false,
    error,
  };
}
