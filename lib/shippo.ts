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
      return errLabel("No Shippo rates returned for this address.");
    }

    // FedEx ONLY — never fall back to another carrier. Pick the tier based on
    // offer amount (2 Day vs Standard Overnight).
    const fedexRates = rates.filter((r) => /fedex/i.test(r.provider));
    if (!fedexRates.length) {
      return errLabel(
        "No FedEx rates available for this address. Verify a FedEx carrier account is connected in Shippo.",
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
