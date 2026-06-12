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
 * Normalize a Place's address components into our { street, city, state, zip }
 * shape. Handles both the legacy snake_case PlaceResult (`address_components`,
 * `long_name`, `short_name`) and the new Places API camelCase Place
 * (`addressComponents`, `longText`, `shortText`) — the new
 * `PlaceAutocompleteElement` returns the latter.
 */
function placeToAddress(place: any): {
  street: string;
  city: string;
  state: string;
  zip: string;
} {
  const comps: any[] = place?.addressComponents ?? place?.address_components ?? [];
  const get = (type: string, short = false) => {
    const c = comps.find((x) => x.types?.includes(type));
    if (!c) return "";
    // New API uses longText/shortText; legacy uses long_name/short_name.
    return short
      ? c.shortText ?? c.short_name ?? ""
      : c.longText ?? c.long_name ?? "";
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
  // Container the new <gmp-place-autocomplete> element mounts into. The
  // element renders its own input internally — we just give it a slot in our
  // layout and read the selection event.
  const autocompleteHostRef = useRef<HTMLDivElement | null>(null);
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

  // Attach Google Places autocomplete once the offer has loaded (and only if
  // we have a key configured). When the customer picks a suggestion, all four
  // address fields are auto-populated.
  //
  // We use the new `PlaceAutocompleteElement` (the Web Component
  // <gmp-place-autocomplete>) — the legacy `places.Autocomplete` widget is no
  // longer enabled for projects created after March 1, 2025. The element
  // renders its own input internally, so we just mount it in a host div and
  // listen for the `gmp-select` event; we then call `place.fetchFields(...)`
  // to pull the address components.
  useEffect(() => {
    if (!offer) return;
    if (!autocompleteHostRef.current) return;
    if (autocompleteRef.current) return; // already wired

    let cancelled = false;
    loadGooglePlaces().then((places: any) => {
      if (cancelled || !places || !autocompleteHostRef.current) return;
      if (!places.PlaceAutocompleteElement) return;

      let el: any;
      try {
        el = new places.PlaceAutocompleteElement({
          includedRegionCodes: ["us"],
          types: ["address"],
        });
      } catch {
        // Older preview builds used a different option shape. Fall back to a
        // plain constructor and configure via attributes/properties.
        try {
          el = new places.PlaceAutocompleteElement();
          (el as any).includedRegionCodes = ["us"];
        } catch {
          return;
        }
      }

      // Match our other inputs visually. The element exposes ::part(input)
      // for the inner <input> — we style that via globals.css.
      el.classList.add("gmp-autocomplete");
      el.style.width = "100%";

      const onSelect = async (ev: any) => {
        try {
          const prediction = ev?.placePrediction ?? ev?.detail?.placePrediction;
          if (!prediction) return;
          const place = prediction.toPlace();
          // Ask only for the fields we actually need so we don't get billed
          // for the full Place details SKU.
          await place.fetchFields({
            fields: ["addressComponents", "formattedAddress"],
          });
          // place.toJSON() yields camelCase; the live object also exposes
          // the same properties.
          const data = typeof place.toJSON === "function" ? place.toJSON() : place;
          const addr = placeToAddress(data);
          if (addr.street || addr.city || addr.state || addr.zip) {
            setShip(addr);
          }
        } catch (e) {
          console.warn("[offer] place select handler failed:", e);
        }
      };

      // The stable event name is `gmp-select`. Some preview builds emitted
      // `gmp-placeselect` — listen for both, the no-op cost is nothing.
      el.addEventListener("gmp-select", onSelect);
      el.addEventListener("gmp-placeselect", onSelect);

      autocompleteHostRef.current.appendChild(el);
      autocompleteRef.current = el;
    });

    return () => {
      cancelled = true;
      const host = autocompleteHostRef.current;
      const el = autocompleteRef.current;
      if (host && el && el.parentNode === host) host.removeChild(el);
      autocompleteRef.current = null;
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
      // Read the response defensively: if the server (our route) returns
      // JSON we get the real error; if Vercel's gateway returns HTML
      // (502/504), res.json() throws — fall back to showing the status code
      // so the customer at least sees something more useful than nothing.
      let d: any = null;
      let raw = "";
      try {
        raw = await res.text();
        d = raw ? JSON.parse(raw) : null;
      } catch {
        d = null;
      }
      if (!res.ok) {
        if (d?.error) {
          throw new Error(d.error);
        }
        // Most common cause when this branch fires is Vercel's edge returning
        // 502/504 because our serverless function exceeded its 10s timeout
        // (Shippo's `/transactions/` call can do this on cold starts +
        // unverified addresses). Surface that explicitly so customer support
        // knows what to do.
        const hint =
          res.status === 502 || res.status === 504
            ? " The shipping-label service took too long to respond. Please try again in a moment — if it keeps happening, contact buyback@wittercoin.com and we'll send your label manually."
            : "";
        throw new Error(`Request failed (${res.status}).${hint}`);
      }
      if (!d) throw new Error("Unexpected empty response from the server.");
      // The server returns HTTP 200 with `ok: false` for label/Shippo errors
      // (we deliberately avoid returning 5xx so Vercel's edge doesn't replace
      // our JSON body with a generic "502 Bad Gateway" HTML page). Surface
      // the real reason here.
      if (d.ok === false) {
        throw new Error(d.error ?? "Could not generate a shipping label.");
      }
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
                {GOOGLE_MAPS_KEY ? (
                  // Host for <gmp-place-autocomplete>. The element renders
                  // its own input; we style it via .gmp-autocomplete in
                  // globals.css so it visually matches our other inputs.
                  <div ref={autocompleteHostRef} className="sm:col-span-2" />
                ) : (
                  <input
                    className="input sm:col-span-2"
                    placeholder="Street address"
                    autoComplete="off"
                    value={ship.street}
                    onChange={(e) => setShip({ ...ship, street: e.target.value })}
                  />
                )}

                {/* Always show the parsed street so the customer can edit it
                    after picking from autocomplete (apartment number etc.). */}
                {GOOGLE_MAPS_KEY && (
                  <input
                    className="input sm:col-span-2"
                    placeholder="Street address (apt, suite, etc.)"
                    autoComplete="off"
                    value={ship.street}
                    onChange={(e) => setShip({ ...ship, street: e.target.value })}
                  />
                )}

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
