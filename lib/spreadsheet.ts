/**
 * Spreadsheet ingestion for customer-uploaded buyback lists.
 *
 * Customers send their coins in whatever spreadsheet they already keep — any
 * column order, any header names, CSV or Excel. This module turns that file
 * into a clean { headers, rows } table, then maps the columns onto our
 * BuybackItem fields.
 *
 * Column mapping has two strategies:
 *   1. AI (lib/csvMap.ts) — a single Claude tool-use call that reads the
 *      headers + a few sample rows and returns a column->field map. Preferred.
 *   2. Fuzzy fallback (here) — synonym/keyword header matching. Used when
 *      there's no Anthropic key or the AI call fails, so upload always works.
 *
 * The mapping is applied to every row locally (one AI call regardless of file
 * size), then rows are coerced into BuybackItem[] with per-row category
 * inference. The customer reviews/edits the result in the form before submit.
 */

import * as XLSX from "xlsx";
import type { BuybackItem, ItemCategory } from "@/lib/types";

/** Our canonical target fields a spreadsheet column can map to. */
export type TargetField =
  | "description"
  | "quantity"
  | "gradingService"
  | "certNumber"
  | "year"
  | "denomination"
  | "grade"
  | "cac"
  | "category"
  | "dealerAsk"
  | "faceValue";

/** header (verbatim from the file) -> our field. Unmapped headers are dropped. */
export type ColumnMap = Partial<Record<string, TargetField>>;

export interface ParsedTable {
  headers: string[];
  /** Row objects keyed by header string. */
  rows: Record<string, string>[];
}

const CATEGORIES: ItemCategory[] = ["Slab", "Raw", "Junk Silver", "Gold", "World"];

/**
 * Parse an uploaded CSV / XLSX / XLS buffer into a header + row table.
 * SheetJS reads all three formats through the same API.
 */
export function parseSpreadsheet(buf: Buffer, filename?: string): ParsedTable {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = wb.Sheets[sheetName];

  // header:1 gives us an array-of-arrays so we control header handling and
  // can tolerate junk/blank leading rows.
  const matrix: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  if (!matrix.length) return { headers: [], rows: [] };

  const headerRowIdx = findHeaderRow(matrix);
  const rawHeaders = (matrix[headerRowIdx] ?? []).map((h) => String(h ?? "").trim());
  // De-duplicate / fill blank headers so row keys are unique.
  const headers = rawHeaders.map((h, i) => (h ? h : `Column ${i + 1}`));

  const rows: Record<string, string>[] = [];
  for (let r = headerRowIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    if (cells.every((c) => String(c ?? "").trim() === "")) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = String(cells[i] ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Heuristic: the header row is the first row (within the first 5) whose cells
 * are mostly non-empty, non-numeric text. Falls back to row 0.
 */
function findHeaderRow(matrix: any[][]): number {
  const limit = Math.min(5, matrix.length);
  let best = 0;
  let bestScore = -1;
  for (let r = 0; r < limit; r++) {
    const cells = (matrix[r] ?? []).map((c) => String(c ?? "").trim());
    const nonEmpty = cells.filter(Boolean);
    if (!nonEmpty.length) continue;
    const textual = nonEmpty.filter((c) => !/^-?\d[\d.,]*$/.test(c)).length;
    const score = textual; // more text-like cells => more likely a header
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Fuzzy header matcher (no-AI fallback)
 * ------------------------------------------------------------------ */

const FIELD_SYNONYMS: Record<TargetField, RegExp> = {
  description: /\b(desc|description|item|coin|name|title|details?|product)\b/i,
  quantity: /\b(qty|quantity|count|pcs|pieces|amount|#)\b/i,
  gradingService: /\b(grading\s*service|service|tpg|holder|graded\s*by|slabbed\s*by|company)\b/i,
  certNumber: /\b(cert|certification|serial|barcode)\b/i,
  year: /\b(year|date)\b/i,
  denomination: /\b(denom|denomination|type|series)\b/i,
  grade: /\b(grade|condition|ms|pr|pf)\b/i,
  cac: /\b(cac|sticker|bean)\b/i,
  category: /\b(category|kind|class|metal)\b/i,
  dealerAsk: /\b(ask|asking|price|my\s*price|your\s*price|reserve|wanted)\b/i,
  faceValue: /\b(face|face\s*value)\b/i,
};

/**
 * Best-effort header->field mapping using synonyms. Each field claims at most
 * one header (its best match), and each header maps to at most one field.
 */
export function fuzzyColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const taken = new Set<string>();

  // Order matters: more specific fields first so "price" doesn't steal from
  // "face value", etc.
  const order: TargetField[] = [
    "certNumber",
    "gradingService",
    "faceValue",
    "denomination",
    "quantity",
    "year",
    "cac",
    "grade",
    "category",
    "dealerAsk",
    "description",
  ];

  for (const field of order) {
    const re = FIELD_SYNONYMS[field];
    const match = headers.find((h) => !taken.has(h) && re.test(h));
    if (match) {
      map[match] = field;
      taken.add(match);
    }
  }

  // If nothing mapped to description, take the widest text column as a guess.
  if (!Object.values(map).includes("description")) {
    const fallback = headers.find((h) => !taken.has(h));
    if (fallback) map[fallback] = "description";
  }

  return map;
}

/* ------------------------------------------------------------------ *
 * Apply a column map to rows -> BuybackItem[]
 * ------------------------------------------------------------------ */

export function rowsToItems(
  rows: Record<string, string>[],
  map: ColumnMap,
  defaultCategory: ItemCategory = "Raw",
): BuybackItem[] {
  // Invert: field -> source header (last one wins if duplicated).
  const fieldHeader: Partial<Record<TargetField, string>> = {};
  for (const [header, field] of Object.entries(map)) {
    if (field) fieldHeader[field] = header;
  }

  const items: BuybackItem[] = [];
  for (const row of rows) {
    const get = (f: TargetField): string =>
      fieldHeader[f] ? (row[fieldHeader[f] as string] ?? "").trim() : "";

    const description = get("description");
    const certNumber = get("certNumber");
    const gradingService = normalizeService(get("gradingService"));
    const faceRaw = get("faceValue");

    // Skip totally empty rows.
    if (!description && !certNumber && !faceRaw) continue;

    const category = inferCategory(get("category"), {
      certNumber,
      gradingService,
      description,
      faceValue: faceRaw,
      defaultCategory,
    });

    const item: BuybackItem = {
      description: description || composeDescription(get("year"), get("denomination"), get("grade")),
      quantity: parseQty(get("quantity")),
      category,
      gradingService: gradingService || undefined,
      certNumber: certNumber || undefined,
      year: get("year") || undefined,
      denomination: get("denomination") || undefined,
      grade: get("grade") || undefined,
      cac: parseBool(get("cac")) || undefined,
    };

    const ask = parseMoney(get("dealerAsk"));
    if (ask != null) (item as any).dealerAsk = ask;

    const face = parseMoney(faceRaw);
    if (category === "Junk Silver" && face != null) (item as any).faceValue = face;

    items.push(item);
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Coercion helpers
 * ------------------------------------------------------------------ */

function parseQty(v: string): number {
  const n = parseInt(v.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseMoney(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseBool(v: string): boolean {
  return /^(y|yes|true|1|cac|x|✓)$/i.test(v.trim());
}

function normalizeService(v: string): string {
  const s = v.trim().toUpperCase();
  if (/PCGS/.test(s)) return "PCGS";
  if (/NGC/.test(s)) return "NGC";
  if (/ANACS/.test(s)) return "ANACS";
  if (/ICG/.test(s)) return "ICG";
  return "";
}

function composeDescription(year: string, denom: string, grade: string): string {
  return [year, denom, grade].map((s) => s.trim()).filter(Boolean).join(" ");
}

export function inferCategory(
  explicit: string,
  ctx: {
    certNumber: string;
    gradingService: string;
    description: string;
    faceValue: string;
    defaultCategory: ItemCategory;
  },
): ItemCategory {
  const e = explicit.trim().toLowerCase();
  if (e) {
    const hit = CATEGORIES.find((c) => c.toLowerCase() === e);
    if (hit) return hit;
    if (/junk|90%|40%|constitutional|face/.test(e)) return "Junk Silver";
    if (/gold|au\b/.test(e)) return "Gold";
    if (/world|foreign/.test(e)) return "World";
    if (/slab|graded|cert/.test(e)) return "Slab";
  }
  const blob = `${ctx.description}`.toLowerCase();
  if (ctx.certNumber || ctx.gradingService) return "Slab";
  if (ctx.faceValue || /junk|90%|40%|constitutional|face\s*value/.test(blob)) return "Junk Silver";
  if (/\bgold\b|krugerrand|sovereign|eagle\s*gold/.test(blob)) return "Gold";
  if (/world|foreign|canada|mexico|britain|euro/.test(blob)) return "World";
  return ctx.defaultCategory;
}
