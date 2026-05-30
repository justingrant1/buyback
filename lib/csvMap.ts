/**
 * AI column mapping for customer-uploaded spreadsheets.
 *
 * Customers keep their coin lists in wildly different column layouts. Rather
 * than force a template on them, we read their actual headers + a few sample
 * rows and ask Claude (via tool-use, same pattern as lib/vision.ts) which of
 * THEIR columns feeds each of OUR fields.
 *
 * Key design choices:
 *   - ONE AI call per upload regardless of row count. We get back a column map
 *     and apply it locally in lib/spreadsheet.ts, so a 5-row file and a
 *     5,000-row file cost the same.
 *   - Strict tool-use schema => well-formed JSON, no free-text parsing.
 *   - Graceful degradation: if there's no Anthropic key or the call throws,
 *     callers fall back to fuzzyColumnMap() so upload always works.
 */

import Anthropic from "@anthropic-ai/sdk";
import { env, hasAnthropicCreds } from "@/lib/env";
import type { ColumnMap, TargetField } from "@/lib/spreadsheet";

const TARGET_FIELDS: TargetField[] = [
  "description",
  "quantity",
  "gradingService",
  "certNumber",
  "year",
  "denomination",
  "grade",
  "cac",
  "category",
  "dealerAsk",
  "faceValue",
];

export interface AiMapResult {
  map: ColumnMap;
  confidence: number;
  /** Optional human-readable note, surfaced to the customer / Marley. */
  note?: string;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const MAP_TOOL: Anthropic.Tool = {
  name: "report_column_map",
  description:
    "Map each spreadsheet column header to one of our coin-buyback fields (or leave it unmapped). Return one mapping per column you can confidently assign.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["mappings", "confidence"],
    properties: {
      mappings: {
        type: "array",
        description: "One entry per source column you can map to a field.",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["header", "field"],
          properties: {
            header: {
              type: "string",
              description: "The EXACT column header text as it appears in the file.",
            },
            field: {
              type: "string",
              enum: TARGET_FIELDS,
              description:
                "Our field this column feeds. description=coin name/desc; quantity=count; gradingService=PCGS/NGC/ANACS/ICG; certNumber=serial/cert; year; denomination; grade (e.g. MS65); cac=has CAC sticker (yes/no); category=Slab/Raw/Junk Silver/Gold/World; dealerAsk=the price the seller wants; faceValue=face value $ for junk silver.",
            },
          },
        },
      },
      confidence: {
        type: "number",
        description: "Your overall confidence (0..1) that the mapping is correct.",
      },
      note: {
        type: ["string", "null"],
        description: "Optional short note if something was ambiguous or columns look unusual.",
      },
    },
  },
};

const SYSTEM = `You map messy customer coin spreadsheets onto a fixed schema.
You are given the column headers and a few sample rows from a real file a coin
seller uploaded. Decide which header feeds each of our fields.

Rules:
- Map only columns you are reasonably sure about. It's fine to leave a column
  unmapped (don't force it).
- Map at most ONE header to each field. Pick the best one.
- "description" is the coin's name/description (e.g. "1881-S Morgan Dollar").
- "gradingService" is the third-party grader: PCGS, NGC, ANACS, ICG.
- "certNumber" is the long serial / certification number.
- "dealerAsk" is the price the SELLER is asking us to pay (their wanted price),
  NOT a catalog/retail value column.
- "faceValue" only applies to junk/90% silver (dollars of face value).
- Use the sample row VALUES, not just the header text, to disambiguate
  (e.g. a column of "MS65/PR68" values is grade even if its header is vague).`;

/**
 * Ask Claude to map the given headers to our fields. Returns null on any
 * failure (no key, API error, malformed output) so the caller can fall back.
 */
export async function aiColumnMap(
  headers: string[],
  sampleRows: Record<string, string>[],
): Promise<AiMapResult | null> {
  if (!hasAnthropicCreds() || !headers.length) return null;

  const samples = sampleRows.slice(0, 8);
  const userText =
    `Column headers (verbatim):\n${JSON.stringify(headers)}\n\n` +
    `Sample rows (up to 8):\n${JSON.stringify(samples, null, 2)}\n\n` +
    `Call report_column_map with your best mapping.`;

  try {
    const resp = await client().messages.create({
      model: env.ANTHROPIC_VISION_MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: [MAP_TOOL],
      tool_choice: { type: "tool", name: "report_column_map" },
      messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
    });

    const block = resp.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    if (!block) return null;

    const input = block.input as {
      mappings?: { header: string; field: TargetField }[];
      confidence?: number;
      note?: string | null;
    };

    const headerSet = new Set(headers);
    const map: ColumnMap = {};
    const usedFields = new Set<TargetField>();
    for (const m of input.mappings ?? []) {
      if (!m?.header || !m?.field) continue;
      if (!headerSet.has(m.header)) continue; // ignore hallucinated headers
      if (!TARGET_FIELDS.includes(m.field)) continue;
      if (usedFields.has(m.field)) continue; // one header per field
      map[m.header] = m.field;
      usedFields.add(m.field);
    }

    if (!Object.keys(map).length) return null;

    return {
      map,
      confidence:
        typeof input.confidence === "number" ? input.confidence : 0.7,
      note: input.note ?? undefined,
    };
  } catch (e: any) {
    console.error("[csvMap] AI mapping failed:", e?.message ?? e);
    return null;
  }
}
