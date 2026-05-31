"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { BuybackItem, BuybackRecord } from "@/lib/types";

const money = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function BuybackDetail() {
  const { id } = useParams<{ id: string }>();
  const [buyback, setBuyback] = useState<BuybackRecord | null>(null);
  const [items, setItems] = useState<BuybackItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Per-coin offer drafts, keyed by line-item id (string for the input).
  const [itemOffers, setItemOffers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/admin/buybacks/${id}`);
    const d = await res.json();
    setBuyback(d.buyback);
    const its: BuybackItem[] = d.items ?? [];
    setItems(its);
    const drafts: Record<string, string> = {};
    for (const it of its) {
      if (it.id) drafts[it.id] = it.offer == null ? "" : String(it.offer);
    }
    setItemOffers(drafts);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Total offer = sum of the per-coin offer drafts (the offer is the line total
  // for that coin, including its quantity — staff enters the full line amount).
  const total = useMemo(
    () =>
      items.reduce((s, it) => {
        const raw = it.id ? itemOffers[it.id] : "";
        return s + (Number(raw) || 0);
      }, 0),
    [items, itemOffers],
  );
  const refValue = useMemo(
    () => items.reduce((s, it) => s + (it.cdnBid ?? 0) * (it.quantity ?? 1), 0),
    [items],
  );
  const margin = refValue > 0 ? ((refValue - total) / refValue) * 100 : 0;

  function setLineOffer(itemId: string, value: string) {
    setItemOffers((prev) => ({ ...prev, [itemId]: value }));
  }

  async function saveOffer() {
    setBusy("save");
    setMsg(null);
    const payload = items
      .filter((it) => it.id)
      .map((it) => {
        const raw = itemOffers[it.id!];
        return {
          id: it.id!,
          offer: raw === "" || raw == null ? null : Number(raw),
        };
      });
    await fetch(`/api/admin/buybacks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemOffers: payload }),
    });
    await load();
    setBusy(null);
    setMsg("Per-coin offers saved.");
  }


  async function sendOffer() {
    setBusy("send");
    setMsg(null);
    const res = await fetch(`/api/admin/buybacks/${id}/send-offer`, { method: "POST" });
    const d = await res.json();
    setBusy(null);
    if (!res.ok) return setMsg(d.error ?? "Failed to send.");
    setMsg(d.stub ? "Offer 'sent' (email stub — set SendGrid key to go live)." : "Offer emailed to customer.");
    load();
  }

  async function setStatus(status: string) {
    setBusy("status");
    await fetch(`/api/admin/buybacks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        ...(status === "Received" ? { dateReceived: new Date().toISOString() } : {}),
      }),
    });
    await load();
    setBusy(null);
  }

  function exportCsv() {
    const header = ["Description", "Qty", "Grade", "Cert", "CDN Bid", "CDN Ask", "Offer"];
    const lines = items.map((it) =>
      [
        it.description,
        it.quantity,
        it.grade ?? "",
        it.certNumber ?? "",
        it.cdnBid ?? "",
        it.cdnAsk ?? "",
        it.offer ?? "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${buyback?.ref ?? "buyback"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <p className="p-10 text-center text-slate-400">Loading…</p>;
  if (!buyback) return <p className="p-10 text-center text-slate-400">Not found.</p>;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← Back to queue
      </Link>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-ink">{buyback.ref}</h1>
            {buyback.vip && <span className="badge bg-yellow-100 text-yellow-800">VIP</span>}
            <span className="badge bg-slate-100 text-slate-600">{buyback.status}</span>
          </div>
          <p className="mt-1 text-slate-600">
            {buyback.customerName} · {buyback.customerEmail}
          </p>
        </div>
        <button onClick={exportCsv} className="btn-ghost text-sm">
          Download CSV
        </button>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Items */}
        <section className="card lg:col-span-2">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Coin</th>
                <th className="px-3 py-2 text-center">Qty</th>
                <th className="px-3 py-2 text-right">CDN Bid</th>
                <th className="px-3 py-2 text-right">CDN Ask</th>
                <th className="px-3 py-2 text-right">Offer ($)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id ?? i} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium">{it.description}</div>
                    {(it.gradingService || it.certNumber) && (
                      <div className="text-xs text-slate-400">
                        {it.gradingService} {it.certNumber} {it.cac ? "· CAC" : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">{money(it.cdnBid)}</td>
                  <td className="px-3 py-2 text-right">{money(it.cdnAsk)}</td>
                  <td className="px-3 py-2 text-right">
                    {it.id ? (
                      <input
                        className="input w-24 py-1 text-right"
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemOffers[it.id] ?? ""}
                        onChange={(e) => setLineOffer(it.id!, e.target.value)}
                        placeholder={String(
                          Math.round((it.cdnBid ?? 0) * (it.quantity ?? 1)),
                        )}
                      />
                    ) : (
                      money(it.offer)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                <td className="px-3 py-2" colSpan={4}>
                  Total offer
                </td>
                <td className="px-3 py-2 text-right text-brand">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
          <p className="px-3 py-2 text-xs text-slate-400">
            Enter an offer for each coin. The total below updates automatically and
            is what the customer sees.
          </p>
        </section>


        {/* Offer panel */}
        <aside className="card h-fit p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Offer
          </h2>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Reference value (CDN bid)" value={money(refValue)} />
            <Row label="Total offer (per-coin)" value={money(total)} />
          </dl>

          <p className="mt-3 text-sm text-slate-500">
            Set each coin&apos;s offer in the table on the left. The total is the
            sum of those line offers.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Margin: <strong>{margin.toFixed(1)}%</strong>
          </p>

          <div className="mt-4 space-y-2">
            <button onClick={saveOffer} disabled={busy != null} className="btn-ghost w-full">
              {busy === "save" ? "Saving…" : "Save per-coin offers"}
            </button>
            <button onClick={sendOffer} disabled={busy != null || total <= 0} className="btn-primary w-full">
              {busy === "send" ? "Sending…" : "Send offer email"}
            </button>
          </div>


          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="label">Mark status</p>
            <div className="flex flex-wrap gap-2">
              {["Received", "Paid", "Declined"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={busy != null}
                  className="badge border border-slate-200 bg-white px-3 py-1 text-slate-600 hover:bg-slate-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {buyback.labelUrl && (
            <a href={buyback.labelUrl} target="_blank" className="mt-4 block text-sm text-brand hover:underline">
              View shipping label ({buyback.trackingNumber})
            </a>
          )}

          {msg && <p className="mt-4 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">{msg}</p>}
        </aside>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
