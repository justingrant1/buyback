/**
 * Lightweight single-slab photo extractor for the PUBLIC /sell form.
 *
 * Unlike the heavy two-pass `lib/vision.ts` pipeline (detect-every-slab →
 * crop → extract PCGS# + auction comps) used by the internal Slab Pricer, this
 * is intentionally minimal:
 *
 *   - ONE Claude vision call per photo (no detector pass, no sharp cropping).
 *   - A tiny tool-use schema that returns ONLY the fields the buyback form
 *     actually collects.
 *   - A small token budget.
 *
 * The goal is quick + cheap. Customers snap one slab at a time (up to 2 photos);
 * pricing is deferred to /api/submit. Output is a ready-to-review BuybackItem.
 */

import Anthropic from "@anthropic-ai/sdk";
import { env, hasAnthropicCreds } from "@/lib/env";
import type { BuybackItem } from "@/lib/types";

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return _client;
}

const SLAB_TOOL: Anthropic.Tool = {
  name: "report_slab",
  description:
    "Report the printed label fields for the single graded coin slab in this photo.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "grading_service",
      "cert_number",
      "year",
      "mint_mark",
      "denomination",
      "grade_label",
      "has_cac_sticker",
      "found_slab",
    ],
    properties: {
      found_slab: {
        type: "boolean",
        description: "True only if a graded coin slab is clearly visible in the photo.",
      },
      grading_service: {
        type: ["string", "null"],
        enum: ["PCGS", "NGC", "ANACS", "ICG", null],
      },
      cert_number: {
        type: ["string", "null"],
        description: "The long certification / serial number, digits only, no service prefix.",
      },
      year: { type: ["string", "null"] },
      mint_mark: { type: ["string", "null"], description: "Mint mark letter, e.g. S, D, CC. Null if none." },
      denomination: {
        type: ["string", "null"],
        description: 'Coin type/denomination, e.g. "Morgan Dollar", "Walking Liberty Half".',
      },
      grade_label: {
        type: ["string", "null"],
        description: 'Grade as printed: "MS65", "PR67DCAM", "AU58", "Genuine", etc.',
      },
      has_cac_sticker: {
        type: "boolean",
        description: "True if a green/gold CAC sticker is on the holder.",
      },
    },
  },
};

const SYSTEM = `You are an expert numismatist reading ONE graded coin slab from a customer photo.
A slab is a tamper-evident plastic holder (PCGS, NGC, ANACS, ICG) containing one coin.

Extract only what is printed on the label. Rules:
- cert_number: the long serial number, digits only, no prefix.
- grading_service: one of PCGS, NGC, ANACS, ICG (the holder brand). null if unsure.
- grade_label: the grade exactly as printed (e.g. "MS65", "PR69DCAM", "AU58").
- denomination: the coin's name/type (e.g. "Morgan Dollar").
- has_cac_sticker: true only if a CAC sticker is visible.
- If a field isn't legible, return null rather than guessing.
- If the image is not a graded slab at all, set found_slab=false.`;

function splitDataUrl(dataUrl: string): {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
} {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("splitDataUrl: not a base64 data URL");
  return { mediaType: m[1] as any, base64: m[2] };
}

/** Build a human-friendly description from the extracted parts. */
function composeDescription(parts: {
  year?: string | null;
  mint_mark?: string | null;
  denomination?: string | null;
  grade_label?: string | null;
}): string {
  const yearMint = [parts.year, parts.mint_mark].filter(Boolean).join("-");
  const bits = [yearMint, parts.denomination, parts.grade_label]
    .map((s) => (s ?? "").trim())
    .filter(Boolean);
  return bits.join(" ").replace(/\s+/g, " ").trim();
}

export interface SlabPhotoResult {
  ok: boolean;
  item: BuybackItem | null;
  /** Why we couldn't read it (for the UI), when ok=false. */
  message?: string;
}

/**
 * Extract a single BuybackItem from one downscaled slab photo (data URL).
 * Never throws — returns { ok:false } with a friendly message on any problem
 * so the form keeps working and the customer can type the coin in by hand.
 */
export async function extractSlabFromPhoto(photoDataUrl: string): Promise<SlabPhotoResult> {
  if (!hasAnthropicCreds()) {
    return {
      ok: false,
      item: null,
      message: "Photo scanning isn't enabled yet — please add this coin manually.",
    };
  }

  let mediaType: string;
  let base64: string;
  try {
    ({ mediaType, base64 } = splitDataUrl(photoDataUrl));
  } catch {
    return { ok: false, item: null, message: "That image couldn't be read. Try another photo." };
  }

  try {
    const resp = await client().messages.create({
      model: env.ANTHROPIC_VISION_MODEL,
      max_tokens: 512,
      system: SYSTEM,
      tools: [SLAB_TOOL],
      tool_choice: { type: "tool", name: "report_slab" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64 } },
            {
              type: "text",
              text: "Read this single coin slab's label and call report_slab with what you can see.",
            },
          ],
        },
      ],
    });

    const block = resp.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    if (!block) {
      return { ok: false, item: null, message: "We couldn't read that photo — add the coin manually." };
    }

    const f = block.input as {
      found_slab?: boolean;
      grading_service?: string | null;
      cert_number?: string | null;
      year?: string | null;
      mint_mark?: string | null;
      denomination?: string | null;
      grade_label?: string | null;
      has_cac_sticker?: boolean;
    };

    if (f.found_slab === false) {
      return {
        ok: false,
        item: null,
        message: "That didn't look like a graded slab. Try a clear, straight-on photo of the label.",
      };
    }

    const description =
      composeDescription(f) ||
      [f.grading_service, f.cert_number].filter(Boolean).join(" ") ||
      "Graded coin (review details)";

    const item: BuybackItem = {
      description,
      quantity: 1,
      category: "Slab",
      gradingService: f.grading_service ?? "",
      certNumber: f.cert_number ?? "",
      year: f.year ?? "",
      denomination: f.denomination ?? "",
      grade: f.grade_label ?? "",
      cac: Boolean(f.has_cac_sticker),
      photoDataUrl, // kept for review + Airtable attachment; not a pricing input
    };

    return { ok: true, item };
  } catch (e: any) {
    console.error("[slabPhoto] extraction failed:", e?.message ?? e);
    return {
      ok: false,
      item: null,
      message: "Something went wrong reading that photo — please add the coin manually.",
    };
  }
}
