/**
 * Shipping-label creation behind a small interface.
 *
 * Uses Shippo's REST API to buy a prepaid FedEx (or cheapest) label that the
 * customer uses to ship coins to us. When SHIPPO_API_TOKEN is not set (e.g.
 * before the key is provided), this degrades to a deterministic STUB so the
 * rest of the flow — emails, Airtable updates, the admin UI — can be built and
 * tested end-to-end without a live account.
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

/**
 * Create a prepaid inbound label (customer -> us). `from` is the customer.
 * `parcelOz` lets you size the box; defaults to a small padded mailer.
 */
export async function createInboundLabel(opts: {
  from: ShipFromAddress;
  parcelOz?: number;
  reference?: string;
}): Promise<LabelResult> {
  const to = ourReceivingAddress();

  if (!hasShippoCreds()) {
    // ---- STUB MODE ----
    const fake = `STUB${Date.now().toString().slice(-10)}`;
    return {
      ok: true,
      trackingNumber: fake,
      labelUrl: `https://example.com/stub-label/${fake}.pdf`,
      carrier: "FedEx",
      service: "FEDEX_2_DAY",
      cost: 0,
      stub: true,
    };
  }

  try {
    // 1. Create a shipment to get rates.
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
    // Prefer FedEx 2-day-ish; otherwise cheapest.
    const preferred =
      rates.find((r) => /fedex/i.test(r.provider) && /2.?day/i.test(r.servicelevel?.name ?? "")) ??
      rates.sort((a, b) => Number(a.amount) - Number(b.amount))[0];

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
