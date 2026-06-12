"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/**
 * Loads the Google Maps JS API using Google's recommended async bootstrap
 * pattern (https://goo.gle/js-api-loading). The bootstrap exposes
 * `google.maps.importLibrary(...)`, which we then call to pull in the
 * `places` library only — no `?libraries=places` query string and no
 * "loaded synchronously" warning.
 *
 * Resolves to the `places` namespace (with both the new
 * `PlaceAutocompleteElement` and the legacy `Autocomplete`) or `null` if the
 * key isn't set / the script fails.
 */
function loadGooglePlaces(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (!GOOGLE_MAPS_KEY) return Promise.resolve(null);
  const w = window as any;

  // Already loaded.
  if (w.google?.maps?.importLibrary) {
    return w.google.maps.importLibrary("places");
  }

  // Already loading from a prior mount — wait for it.
  if (w.__gmapsLoading) {
    return w.__gmapsLoading;
  }

  w.__gmapsLoading = new Promise<any>((resolve) => {
    // Google's official inline bootstrap, transcribed verbatim from
    // https://developers.google.com/maps/documentation/javascript/load-maps-js-api
    // It registers `google.maps.importLibrary` and then we ask for `places`.
    (function (g: any) {
      let h: any,
        a: any,
        k: any,
        p = "The Google Maps JavaScript API",
        c = "google",
        l = "importLibrary",
        q = "__ib__",
        m: any = document,
        b: any = window;
      b = b[c] || (b[c] = {});
      const d = b.maps || (b.maps = {});
      const r = new Set<string>();
      const e = new URLSearchParams();
      const u = () =>
        h ||
        (h = new Promise<void>(async (f, n) => {
          a = m.createElement("script");
          e.set("libraries", Array.from(r).join(","));

          for (k in g) {
            e.set(
              k.replace(/[A-Z]/g, (t: string) => "_" + t[0].toLowerCase()),
              g[k],
            );
          }
          e.set("callback", c + ".maps." + q);
          a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
          d[q] = f;
          a.onerror = () => (h = n(Error(p + " could not load.")));
          a.nonce = m.querySelector("script[nonce]")?.nonce || "";
          m.head.append(a);
        }));
      d[l]
        ? console.warn(p + " only loads once. Ignoring:", g)
        : (d[l] = (f: string, ...n: any[]) => r.add(f) && u().then(() => d[l](f, ...n)));
    })({ key: GOOGLE_MAPS_KEY, v: "weekly" });


    // Now actually ask for places. importLibrary will trigger the script load.
    w.google.maps
      .importLibrary("places")
      .then((places: any) => resolve(places))
      .catch(() => resolve(null));
  });

  return w.__gmapsLoading;
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
  //
  // We use the legacy `places.Autocomplete` widget because it can be wired to
  // an existing <input>, which keeps our styled UI intact. The new
  // `PlaceAutocompleteElement` is a custom element that wants to render its
  // own input — switching to it would require redesigning this form. The
  // legacy widget is still supported (Google's deprecation notice says at
  // least 12 months notice will be given before removal).
  useEffect(() => {
    if (!offer) return;
    if (!streetInputRef.current) return;
    if (autocompleteRef.current) return; // already wired

    let cancelled = false;
    loadGooglePlaces().then((places: any) => {
      if (cancelled || !places || !streetInputRef.current) return;
      if (!places.Autocomplete) return;
      const ac = new places.Autocomplete(streetInputRef.current, {
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
