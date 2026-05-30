/**
 * POST /api/parse-spreadsheet
 *
 * Accepts a customer-uploaded coin list (CSV / XLSX / XLS) as multipart
 * form-data (field name "file"), and returns clean BuybackItem[] ready to drop
 * into the /sell form for the customer to review before submitting.
 *
 * Pipeline:
 *   1. parseSpreadsheet()  — file buffer -> { headers, rows } (SheetJS).
 *   2. aiColumnMap()       — Claude maps their columns -> our fields (1 call).
 *      fuzzyColumnMap()    — keyword fallback if AI is unavailable/failed.
 *   3. rowsToItems()       — apply the map to every row, infer categories.
 *
 * Resilient by design: any AI failure silently falls back to fuzzy mapping so
 * upload always works, even with no Anthropic key configured.
 */

import { NextResponse } from "next/server";
import {
  parseSpreadsheet,
  fuzzyColumnMap,
  rowsToItems,
} from "@/lib/spreadsheet";
import { aiColumnMap } from "@/lib/csvMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = /\.(csv|xlsx|xls)$/i;

export async function POST(req: Request) {
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Expected multipart form-data with a 'file'." }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8 MB)." }, { status: 413 });
  }
  if (file.name && !ALLOWED.test(file.name)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a .csv, .xlsx, or .xls file." },
      { status: 415 },
    );
  }

  let table;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    table = parseSpreadsheet(buf, file.name);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not read that file: ${e?.message ?? "parse error"}` },
      { status: 422 },
    );
  }

  if (!table.headers.length || !table.rows.length) {
    return NextResponse.json(
      { error: "We couldn't find any rows in that spreadsheet." },
      { status: 422 },
    );
  }

  // Map columns: AI first, fuzzy fallback.
  let usedAi = false;
  let mapNote: string | undefined;
  let map = (await aiColumnMap(table.headers, table.rows).then((r) => {
    if (r) {
      usedAi = true;
      mapNote = r.note;
      return r.map;
    }
    return null;
  })) ?? fuzzyColumnMap(table.headers);

  const items = rowsToItems(table.rows, map);

  if (!items.length) {
    return NextResponse.json(
      { error: "We read the file but couldn't pull any coins out of it. Try adding it manually." },
      { status: 422 },
    );
  }

  const needCategory = items.filter((i) => !i.category).length;
  const summary =
    `Read ${items.length} coin${items.length === 1 ? "" : "s"} from “${file.name}”` +
    (usedAi ? "" : " (matched columns automatically)") +
    (needCategory ? ` — double-check ${needCategory} that need a type.` : ".");

  return NextResponse.json({
    items,
    summary,
    usedAi,
    mapNote,
    columnsMapped: Object.keys(map).length,
    headers: table.headers,
  });
}
