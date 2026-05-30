"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import type { BuybackItem, ItemCategory, SellerContact } from "@/lib/types";

const CATEGORIES: ItemCategory[] = ["Slab", "Raw", "Junk Silver", "Gold", "World"];

interface Row extends BuybackItem {
  _key: string;
}

function blankRow(): Row {
  return {
    _key: Math.random().toString(36).slice(2),
    description: "",
    quantity: 1,
    category: "Slab",
    gradingService: "",
    certNumber: "",
    grade: "",
  };
}

function rowFromItem(item: BuybackItem): Row {
  return {
    _key: Math.random().toString(36).slice(2),
    description: item.description ?? "",
    quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
    category: item.category ?? "Raw",
    gradingService: item.gradingService ?? "",
    certNumber: item.certNumber ?? "",
    year: item.year,
    denomination: item.denomination,
    grade: item.grade ?? "",
    cac: item.cac,
    photoDataUrl: item.photoDataUrl,
    ...((item as any).dealerAsk != null ? { dealerAsk: (item as any).dealerAsk } : {}),
    ...((item as any).faceValue != null ? { faceValue: (item as any).faceValue } : {}),
  } as Row;
}

/**
 * Downscale + re-encode an image File to a JPEG data URL no larger than
 * ~1280px on the long edge. Keeps photos cheap to send to the vision model
 * and small enough for Airtable's attachment upload.
 */
async function downscaleToDataUrl(file: File, maxEdge = 1280, quality = 0.82): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("decode failed"));
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl; // fall back to original if canvas unavailable
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:([^;]+);/.exec(meta)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], filename, { type: mime });
}



export default function SellPage() {
  const [contact, setContact] = useState<SellerContact>({
    name: "",
    email: "",
    phone: "",
  });
  const [rows, setRows] = useState<Row[]>([blankRow()]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { ref: string; message: string }>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  async function handlePhotos(fileList: FileList | null | undefined) {
    const files = Array.from(fileList ?? []).slice(0, 2); // one slab each, max 2
    if (!files.length) return;
    setError(null);
    setScanMsg(null);
    setScanning(true);
    try {
      const fd = new FormData();
      for (const f of files) {
        // Downscale in the browser so we send small images and can keep a copy
        // attached to the row for Airtable.
        const dataUrl = await downscaleToDataUrl(f);
        fd.append("photo", dataUrlToFile(dataUrl, f.name || "slab.jpg"));
      }
      const res = await fetch("/api/scan-slab", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "We couldn't read that photo.");

      const parsed: BuybackItem[] = Array.isArray(data.items) ? data.items : [];
      if (!parsed.length) throw new Error("No slab found in that photo.");

      const newRows = parsed.map(rowFromItem);
      setRows((rs) => {
        const meaningful = rs.filter((r) => r.description.trim());
        return meaningful.length ? [...meaningful, ...newRows] : newRows;
      });
      setScanMsg(data.summary ?? `Read ${newRows.length} slab(s). Review below.`);
    } catch (e: any) {
      setError(e?.message ?? "Photo scan failed.");
    } finally {
      setScanning(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }


  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setUploadMsg(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse-spreadsheet", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read that file.");

      const parsed: BuybackItem[] = Array.isArray(data.items) ? data.items : [];
      if (!parsed.length) throw new Error("No coins found in that file.");

      const newRows = parsed.map(rowFromItem);
      // Replace the empty starter row; otherwise append to what's there.
      setRows((rs) => {
        const meaningful = rs.filter((r) => r.description.trim());
        return meaningful.length ? [...meaningful, ...newRows] : newRows;
      });
      setUploadMsg(data.summary ?? `Imported ${newRows.length} coins. Review below.`);
    } catch (e: any) {
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r._key === key ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }
  function removeRow(key: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r._key !== key) : rs));
  }

  async function submit() {
    setError(null);
    if (!contact.name.trim() || !contact.email.trim()) {
      setError("Please enter your name and email.");
      return;
    }
    const items = rows
      .filter((r) => r.description.trim())
      .map(({ _key, ...rest }) => rest);
    if (!items.length) {
      setError("Add at least one coin to your list.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact, items, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setDone({ ref: data.ref, message: data.message });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <div className="card p-8">
          <h1 className="text-2xl font-bold text-brand">You're all set! 🎉</h1>
          <p className="mt-4 text-slate-600">{done.message}</p>
          <p className="mt-6 text-sm text-slate-500">
            Your reference number is{" "}
            <span className="font-mono font-semibold text-ink">{done.ref}</span>
          </p>
          <Link href="/" className="btn-ghost mt-8">
            Back to home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <Link href="/" className="text-sm text-brand hover:underline">
          ← Witter Coin
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-ink">Start a Buyback</h1>
        <p className="mt-1 text-slate-600">
          Tell us about your coins and we'll send an itemized offer with a prepaid
          shipping label. Slabs price fastest — include the grading service and cert
          number.
        </p>
      </header>

      {/* Contact */}
      <section className="card mb-6 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Your details
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Full name *</label>
            <input
              className="input"
              value={contact.name}
              onChange={(e) => setContact({ ...contact, name: e.target.value })}
              placeholder="Jane Collector"
            />
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              className="input"
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
              placeholder="jane@email.com"
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={contact.phone ?? ""}
              onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              placeholder="(555) 555-1234"
            />
          </div>
        </div>
      </section>

      {/* Snap a photo of a slab */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Have a graded slab? Snap a photo
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Take a clear, straight-on photo of the label (up to 2 slabs, one per photo).
          We'll read the grading service, cert number, year, and grade and fill in the
          coin below for you to review.
        </p>

        <label
          htmlFor="slab-photo"
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center transition hover:border-brand hover:bg-slate-50"
        >
          <span className="text-sm font-medium text-ink">
            {scanning ? "Reading your slab…" : "Tap to take or choose a photo"}
          </span>
          <span className="mt-1 text-xs text-slate-400">JPG or PNG — up to 2 slabs</span>
          <input
            id="slab-photo"
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            disabled={scanning}
            onChange={(e) => handlePhotos(e.target.files)}
          />
        </label>

        {scanMsg && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {scanMsg}
          </p>
        )}
      </section>

      {/* Upload a spreadsheet */}
      <section className="card mb-6 p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Have a list already?
        </h2>

        <p className="mb-4 text-sm text-slate-600">
          Upload your spreadsheet — CSV or Excel, with your columns in any order or
          naming. We'll read it, sort out the columns, and fill in your coins below
          for you to review.
        </p>

        <label
          htmlFor="sheet-upload"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center transition hover:border-brand hover:bg-slate-50"
        >
          <span className="text-sm font-medium text-ink">
            {uploading ? "Reading your file…" : "Click to upload or drag a file here"}
          </span>
          <span className="mt-1 text-xs text-slate-400">.csv, .xlsx, or .xls — up to 8 MB</span>
          <input
            id="sheet-upload"
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>

        {uploadMsg && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {uploadMsg}
          </p>
        )}
      </section>

      {/* Items */}
      <section className="card mb-6 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your coins
          </h2>
          <button onClick={addRow} className="btn-ghost text-xs">
            + Add coin
          </button>
        </div>


        <div className="space-y-4">
          {rows.map((row, i) => (
            <div key={row._key} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Coin {i + 1}</span>
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(row._key)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              {row.photoDataUrl && (
                <div className="mb-3 flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={row.photoDataUrl}
                    alt="Scanned slab"
                    className="h-16 w-16 rounded-md border border-slate-200 object-cover"
                  />
                  <span className="text-xs text-slate-400">
                    Read from your photo — double-check the details below.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                <div className="sm:col-span-4">
                  <label className="label">Description *</label>

                  <input
                    className="input"
                    value={row.description}
                    onChange={(e) => updateRow(row._key, { description: e.target.value })}
                    placeholder="1881-S Morgan Dollar MS65"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="label">Qty</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(e) =>
                      updateRow(row._key, { quantity: Number(e.target.value) || 1 })
                    }
                  />
                </div>
                <div className="sm:col-span-1">
                  <label className="label">Type</label>
                  <select
                    className="input"
                    value={row.category}
                    onChange={(e) =>
                      updateRow(row._key, { category: e.target.value as ItemCategory })
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {row.category === "Slab" && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="label">Grading service</label>
                      <select
                        className="input"
                        value={row.gradingService}
                        onChange={(e) =>
                          updateRow(row._key, { gradingService: e.target.value })
                        }
                      >
                        <option value="">—</option>
                        <option value="PCGS">PCGS</option>
                        <option value="NGC">NGC</option>
                        <option value="ANACS">ANACS</option>
                        <option value="ICG">ICG</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Cert number</label>
                      <input
                        className="input"
                        value={row.certNumber}
                        onChange={(e) =>
                          updateRow(row._key, { certNumber: e.target.value })
                        }
                        placeholder="e.g. 12345678"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="label">Grade</label>
                      <input
                        className="input"
                        value={row.grade}
                        onChange={(e) => updateRow(row._key, { grade: e.target.value })}
                        placeholder="MS65"
                      />
                    </div>
                  </>
                )}

                {row.category === "Junk Silver" && (
                  <div className="sm:col-span-2">
                    <label className="label">Face value ($)</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step="0.10"
                      onChange={(e) =>
                        updateRow(row._key, {
                          // stash on the item; server reads faceValue
                          ...( { faceValue: Number(e.target.value) || 0 } as any ),
                        })
                      }
                      placeholder="e.g. 50"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card mb-6 p-5">
        <label className="label">Anything we should know? (optional)</label>
        <textarea
          className="input min-h-[80px]"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes, special requests, or a link to photos…"
        />
      </section>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <button onClick={submit} disabled={submitting} className="btn-primary w-full py-3 text-base">
        {submitting ? "Submitting…" : "Submit for an Offer"}
      </button>
      <p className="mt-3 text-center text-xs text-slate-400">
        No obligation. We'll email you an itemized offer to review before you ship anything.
      </p>
    </main>
  );
}
