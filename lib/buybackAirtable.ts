/**
 * Airtable data-access layer for the buyback portal.
 *
 * Talks to the dedicated "Witter Coin — Buybacks" base via the REST API
 * (token auth). Three tables:
 *   - BB Customers       (env.AIRTABLE_CUSTOMERS_TABLE)
 *   - BB Buybacks        (env.AIRTABLE_BUYBACKS_TABLE)
 *   - BB Buyback Items   (env.AIRTABLE_ITEMS_TABLE)
 *
 * We use fetch directly (rather than the airtable npm client) so the same code
 * runs in Edge/Node route handlers without extra config.
 */

import { env } from "@/lib/env";
import type {
  BuybackItem,
  BuybackRecord,
  BuybackSource,
  BuybackStatus,
  SellerContact,
} from "@/lib/types";

const API = "https://api.airtable.com/v0";
const CONTENT_API = "https://content.airtable.com/v0";
/** Attachment field on the Buyback Items table that holds the customer's slab photo. */
const PHOTO_FIELD = "Photo";



interface AirtableRecord<T = Record<string, unknown>> {
  id: string;
  createdTime: string;
  fields: T;
}

async function at<T>(
  table: string,
  init: RequestInit & { query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable ${table} ${res.status}: ${body.slice(0, 400)}`);
  }
  return (await res.json()) as T;
}

function atById<T>(table: string, id: string, init: RequestInit = {}): Promise<T> {
  return fetch(`${API}/${env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}/${id}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Airtable ${table}/${id} ${res.status}: ${body.slice(0, 400)}`);
    }
    return (await res.json()) as T;
  });
}

// ---------- Customers ----------

/** Find a customer by email (case-insensitive), or create one. Returns record id. */
export async function upsertCustomer(contact: SellerContact): Promise<string> {
  const email = contact.email.trim().toLowerCase();
  const formula = `LOWER({Email}) = "${email.replace(/"/g, '\\"')}"`;
  const found = await at<{ records: AirtableRecord[] }>(env.AIRTABLE_CUSTOMERS_TABLE, {
    method: "GET",
    query: { filterByFormula: formula, maxRecords: "1" },
  });
  if (found.records.length) return found.records[0].id;

  const created = await at<{ id: string }>(env.AIRTABLE_CUSTOMERS_TABLE, {
    method: "POST",
    body: JSON.stringify({
      fields: {
        Name: contact.name,
        Email: contact.email,
        Phone: contact.phone ?? "",
        "First Buyback": today(),
      },
    }),
  });
  return created.id;
}

/** Has this email sold to us before (more than zero prior buybacks)? */
export async function isRepeatCustomer(email: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const res = await at<{ records: AirtableRecord[] }>(env.AIRTABLE_BUYBACKS_TABLE, {
    method: "GET",
    query: {
      filterByFormula: `LOWER({Customer Email}) = "${e.replace(/"/g, '\\"')}"`,
      maxRecords: "2",
    },
  });
  return res.records.length > 0;
}

// ---------- Buybacks ----------

export interface CreateBuybackInput {
  ref: string;
  contact: SellerContact;
  customerId?: string;
  status: BuybackStatus;
  vip: boolean;
  itemCount: number;
  estimatedValue: number;
  avgCoinValue: number;
  approvalToken: string;
  source: BuybackSource;
  notes?: string;
}

export async function createBuyback(input: CreateBuybackInput): Promise<string> {
  const fields: Record<string, unknown> = {
    Ref: input.ref,
    "Customer Name": input.contact.name,
    "Customer Email": input.contact.email,
    Status: input.status,
    VIP: input.vip,
    "Date Submitted": new Date().toISOString(),
    "Item Count": input.itemCount,
    "Estimated Value": input.estimatedValue,
    "Avg Coin Value": input.avgCoinValue,
    "Approval Token": input.approvalToken,
    Source: input.source,
    Notes: input.notes ?? "",
  };
  if (input.customerId) fields.Customer = [input.customerId];
  const created = await at<{ id: string }>(env.AIRTABLE_BUYBACKS_TABLE, {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
  return created.id;
}

export async function addItems(buybackId: string, items: BuybackItem[]): Promise<void> {
  // Airtable allows max 10 records per create call — chunk it. We keep the
  // created record IDs aligned with the source items so we can attach each
  // coin's photo (if any) right afterward.
  const chunks = chunk(items, 10);
  for (const group of chunks) {
    // Build the field map once per item. We then send it; if Airtable rejects
    // an UNKNOWN_FIELD_NAME (e.g. the base doesn't have "WitterBrick" yet),
    // we strip that one field from every row and retry. This keeps submissions
    // working while staff finish setting up new columns in Airtable.
    const buildFields = (it: BuybackItem, drop: Set<string>) => {
      const all: Record<string, unknown> = {
        Item: it.description?.slice(0, 200) || "Item",
        Buyback: [buybackId],
        Description: it.description ?? "",
        Quantity: it.quantity ?? 1,
        "Grading Service": it.gradingService ?? "",
        "Cert Number": it.certNumber ?? "",
        Year: it.year ?? "",
        Denomination: it.denomination ?? "",
        Grade: it.grade ?? "",
        CAC: Boolean(it.cac),
        WitterBrick: Boolean(it.witterBrick),

        "CDN Bid": it.cdnBid ?? null,
        "CDN Ask": it.cdnAsk ?? null,
        "Dealer Ask": it.dealerAsk ?? null,
        Offer: it.offer ?? null,
        Category: it.category ?? "Raw",
        Notes: it.notes ?? "",
      };
      drop.forEach((k) => {
        delete all[k];
      });
      return all;

    };

    const dropped = new Set<string>();
    let created: { records: { id: string }[] };
    // Retry up to 3x: first try with all fields, then strip any field
    // Airtable doesn't recognize and try again. Bail out after that.
    for (let attempt = 0; ; attempt++) {
      try {
        created = await at<{ records: { id: string }[] }>(env.AIRTABLE_ITEMS_TABLE, {
          method: "POST",
          body: JSON.stringify({
            typecast: true,
            records: group.map((it) => ({ fields: buildFields(it, dropped) })),
          }),
        });
        break;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        const unknown = /UNKNOWN_FIELD_NAME.*"([^"]+)"/.exec(msg);
        if (unknown && attempt < 3) {
          console.warn(
            `[addItems] Airtable rejected unknown field "${unknown[1]}" — stripping and retrying.`,
          );
          dropped.add(unknown[1]);
          continue;
        }
        throw e;
      }
    }


    // Attach photos to the just-created rows. Best-effort: a failed upload
    // must never sink the whole submission, so we swallow per-photo errors.
    await Promise.all(
      group.map((it, i) => {
        const recordId = created.records[i]?.id;
        if (!recordId || !it.photoDataUrl) return Promise.resolve();
        return uploadItemPhoto(recordId, it.photoDataUrl).catch((e) => {
          console.error(`[addItems] photo upload failed for ${recordId}:`, e?.message ?? e);
        });
      }),
    );
  }
}

/**
 * Upload a single base64 data-URL photo to the "Photo" attachment field of a
 * Buyback Items record, using Airtable's content upload API. Files must be
 * under 5 MB (our /sell capture is downscaled to ~1280px JPEG, well under).
 */
export async function uploadItemPhoto(recordId: string, photoDataUrl: string): Promise<void> {
  const m = /^data:([^;]+);base64,(.+)$/.exec(photoDataUrl);
  if (!m) return; // not a data URL — skip silently
  const contentType = m[1] || "image/jpeg";
  const base64 = m[2];
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

  const url = `${CONTENT_API}/${env.AIRTABLE_BASE_ID}/${recordId}/${PHOTO_FIELD}/uploadAttachment`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contentType,
      file: base64,
      filename: `slab-${recordId}.${ext}`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Airtable uploadAttachment ${res.status}: ${body.slice(0, 300)}`);
  }
}


export async function updateBuyback(
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await atById(env.AIRTABLE_BUYBACKS_TABLE, id, {
    method: "PATCH",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

/**
 * Persist per-coin offer amounts on the Buyback Items table. Each entry maps a
 * line-item record id to its (possibly null) offer. Airtable allows up to 10
 * records per PATCH, so we chunk.
 */
export async function updateItemOffers(
  offers: { id: string; offer: number | null }[],
): Promise<void> {
  const valid = offers.filter((o) => o.id);
  if (!valid.length) return;
  const chunks = chunk(valid, 10);
  for (const group of chunks) {
    await at(env.AIRTABLE_ITEMS_TABLE, {
      method: "PATCH",
      body: JSON.stringify({
        typecast: true,
        records: group.map((o) => ({
          id: o.id,
          fields: { Offer: o.offer ?? null },
        })),
      }),
    });
  }
}


export async function getBuyback(id: string): Promise<BuybackRecord | null> {
  try {
    const rec = await atById<AirtableRecord>(env.AIRTABLE_BUYBACKS_TABLE, id);
    return mapBuyback(rec);
  } catch {
    return null;
  }
}

/** Look up a buyback by its public approval token (for the customer offer page). */
export async function getBuybackByToken(token: string): Promise<BuybackRecord | null> {
  const res = await at<{ records: AirtableRecord[] }>(env.AIRTABLE_BUYBACKS_TABLE, {
    method: "GET",
    query: {
      filterByFormula: `{Approval Token} = "${token.replace(/"/g, '\\"')}"`,
      maxRecords: "1",
    },
  });
  if (!res.records.length) return null;
  return mapBuyback(res.records[0]);
}

export async function listBuybacks(opts: { status?: BuybackStatus } = {}): Promise<BuybackRecord[]> {
  const query: Record<string, string> = {
    pageSize: "100",
    "sort[0][field]": "Date Submitted",
    "sort[0][direction]": "desc",
  };
  if (opts.status) query.filterByFormula = `{Status} = "${opts.status}"`;
  const res = await at<{ records: AirtableRecord[] }>(env.AIRTABLE_BUYBACKS_TABLE, {
    method: "GET",
    query,
  });
  return res.records.map(mapBuyback);
}

/**
 * Fetch the line items for a buyback.
 *
 * The Items table's `Buyback` field is a *linked record* field. ARRAYJOIN on a
 * linked field yields the linked records' PRIMARY field values (the buyback
 * `Ref`, e.g. "WB-PCQN9") — NOT their record IDs. So we match on the Ref, with
 * a fallback to the record-id match for safety.
 */
export async function listItems(
  buybackId: string,
  ref?: string,
): Promise<BuybackItem[]> {
  const needles: string[] = [];
  if (ref) needles.push(`FIND("${ref.replace(/"/g, '\\"')}", ARRAYJOIN({Buyback})) > 0`);
  needles.push(`FIND("${buybackId}", ARRAYJOIN({Buyback})) > 0`);
  const formula = needles.length > 1 ? `OR(${needles.join(",")})` : needles[0];

  const res = await at<{ records: AirtableRecord[] }>(env.AIRTABLE_ITEMS_TABLE, {
    method: "GET",
    query: {
      filterByFormula: formula,
      pageSize: "100",
    },
  });

  return res.records.map((r) => {
    const f = r.fields as Record<string, any>;
    return {
      id: r.id,
      description: f["Description"] ?? "",
      quantity: f["Quantity"] ?? 1,
      gradingService: f["Grading Service"] ?? "",
      certNumber: f["Cert Number"] ?? "",
      year: f["Year"] ?? "",
      denomination: f["Denomination"] ?? "",
      grade: f["Grade"] ?? "",
      cac: Boolean(f["CAC"]),
      witterBrick: Boolean(f["WitterBrick"]),
      cdnBid: f["CDN Bid"] ?? null,

      cdnAsk: f["CDN Ask"] ?? null,
      dealerAsk: f["Dealer Ask"] ?? null,
      offer: f["Offer"] ?? null,
      category: f["Category"] ?? "Raw",
      notes: f["Notes"] ?? "",
    } satisfies BuybackItem;
  });
}

// ---------- mappers / utils ----------

/**
 * Airtable returns array values for lookup / rollup / multi-select fields. The
 * Buybacks table's `Customer Name` and `Customer Email` may be plain strings
 * (when they were written directly on createBuyback) OR arrays (when the base
 * was configured to look those up from the linked Customer record). Normalize
 * to a single string so the rest of the app can rely on `string`.
 */
function asString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(asString).filter(Boolean).join(", ");
  if (typeof v === "object" && "email" in (v as any)) return String((v as any).email ?? "");
  return "";
}

function mapBuyback(rec: AirtableRecord): BuybackRecord {
  const f = rec.fields as Record<string, any>;
  return {
    id: rec.id,
    ref: asString(f["Ref"]),
    customerName: asString(f["Customer Name"]),
    customerEmail: asString(f["Customer Email"]).trim(),

    status: (f["Status"] ?? "New") as BuybackStatus,
    vip: Boolean(f["VIP"]),
    dateSubmitted: f["Date Submitted"] ?? rec.createdTime,
    dateReceived: f["Date Received"] ?? null,
    itemCount: f["Item Count"] ?? 0,
    estimatedValue: f["Estimated Value"] ?? 0,
    offerAmount: f["Offer Amount"] ?? null,
    marginPct: f["Margin %"] ?? null,
    avgCoinValue: f["Avg Coin Value"] ?? null,
    approvalToken: f["Approval Token"] ?? "",
    offerSentAt: f["Offer Sent At"] ?? null,
    approvedAt: f["Approved At"] ?? null,
    trackingNumber: f["Tracking Number"] ?? null,
    labelUrl: f["Label URL"] ?? null,
    carrier: f["Carrier"] ?? null,
    source: (f["Source"] ?? "Web Form") as BuybackSource,
    notes: f["Notes"] ?? "",
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
