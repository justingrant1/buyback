/**
 * GET    /api/admin/buybacks/:id   -> buyback + its line items
 * PATCH  /api/admin/buybacks/:id   -> update status / offer / per-line offers
 *
 * The PATCH handler recomputes the batch offer + margin from the line offers
 * (or an explicit offerAmount), keeping Airtable's summary fields in sync.
 */

import { NextResponse } from "next/server";
import {
  getBuyback,
  listItems,
  updateBuyback,
} from "@/lib/buybackAirtable";
import { batchMargin } from "@/lib/pricing";
import type { BuybackStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const buyback = await getBuyback(params.id);
  if (!buyback) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const items = await listItems(params.id, buyback.ref);
  return NextResponse.json({ buyback, items });

}

interface PatchBody {
  status?: BuybackStatus;
  offerAmount?: number;
  notes?: string;
  dateReceived?: string;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = await getBuyback(params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fields: Record<string, unknown> = {};
  if (body.status) fields.Status = body.status;
  if (body.notes != null) fields.Notes = body.notes;
  if (body.dateReceived) fields["Date Received"] = body.dateReceived;

  if (typeof body.offerAmount === "number") {
    fields["Offer Amount"] = body.offerAmount;
    fields["Margin %"] = Number(
      (batchMargin(existing.estimatedValue, body.offerAmount) * 100).toFixed(2),
    );
  }

  try {
    await updateBuyback(params.id, fields);
    const updated = await getBuyback(params.id);
    return NextResponse.json({ buyback: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 });
  }
}
