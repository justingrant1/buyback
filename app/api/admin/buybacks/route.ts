/**
 * GET /api/admin/buybacks
 *
 * Returns all buybacks, sorted into Marley's priority queue (VIP + value + age),
 * so the highest-leverage batches surface first. Optional ?status= filter.
 */

import { NextResponse } from "next/server";
import { listBuybacks } from "@/lib/buybackAirtable";
import { priorityScore } from "@/lib/pricing";
import type { BuybackStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as BuybackStatus | null;

  try {
    const rows = await listBuybacks(status ? { status } : {});
    const withScore = rows
      .map((b) => ({
        ...b,
        priority: priorityScore({
          vip: b.vip,
          estimatedValue: b.estimatedValue,
          dateSubmitted: b.dateSubmitted,
        }),
      }))
      .sort((a, b) => b.priority - a.priority);
    return NextResponse.json({ buybacks: withScore });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to load" }, { status: 500 });
  }
}
