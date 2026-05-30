/**
 * POST /api/scan-slab
 *
 * Public endpoint for the /sell form's "Snap a photo of your slab" feature.
 *
 * Accepts 1–2 already-downscaled slab photos as multipart form-data under the
 * field name "photo" (repeated), runs ONE lightweight Claude vision call per
 * photo (see lib/slabPhoto.ts), and returns ready-to-review BuybackItem[].
 *
 * Each returned item carries its `photoDataUrl` so the client can keep the
 * image attached to the row and ship it to /api/submit, which persists it as
 * an Airtable attachment on the line item.
 *
 * Intentionally cheap: ≤2 model calls, small token budget, no pricing here
 * (pricing happens in /api/submit). Degrades gracefully with a clear message
 * if vision isn't configured.
 */

import { NextResponse } from "next/server";
import { extractSlabFromPhoto } from "@/lib/slabPhoto";
import type { BuybackItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PHOTOS = 2;
const MAX_BYTES = 6 * 1024 * 1024; // 6 MB per photo (already downscaled client-side)

async function fileToDataUrl(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const type = file.type && /^image\//.test(file.type) ? file.type : "image/jpeg";
  return `data:${type};base64,${buf.toString("base64")}`;
}

export async function POST(req: Request) {
  let files: File[] = [];
  try {
    const form = await req.formData();
    files = form
      .getAll("photo")
      .filter((f): f is File => f instanceof File && f.size > 0);
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form-data with one or more 'photo' files." },
      { status: 400 },
    );
  }

  if (!files.length) {
    return NextResponse.json({ error: "No photo uploaded." }, { status: 400 });
  }
  if (files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Please send at most ${MAX_PHOTOS} photos at a time (one slab each).` },
      { status: 400 },
    );
  }
  for (const f of files) {
    if (f.size > MAX_BYTES) {
      return NextResponse.json({ error: "A photo was too large. Try again." }, { status: 413 });
    }
  }

  const items: BuybackItem[] = [];
  const messages: string[] = [];

  for (const file of files) {
    let dataUrl: string;
    try {
      dataUrl = await fileToDataUrl(file);
    } catch {
      messages.push("One photo couldn't be read.");
      continue;
    }
    const result = await extractSlabFromPhoto(dataUrl);
    if (result.ok && result.item) {
      items.push(result.item);
    } else if (result.message) {
      messages.push(result.message);
    }
  }

  if (!items.length) {
    return NextResponse.json(
      { error: messages[0] ?? "We couldn't read a slab from those photos. Add the coin manually." },
      { status: 422 },
    );
  }

  const summary =
    `Read ${items.length} slab${items.length === 1 ? "" : "s"} from your photo${
      files.length === 1 ? "" : "s"
    } — review the details below.` + (messages.length ? ` (${messages.join(" ")})` : "");

  return NextResponse.json({ items, summary });
}
