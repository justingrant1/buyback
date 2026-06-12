"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/**
 * Loads the Google Maps JS Places library exactly once, even if multiple
 * components mount. Resolves the global `google` object so callers can use
 * `new google.maps.places.Autocomplete(...)`.
 */
function loadGoogleMaps(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!GOOGLE_MAPS_KEY) return Promise.resolve(null);
  const w = window as any;
  if (w.google?.maps?.places) return Promise.resolve(w.google);

  const existing = document.getElementById("gmaps-places") as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(w.google ?? null));
    });
  }

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.id = "gmaps-places";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_KEY,
    )}&libraries=places&v=weekly`;
    script.onload = () => resolve(w.google ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * Splits a google.maps.places.PlaceResult into our { street, city, state, zip }
 * shape. Handles US addresses (the only ones Shippo will route via FedEx anyway).
 */
function placeToAddress(place: any): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const comps: any[] = place?.address_components ?? [];
  const get = (type: string, short = false) => {
    const c = comps.find((x) => x.types?.includes(type));
    return c ? (short ? c.short_name : c.long_name) : "";
  };
  const streetNumber = get("street_number");
  const route = get("route");
  return {
    street: [streetNumber, route].filter(Boolean).join(" "),
    city:
      get("locality") ||
      get("sublocality") ||
      get("postal_town") ||
      get("administrative_area_level_2"),
    state: get("administrative_area_level_1", true),
    zip: get("postal_code"),
  };
}



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
  const streetInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);


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

  // Attach Google Places autocomplete to the street input once the offer has
  // loaded (and only if we have a key configured). When the customer picks a
  // suggestion, all four address fields are auto-populated.
  useEffect(() => {
    if (!offer) return;
    if (!streetInputRef.current) return;
    if (autocompleteRef.current) return; // already wired

    let cancelled = false;
    loadGoogleMaps().then((google) => {
      if (cancelled || !google || !streetInputRef.current) return;
      const ac = new google.maps.places.Autocomplete(streetInputRef.current, {
        types: ["address"],
        componentRestrictions: { country: ["us"] },
        fields: ["address_components", "formatted_address"],
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const addr = placeToAddress(place);
        if (addr.street || addr.city || addr.state || addr.zip) {
          setShip(addr);
        }
      });
      autocompleteRef.current = ac;
    });

    return () => {
      cancelled = true;
    };
  }, [offer]);


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
              <p className="mb-3 text-xs text-slate-500">
                {GOOGLE_MAPS_KEY
                  ? "Start typing and pick your address — we'll fill in the rest."
                  : "Enter your address below."}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  ref={streetInputRef}
                  className="input sm:col-span-2"
                  placeholder={GOOGLE_MAPS_KEY ? "Start typing your address…" : "Street address"}
                  autoComplete="off"
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
