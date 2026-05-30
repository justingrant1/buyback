"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { BuybackRecord, BuybackStatus } from "@/lib/types";

const money = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const STATUS_COLORS: Record<string, string> = {
  New: "bg-blue-100 text-blue-700",
  "Offer Sent": "bg-amber-100 text-amber-700",
  Approved: "bg-emerald-100 text-emerald-700",
  "Label Sent": "bg-teal-100 text-teal-700",
  Received: "bg-violet-100 text-violet-700",
  Paid: "bg-green-100 text-green-700",
  Declined: "bg-slate-200 text-slate-600",
};

const FILTERS: (BuybackStatus | "All")[] = ["All", "New", "Offer Sent", "Approved", "Received"];

export default function AdminDashboard() {
  const [rows, setRows] = useState<(BuybackRecord & { priority?: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<BuybackStatus | "All">("All");

  useEffect(() => {
    setLoading(true);
    const qs = filter === "All" ? "" : `?status=${encodeURIComponent(filter)}`;
    fetch(`/api/admin/buybacks${qs}`)
      .then((r) => r.json())
      .then((d) => setRows(d.buybacks ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  const kpis = useMemo(() => {
    const open = rows.filter((r) => !["Paid", "Declined"].includes(r.status));
    const pipeline = open.reduce((s, r) => s + (r.estimatedValue ?? 0), 0);
    const needsAction = rows.filter((r) => r.status === "New").length;
    return { count: rows.length, pipeline, needsAction };
  }, [rows]);

  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    location.href = "/admin/login";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Buyback Queue</h1>
          <p className="text-sm text-slate-500">
            Sorted by priority — VIPs, high value, and oldest first.
          </p>
        </div>
        <button onClick={logout} className="btn-ghost text-sm">
          Sign out
        </button>
      </header>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Kpi label="Open buybacks" value={String(kpis.count)} />
        <Kpi label="Pipeline value" value={money(kpis.pipeline)} />
        <Kpi label="Need pricing (New)" value={String(kpis.needsAction)} accent />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`badge px-3 py-1 ${
              filter === f ? "bg-brand text-white" : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Ref</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Est. value</th>
              <th className="px-4 py-3 text-right">Offer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No buybacks yet.
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/${b.id}`} className="font-mono font-semibold text-brand">
                      {b.ref}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {b.vip && <span className="badge bg-yellow-100 text-yellow-800">VIP</span>}
                      <span>{b.customerName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">{b.itemCount}</td>
                  <td className="px-4 py-3 text-right">{money(b.estimatedValue)}</td>
                  <td className="px-4 py-3 text-right">{money(b.offerAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${STATUS_COLORS[b.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {b.dateSubmitted ? new Date(b.dateSubmitted).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "border-brand/30" : ""}`}>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent ? "text-brand" : "text-ink"}`}>{value}</p>
    </div>
  );
}
