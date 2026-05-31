"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface OfferItem {
  description: string;
  quantity: number;
  grade?: string;
  offer?: number | null;
}
interface OfferView {
  ref: string;
  customerName: string;
  status: string;
  offerAmount?: number | null;
  itemCount: number;
  items: OfferItem[];
}

const money = (n?: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function OfferPage() {
  const { token } = useParams<{ token: string }>();
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ship, setShip] = useState({ street: "", city: "", state: "", zip: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<null | { status: string; labelUrl?: string }>(null);

  useEffect(() => {
    fetch(`/api/offer/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setOffer(d);
      })
      .catch(() => setError("Could not load this offer."))
      .finally(() => setLoading(false));
  }, [token]);

  async function decide(decision: "accept" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/offer/${token}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ship }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Something went wrong");
      setResult({ status: d.status, labelUrl: d.labelUrl });
    } catch (e: any) {
      setError(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Centered>Loading your offer…</Centered>;
  if (error && !offer) return <Centered>{error}</Centered>;
  if (!offer) return <Centered>Offer not found.</Centered>;

  if (result) {
    return (
      <Centered>
        <div className="card max-w-md p-8 text-center">
          {result.status === "Declined" ? (
            <>
              <h1 className="text-2xl font-bold text-ink">Offer declined</h1>
              <p className="mt-3 text-slate-600">
                No problem — we've noted that you've passed on this offer. Reach out
                anytime if you change your mind.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-brand">You're all set! 🎉</h1>
              <p className="mt-3 text-slate-600">
                We've emailed your prepaid shipping label. Pack your coins securely and
                drop them off — once they arrive we'll finalize payment.
              </p>
              {result.labelUrl && (
                <a href={result.labelUrl} className="btn-primary mt-6" target="_blank">
                  Download Label (PDF)
                </a>
              )}
            </>
          )}
        </div>
      </Centered>
    );
  }

  const decided = ["Approved", "Declined", "Label Sent"].includes(offer.status);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="card p-6">
        <p className="text-xs uppercase tracking-wide text-slate-400">
          Witter Coin · Ref {offer.ref}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">
          Hi {offer.customerName || "there"}, here's your offer
        </h1>
        <p className="mt-1 text-slate-600">
          Our total bid for your {offer.itemCount} item{offer.itemCount === 1 ? "" : "s"} is
        </p>
        <p className="my-3 text-4xl font-bold text-brand">{money(offer.offerAmount)}</p>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-2">Coin</th>
              <th className="py-2 text-center">Qty</th>
              <th className="py-2">Grade</th>
              <th className="py-2 text-right">Offer</th>
            </tr>
          </thead>
          <tbody>
            {offer.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-center">{it.quantity}</td>
                <td className="py-2">{it.grade ?? "—"}</td>
                <td className="py-2 text-right">{money(it.offer)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-2" colSpan={3}>
                Total offer
              </td>
              <td className="py-2 text-right text-brand">{money(offer.offerAmount)}</td>
            </tr>
          </tfoot>
        </table>


        {decided ? (
          <p className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            This offer has already been {offer.status.toLowerCase()}.
          </p>
        ) : (
          <>
            <div className="mt-8">
              <h2 className="mb-2 text-sm font-semibold text-slate-700">
                Your shipping address (for the prepaid label)
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  className="input sm:col-span-2"
                  placeholder="Street address"
                  value={ship.street}
                  onChange={(e) => setShip({ ...ship, street: e.target.value })}
                />
                <input
                  className="input"
                  placeholder="City"
                  value={ship.city}
                  onChange={(e) => setShip({ ...ship, city: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="input"
                    placeholder="State"
                    value={ship.state}
                    onChange={(e) => setShip({ ...ship, state: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="ZIP"
                    value={ship.zip}
                    onChange={(e) => setShip({ ...ship, zip: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => decide("accept")}
                disabled={busy}
                className="btn-primary flex-1 py-3"
              >
                {busy ? "Processing…" : "Accept Offer & Get Label"}
              </button>
              <button onClick={() => decide("decline")} disabled={busy} className="btn-ghost">
                Decline
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 text-center text-slate-600">
      <div>{children}</div>
    </main>
  );
}
