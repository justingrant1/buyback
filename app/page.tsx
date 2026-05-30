import Link from "next/link";

const SUPPORT_EMAIL = "buyback@wittercoin.com";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Discreet employee login — top right */}
      <Link
        href="/admin"
        className="absolute right-4 top-4 z-20 text-xs font-medium text-slate-400 transition hover:text-slate-600"
        aria-label="Staff login"
      >
        Staff Login
      </Link>

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-dark to-brand text-white">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(60%_50%_at_50%_0%,white,transparent)]" />
        <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-20 text-center sm:pt-24">
          <span className="badge bg-white/15 text-white ring-1 ring-inset ring-white/20">
            Witter Coin · Coin Buyback Program
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Turn your coins into cash — at a fair price, fast.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-cyan-50/90">
            Graded slabs, raw coins, junk silver, and gold. Send us your list and we&apos;ll
            price it against live Greysheet (CDN) bid/ask, then email you an itemized offer
            with a prepaid, fully-insured shipping label.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/sell"
              className="btn bg-white px-8 py-3.5 text-base font-semibold text-brand-dark shadow-lg shadow-black/10 hover:bg-cyan-50"
            >
              Get My Offer →
            </Link>
            <a
              href="#how-it-works"
              className="btn px-6 py-3.5 text-base font-semibold text-white ring-1 ring-inset ring-white/40 hover:bg-white/10"
            >
              How it works
            </a>
          </div>
          <p className="mt-6 text-sm text-cyan-50/70">
            No obligation · Free shipping label · Offers in as little as 24 hours
          </p>
        </div>
      </section>

      {/* ──────────────────── Trust strip ──────────────────── */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-8 text-center sm:grid-cols-4">
          {[
            { stat: "24 hr", label: "Typical offer turnaround" },
            { stat: "Live CDN", label: "Greysheet bid/ask pricing" },
            { stat: "$0", label: "Cost to ship — we pay" },
            { stat: "Insured", label: "FedEx 2-day on high value" },
          ].map((i) => (
            <div key={i.label}>
              <div className="text-2xl font-bold text-brand">{i.stat}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">{i.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────── How it works ──────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-ink">
            Sell back in three simple steps
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            No haggling, no guesswork. A clear, transparent process from list to payout.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "1",
              title: "Submit your coins",
              body: "Enter your coins — graded certs, raw pieces, silver, or gold. Upload photos or paste your itemized list.",
            },
            {
              n: "2",
              title: "Get a transparent offer",
              body: "We price every item against live Greysheet (CDN) bid/ask and email you an itemized offer to review.",
            },
            {
              n: "3",
              title: "Ship free & get paid",
              body: "Approve with one click. We send a prepaid, insured label — once it arrives and clears, you get paid.",
            },
          ].map((s) => (
            <div key={s.n} className="card p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand/10 text-lg font-bold text-brand">
                {s.n}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ──────────────────── What we buy ──────────────────── */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-ink">What we buy</h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-600">
              From a single key-date slab to an entire collection — large lots welcome.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Graded Slabs", d: "PCGS, NGC, CACG — certified coins of every grade." },
              { t: "Raw Coins", d: "Uncertified U.S. coins, type, and key dates." },
              { t: "Junk Silver", d: "90% & 40% silver priced strong off live spot." },
              { t: "Gold & World", d: "Bullion, gold coins, and world numismatics." },
            ].map((c) => (
              <div key={c.t} className="card p-6">
                <h3 className="font-semibold text-ink">{c.t}</h3>
                <p className="mt-2 text-sm text-slate-600">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────── Final CTA ──────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="card overflow-hidden bg-gradient-to-r from-brand-dark to-brand p-10 text-center text-white sm:p-14">
          <h2 className="text-3xl font-bold tracking-tight">Ready to see what your coins are worth?</h2>
          <p className="mx-auto mt-3 max-w-xl text-cyan-50/90">
            Start your buyback now — it takes a few minutes and there&apos;s no obligation.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/sell"
              className="btn bg-white px-8 py-3.5 text-base font-semibold text-brand-dark shadow-lg shadow-black/10 hover:bg-cyan-50"
            >
              Start a Buyback →
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────── Footer ──────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-slate-500 sm:flex-row">
          <span>© {new Date().getFullYear()} Witter Coin · Buyback Program</span>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="font-medium text-brand hover:text-brand-dark">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </footer>
    </div>
  );
}
