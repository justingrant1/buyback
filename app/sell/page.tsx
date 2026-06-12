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
    witterBrick: item.witterBrick,
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

  // Tracks which dropzone is currently being dragged over so we can give it a
  // gold highlight to match the editorial design.
  const [dragOver, setDragOver] = useState<"photo" | "sheet" | null>(null);

  async function handlePhotos(fileList: FileList | null | undefined) {
    const files = Array.from(fileList ?? []).slice(0, 2); // one slab each, max 2
    if (!files.length) return;
    setError(null);
    setScanMsg(null);
    setScanning(true);
    try {
      const fd = new FormData();
      for (const f of files) {
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

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
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

  // ---- success view (kept editorial; matches new design tokens) ----
  if (done) {
    return (
      <>
        <FontsAndStyles />
        <div className="wc-sell">
          <header>
            <div className="nav">
              <Link className="back" href="/">
                ← Witter Coin
              </Link>
              <Link className="wordmark" href="/">
                <span className="name">WITTER COIN</span>
                <span className="sub">Buyback</span>
              </Link>
            </div>
          </header>
          <main className="page" style={{ textAlign: "center" }}>
            <div className="eyebrow">Submission Received</div>
            <h1>You're all set.</h1>
            <p className="lede" style={{ margin: "0 auto" }}>
              {done.message}
            </p>
            <div className="card" style={{ marginTop: 32 }}>
              <div className="card-body" style={{ textAlign: "center" }}>
                <div
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 11,
                    letterSpacing: ".22em",
                    textTransform: "uppercase",
                    color: "var(--text-soft)",
                  }}
                >
                  Reference number
                </div>
                <div
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 28,
                    fontWeight: 600,
                    color: "var(--ink)",
                    marginTop: 8,
                  }}
                >
                  {done.ref}
                </div>
              </div>
            </div>
            <div className="submit-wrap">
              <Link href="/" className="add-coin" style={{ display: "inline-block" }}>
                Back to home
              </Link>
            </div>
          </main>
          <footer>
            © 2026 Witter Coin · America's Coin Shop ·{" "}
            <a href="mailto:buyback@wittercoin.com">buyback@wittercoin.com</a>
          </footer>
        </div>
      </>
    );
  }

  // ---- main form ----
  return (
    <>
      <FontsAndStyles />
      <div className="wc-sell">
        <header>
          <div className="nav">
            <Link className="back" href="/">
              ← Witter Coin
            </Link>
            <Link className="wordmark" href="/">
              <span className="name">WITTER COIN</span>
              <span className="sub">Buyback</span>
            </Link>
          </div>
        </header>

        <main className="page">
          <div className="eyebrow">America's Coin Shop · Buyback Program</div>
          <h1>Start a Buyback</h1>
          <p className="lede">
            Tell us about your coins and we'll send an itemized offer with a prepaid
            shipping label. Slabs price fastest — include the grading service and cert
            number.
          </p>

          <form id="buyback-form" noValidate onSubmit={submit}>
            {/* Your Details */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Your Details</div>
              </div>
              <div className="card-body">
                <div className="grid c2">
                  <div>
                    <label htmlFor="name">
                      Full name <span className="req">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      autoComplete="name"
                      required
                      placeholder="Jane Collector"
                      value={contact.name}
                      onChange={(e) => setContact({ ...contact, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="email">
                      Email <span className="req">*</span>
                    </label>
                    <input
                      type="email"
                      id="email"
                      autoComplete="email"
                      required
                      placeholder="jane@email.com"
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid c2" style={{ marginTop: 18 }}>
                  <div>
                    <label htmlFor="phone">
                      Phone <span className="opt">(optional)</span>
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      autoComplete="tel"
                      placeholder="(555) 555-1234"
                      value={contact.phone ?? ""}
                      onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Your Coins */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Your Coins</div>
                <button type="button" className="add-coin" onClick={addRow}>
                  + Add coin
                </button>
              </div>
              <div className="card-body">
                {rows.map((row, i) => (
                  <div key={row._key} className="coin">
                    <div className="coin-no">
                      <span>Coin {i + 1}</span>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          className="remove"
                          onClick={() => removeRow(row._key)}
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {row.photoDataUrl && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 14,
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={row.photoDataUrl}
                          alt="Scanned slab"
                          style={{
                            height: 56,
                            width: 56,
                            borderRadius: 3,
                            border: "1px solid var(--hairline)",
                            objectFit: "cover",
                          }}
                        />
                        <span
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 11,
                            letterSpacing: ".06em",
                            color: "var(--text-soft)",
                          }}
                        >
                          Read from your photo — double-check the details below.
                        </span>
                      </div>
                    )}

                    <div className="row-main">
                      <div>
                        <label>
                          Description <span className="req">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="1881-S Morgan Dollar MS65"
                          value={row.description}
                          onChange={(e) =>
                            updateRow(row._key, { description: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label>Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRow(row._key, {
                              quantity: Number(e.target.value) || 1,
                            })
                          }
                        />
                      </div>
                      <div>
                        <label>Type</label>
                        <select
                          value={row.category}
                          onChange={(e) =>
                            updateRow(row._key, {
                              category: e.target.value as ItemCategory,
                            })
                          }
                        >
                          {CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {row.category === "Slab" && (
                      <>
                        <div className="row-cert" style={{ marginTop: 14 }}>
                          <div>
                            <label>Grading service</label>
                            <select
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
                              <option value="CACG">CACG</option>
                            </select>
                          </div>
                          <div>
                            <label>Cert number</label>
                            <input
                              type="text"
                              placeholder="e.g. 12345678"
                              value={row.certNumber}
                              onChange={(e) =>
                                updateRow(row._key, { certNumber: e.target.value })
                              }
                            />
                          </div>
                          <div>
                            <label>Grade</label>
                            <input
                              type="text"
                              placeholder="MS65"
                              value={row.grade}
                              onChange={(e) =>
                                updateRow(row._key, { grade: e.target.value })
                              }
                            />
                          </div>
                        </div>

                        {/* CAC + WitterBrick are pure metadata booleans the customer
                            can self-declare. Staff act on them downstream — they
                            don't currently affect the auto-estimate. */}
                        <div className="modifiers">
                          <label className="cbx">
                            <input
                              type="checkbox"
                              checked={!!row.cac}
                              onChange={(e) =>
                                updateRow(row._key, { cac: e.target.checked })
                              }
                            />
                            <span>CAC graded</span>
                          </label>
                          <label className="cbx">
                            <input
                              type="checkbox"
                              checked={!!row.witterBrick}
                              onChange={(e) =>
                                updateRow(row._key, { witterBrick: e.target.checked })
                              }
                            />
                            <span>WitterBrick</span>
                          </label>
                        </div>
                      </>
                    )}

                    {row.category === "Junk Silver" && (
                      <div className="row-cert" style={{ marginTop: 14 }}>
                        <div>
                          <label>Face value ($)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.10"
                            placeholder="e.g. 50"
                            onChange={(e) =>
                              updateRow(row._key, {
                                ...({
                                  faceValue: Number(e.target.value) || 0,
                                } as any),
                              })
                            }
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Photo dropzone */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Or Add Coins Faster — Snap a Photo</div>
              </div>
              <p className="card-sub">
                Take a clear, straight-on photo of the label (up to 2 slabs, one per
                photo). We'll read the grading service, cert number, year, and grade and
                fill in the coin below for you to review.
              </p>
              <div className="card-body">
                <label
                  htmlFor="photo-input"
                  className={`drop ${dragOver === "photo" ? "dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver("photo");
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    handlePhotos(e.dataTransfer.files);
                  }}
                >
                  <div className="big">
                    {scanning ? "Reading your slab…" : "Tap to take or choose a photo"}
                  </div>
                  <div className="small">JPG or PNG — up to 2 slabs</div>
                  <input
                    id="photo-input"
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png"
                    capture="environment"
                    multiple
                    disabled={scanning}
                    onChange={(e) => handlePhotos(e.target.files)}
                  />
                </label>
                {scanMsg && <div className="flash flash-ok">{scanMsg}</div>}
              </div>
            </div>

            {/* Spreadsheet dropzone */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Have a List Already?</div>
              </div>
              <p className="card-sub">
                Upload your spreadsheet — CSV or Excel, with your columns in any order or
                naming. We'll read it, sort out the columns, and fill in your coins below
                for you to review.
              </p>
              <div className="card-body">
                <label
                  htmlFor="file-input"
                  className={`drop ${dragOver === "sheet" ? "dragover" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver("sheet");
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    handleFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <div className="big">
                    {uploading
                      ? "Reading your file…"
                      : "Click to upload or drag a file here"}
                  </div>
                  <div className="small">.csv, .xlsx, or .xls — up to 8 MB</div>
                  <input
                    id="file-input"
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    disabled={uploading}
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>
                {uploadMsg && <div className="flash flash-ok">{uploadMsg}</div>}
              </div>
            </div>

            {/* Notes */}
            <div className="card">
              <div className="card-body" style={{ paddingTop: 24 }}>
                <label htmlFor="notes">
                  Anything we should know? <span className="opt">(optional)</span>
                </label>
                <textarea
                  id="notes"
                  placeholder="Notes, special requests, or a link to photos…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {error && <div className="flash flash-err">{error}</div>}

            <div className="submit-wrap">
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? "Submitting…" : "Submit for an Offer →"}
              </button>
              <div className="submit-note">
                No obligation. We'll email you an itemized offer to review before you
                ship anything.
              </div>
            </div>
          </form>
        </main>

        <footer>
          © 2026 Witter Coin · America's Coin Shop ·{" "}
          <a href="mailto:buyback@wittercoin.com">buyback@wittercoin.com</a>
        </footer>
      </div>
    </>
  );
}

/**
 * Fonts + scoped styles for the /sell page.
 *
 * Everything is namespaced under `.wc-sell` so the editorial design doesn't
 * collide with the Tailwind utility classes still used in /admin and
 * /offer/[token]. The CSS reset (`*{margin:0;padding:0;…}`) is intentionally
 * NOT global — it only applies inside `.wc-sell`.
 */
function FontsAndStyles() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600&family=Public+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
      />
      <style>{`
.wc-sell{
  --ink:#0F2E22;
  --ink-deep:#0A2118;
  --paper:#F7F6F1;
  --paper-raise:#FFFFFF;
  --text:#1A2620;
  --text-soft:#5C6B62;
  --gold:#C8A24B;
  --gold-deep:#A37F2E;
  --hairline:#DCD9CE;
  --hairline-dark:rgba(200,162,75,.28);
  --display:"Bodoni Moda",serif;
  --body:"Public Sans",system-ui,sans-serif;
  --mono:"Spline Sans Mono",monospace;

  font-family:var(--body);
  background:var(--paper);
  color:var(--text);
  font-size:16px;
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  min-height:100vh;
}
.wc-sell *{margin:0;padding:0;box-sizing:border-box}
.wc-sell a{color:inherit}
.wc-sell :focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:2px}

/* header */
.wc-sell header{background:var(--ink);border-bottom:1px solid rgba(200,162,75,.25)}
.wc-sell .nav{max-width:880px;margin:0 auto;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.wc-sell .wordmark{display:flex;align-items:baseline;gap:12px;color:#F3EFE3;text-decoration:none}
.wc-sell .wordmark .name{font-family:var(--display);font-size:20px;font-weight:600;letter-spacing:.04em}
.wc-sell .wordmark .sub{font-family:var(--mono);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.wc-sell .back{font-family:var(--mono);font-size:12px;letter-spacing:.08em;color:#C9CFC4;text-decoration:none}
.wc-sell .back:hover{color:var(--gold)}

/* page head */
.wc-sell .page{max-width:880px;margin:0 auto;padding:56px 28px 96px}
.wc-sell .eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:14px}
.wc-sell h1{font-family:var(--display);font-weight:500;font-size:clamp(34px,4.5vw,48px);line-height:1.08;color:var(--ink);margin-bottom:16px}
.wc-sell .lede{color:var(--text-soft);max-width:58ch}

/* form cards */
.wc-sell .card{background:var(--paper-raise);border:1px solid var(--hairline);border-radius:4px;margin-top:28px;position:relative}
.wc-sell .card-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:22px 28px 0}
.wc-sell .card-title{font-family:var(--mono);font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink);display:flex;align-items:center;gap:12px}
.wc-sell .card-title::after{content:"";height:1px;flex:none;width:30px;background:var(--gold);opacity:.6}
.wc-sell .card-sub{padding:8px 28px 0;color:var(--text-soft);font-size:14.5px;max-width:62ch}
.wc-sell .card-body{padding:20px 28px 28px}

.wc-sell .grid{display:grid;gap:18px}
.wc-sell .grid.c2{grid-template-columns:1fr 1fr}
.wc-sell label{display:block;font-weight:600;font-size:13.5px;color:var(--ink);margin-bottom:7px;letter-spacing:.01em}
.wc-sell label .req{color:var(--gold-deep)}
.wc-sell label .opt{font-weight:400;color:var(--text-soft)}
.wc-sell input[type=text],.wc-sell input[type=email],.wc-sell input[type=tel],.wc-sell input[type=number],.wc-sell select,.wc-sell textarea{
  width:100%;font-family:var(--body);font-size:15px;color:var(--text);
  background:var(--paper);border:1px solid var(--hairline);border-radius:3px;
  padding:12px 14px;transition:border-color .15s ease,box-shadow .15s ease;
}
.wc-sell input::placeholder,.wc-sell textarea::placeholder{color:#A9B0A8}
.wc-sell input:focus,.wc-sell select:focus,.wc-sell textarea:focus{outline:none;border-color:var(--gold);box-shadow:0 0 0 3px rgba(200,162,75,.18);background:#fff}
.wc-sell select{appearance:none;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' fill='none' stroke='%235C6B62' stroke-width='1.5'/></svg>");background-repeat:no-repeat;background-position:right 14px center;padding-right:36px}
.wc-sell textarea{min-height:104px;resize:vertical}

/* coin rows */
.wc-sell .coin{border:1px solid var(--hairline);border-radius:3px;background:var(--paper);padding:20px;margin-top:16px;position:relative}
.wc-sell .coin:first-child{margin-top:0}
.wc-sell .coin-no{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:14px;display:flex;justify-content:space-between;align-items:center}
.wc-sell .row-main{display:grid;grid-template-columns:minmax(0,1fr) 92px 170px;gap:14px}
.wc-sell .row-cert{display:grid;grid-template-columns:220px minmax(0,1fr) 150px;gap:14px}
.wc-sell .remove{font-family:var(--mono);font-size:11px;letter-spacing:.08em;color:var(--text-soft);background:none;border:none;cursor:pointer;text-transform:uppercase}
.wc-sell .remove:hover{color:#9B3B2E}
.wc-sell .add-coin{font-family:var(--body);font-weight:600;font-size:13.5px;color:var(--ink);background:none;border:1px solid var(--gold);border-radius:3px;padding:9px 16px;cursor:pointer;transition:background .15s ease;text-decoration:none}
.wc-sell .add-coin:hover{background:rgba(200,162,75,.12)}

/* slab modifier checkboxes (CAC + WitterBrick) */
.wc-sell .modifiers{display:flex;flex-wrap:wrap;gap:22px;margin-top:16px;padding-top:14px;border-top:1px dashed var(--hairline)}
.wc-sell .cbx{display:inline-flex;align-items:center;gap:9px;cursor:pointer;margin:0;font-weight:500;font-size:14px;color:var(--ink)}
.wc-sell .cbx input{appearance:none;width:18px;height:18px;border:1px solid var(--hairline);border-radius:3px;background:#fff;cursor:pointer;position:relative;flex:none;transition:border-color .15s ease,background .15s ease}
.wc-sell .cbx input:hover{border-color:var(--gold)}
.wc-sell .cbx input:checked{background:var(--gold);border-color:var(--gold)}
.wc-sell .cbx input:checked::after{content:"";position:absolute;left:5px;top:1px;width:5px;height:10px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.wc-sell .cbx input:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

/* dropzones */
.wc-sell .drop{display:block;border:1.5px dashed var(--hairline);border-radius:3px;background:var(--paper);text-align:center;padding:42px 24px;cursor:pointer;transition:border-color .15s ease,background .15s ease}
.wc-sell .drop:hover,.wc-sell .drop.dragover{border-color:var(--gold);background:rgba(200,162,75,.06)}
.wc-sell .drop .big{font-weight:600;font-size:15.5px;color:var(--ink)}
.wc-sell .drop .small{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;color:var(--text-soft);margin-top:6px}
.wc-sell .drop input{display:none}

/* inline status / error banners */
.wc-sell .flash{margin-top:14px;border-radius:3px;padding:11px 14px;font-size:14px;font-weight:500}
.wc-sell .flash-ok{background:rgba(200,162,75,.10);border:1px solid var(--hairline-dark);color:var(--gold-deep)}
.wc-sell .flash-err{background:#FCEDE9;border:1px solid #E8C0B3;color:#9B3B2E;margin-top:24px}

/* submit */
.wc-sell .submit-wrap{margin-top:32px;text-align:center}
.wc-sell .btn-submit{display:block;width:100%;font-family:var(--body);font-weight:700;font-size:16.5px;color:var(--ink-deep);
  background:linear-gradient(180deg,#E0BE68,#BE9740);border:none;border-radius:3px;padding:18px 28px;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 10px 26px rgba(15,46,34,.18);transition:filter .15s ease,transform .1s ease}
.wc-sell .btn-submit:hover:not(:disabled){filter:brightness(1.06)}
.wc-sell .btn-submit:active:not(:disabled){transform:translateY(1px)}
.wc-sell .btn-submit:disabled{opacity:.6;cursor:not-allowed}
.wc-sell .submit-note{margin-top:14px;font-family:var(--mono);font-size:12px;letter-spacing:.04em;color:var(--text-soft)}

.wc-sell footer{border-top:1px solid var(--hairline);padding:28px;text-align:center;font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:var(--text-soft);background:var(--paper)}
.wc-sell footer a{color:var(--gold-deep);text-decoration:none}
.wc-sell footer a:hover{text-decoration:underline}

@media (max-width:680px){
  .wc-sell .grid.c2{grid-template-columns:1fr}
  .wc-sell .row-main{grid-template-columns:1fr 1fr}
  .wc-sell .row-main > :first-child{grid-column:1 / -1}
  .wc-sell .row-cert{grid-template-columns:1fr 1fr}
  .wc-sell .row-cert > :first-child{grid-column:1 / -1}
  .wc-sell .card-head,.wc-sell .card-sub{padding-left:20px;padding-right:20px}
  .wc-sell .card-body{padding:18px 20px 24px}
}
@media (prefers-reduced-motion: reduce){
  .wc-sell *,.wc-sell *::before,.wc-sell *::after{transition-duration:.01ms!important}
}
      `}</style>
    </>
  );
}
