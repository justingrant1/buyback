import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="badge bg-brand/10 text-brand">Witter Coin</span>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-ink">
        Sell your coins back to Witter Coin
      </h1>
      <p className="mt-4 max-w-xl text-slate-600">
        Get a fair, fast offer on your graded slabs, raw coins, junk silver, and gold.
        Submit your list, we price it against live Greysheet (CDN) bid/ask, and send you
        an itemized offer with a prepaid shipping label.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/sell" className="btn-primary px-6 py-3 text-base">
          Start a Buyback
        </Link>
        <Link href="/admin" className="btn-ghost px-6 py-3 text-base">
          Staff Login
        </Link>
      </div>
      <p className="mt-10 text-xs text-slate-400">
        Questions? Email buyback@wittercoin.com
      </p>
    </main>
  );
}
