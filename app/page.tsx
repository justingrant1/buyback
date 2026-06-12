import Link from "next/link";

/**
 * Marketing homepage for the Witter Coin buyback program.
 *
 * Self-contained: all styles live in the `<style>` block at the bottom so the
 * editorial / "currency engraving" look doesn't bleed into the rest of the
 * portal (which uses Tailwind + globals.css). Fonts are pulled directly from
 * Google Fonts via `<link>` tags — Next's App Router hoists them into <head>
 * during streaming, which is fine for a low-traffic landing page.
 *
 * Every CTA points at /sell so visitors land in the actual buyback flow.
 */
export default function HomePage() {
  return (
    <>
      {/* Google Fonts: Bodoni Moda (display), Public Sans (body), Spline Sans Mono. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;6..96,500;6..96,600&family=Public+Sans:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500;600&display=swap"
      />

      <div className="wc-home">
        <div className="topbar">
          Offers in as little as <b>48 hours</b> · Free insured shipping · No obligation
        </div>

        <header>
          <div className="nav">
            <Link className="wordmark" href="/">
              <span className="name">WITTER COIN</span>
              <span className="sub">Buyback Program</span>
            </Link>
            <Link className="nav-cta" href="/sell">
              Get my offer
            </Link>
          </div>
        </header>

        <div className="hero">
          <svg
            className="guilloche"
            aria-hidden="true"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            viewBox="0 0 1400 760"
          >
            <defs>
              <g id="rosette">
                <ellipse
                  cx="0"
                  cy="0"
                  rx="320"
                  ry="110"
                  fill="none"
                  stroke="#C8A24B"
                  strokeWidth="0.5"
                  opacity="0.25"
                />
              </g>
            </defs>
            <g transform="translate(1180,120)">
              {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165].map((deg) => (
                <use key={deg} href="#rosette" transform={`rotate(${deg})`} />
              ))}
            </g>
            <g transform="translate(120,700) scale(0.8)">
              {[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165].map((deg) => (
                <use key={deg} href="#rosette" transform={`rotate(${deg})`} />
              ))}
            </g>
          </svg>

          <div className="hero-inner">
            <div>
              <div className="eyebrow">America's Coin Shop · San Francisco · 65 years</div>
              <h1>
                Turn your coins into cash — <em>properly.</em>
              </h1>
              <p className="lede">
                Graded slabs, junk silver, and gold. Tell us what you have and we'll email
                a clear, itemized offer — every coin priced line by line. Like the number?
                Ship free on our prepaid, insured label and get paid.
              </p>
              <div className="cta-row">
                <Link className="btn btn-gold" href="/sell">
                  Get my offer →
                </Link>
                <a className="btn btn-ghost" href="#how">
                  How it works
                </a>
              </div>
              <div className="hero-foot">
                No obligation · Free shipping label · Offers in as little as{" "}
                <span>48 hrs</span>
              </div>
            </div>

            <div className="ticket-wrap">
              <div
                className="ticket"
                role="img"
                aria-label="Example itemized offer from Witter Coin"
              >
                <div className="ticket-border" aria-hidden="true"></div>
                <div className="ticket-head">
                  <div className="t-co">Witter Coin</div>
                  <div className="t-doc">Itemized Offer · No. 04-1287</div>
                </div>
                <div className="ticket-rows">
                  <div className="t-row">
                    <div className="desc">
                      1909-S VDB Lincoln Cent
                      <small>PCGS MS64 RB · Cert 4528891</small>
                    </div>
                    <div className="amt">$1,450.00</div>
                  </div>
                  <div className="t-row">
                    <div className="desc">
                      1881-S Morgan Dollar
                      <small>NGC MS66 · Cert 6312044</small>
                    </div>
                    <div className="amt">$310.00</div>
                  </div>
                  <div className="t-row">
                    <div className="desc">
                      90% Junk Silver, $14.50 face
                      <small>Priced off live spot</small>
                    </div>
                    <div className="amt">$382.15</div>
                  </div>
                  <div className="t-row" style={{ borderBottom: "none" }}>
                    <div className="desc">
                      1oz Gold American Eagle ×2<small>Bullion · live spot</small>
                    </div>
                    <div className="amt">$6,704.00</div>
                  </div>
                </div>
                <div className="t-total">
                  <span className="lbl">Total Offer</span>
                  <span className="sum">$8,846.15</span>
                </div>
                <div className="ticket-foot">
                  <span>Approve with one click</span>
                  <svg className="seal" viewBox="0 0 60 60" aria-hidden="true">
                    <circle
                      cx="30"
                      cy="30"
                      r="27"
                      fill="none"
                      stroke="#C8A24B"
                      strokeWidth="1.4"
                    />
                    <circle
                      cx="30"
                      cy="30"
                      r="22"
                      fill="none"
                      stroke="#C8A24B"
                      strokeWidth="0.7"
                      strokeDasharray="2 2.5"
                    />
                    <text
                      x="30"
                      y="34.5"
                      textAnchor="middle"
                      fontFamily="'Bodoni Moda',serif"
                      fontSize="13"
                      fill="#A37F2E"
                      fontStyle="italic"
                    >
                      WC
                    </text>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ledger" aria-label="Program facts">
          <div className="ledger-inner">
            <div className="ledger-cell">
              <div className="big">48 hr</div>
              <div className="small">Typical offer turnaround</div>
            </div>
            <div className="ledger-cell">
              <div className="big">65 yrs</div>
              <div className="small">Trusted coin dealer</div>
            </div>
            <div className="ledger-cell">
              <div className="big">$0*</div>
              <div className="small">We pay shipping on offers $2,000+</div>
            </div>
            <div className="ledger-cell">
              <div className="big">Insured</div>
              <div className="small">FedEx 2-day on high value</div>
            </div>
          </div>
        </div>

        <section id="how">
          <div className="shell">
            <div className="sec-eyebrow">The Process</div>
            <h2>Sell back in three simple steps</h2>
            <p className="sec-sub">
              No haggling, no guesswork. A clear, transparent process from list to payout.
            </p>

            <div className="steps">
              <div className="step">
                <div className="no">i.</div>
                <div>
                  <h3>Submit your coins</h3>
                  <span className="tag">Takes a few minutes</span>
                </div>
                <p>
                  Snap a photo of a graded slab, upload your list, or type it in — graded
                  certs, silver, or gold. From a single coin to an entire collection.
                </p>
              </div>
              <div className="step">
                <div className="no">ii.</div>
                <div>
                  <h3>Get your offer</h3>
                  <span className="tag">Itemized, line by line</span>
                </div>
                <p>
                  Our experts review every item and email a clear, itemized offer — no
                  haggling, no surprises. You decide if it's right for you.
                </p>
              </div>
              <div className="step">
                <div className="no">iii.</div>
                <div>
                  <h3>Ship free &amp; get paid</h3>
                  <span className="tag">Prepaid, insured label</span>
                </div>
                <p>
                  Like the offer? Approve with one click. We send a prepaid, insured label
                  — once it arrives, you get paid fast.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="buy">
          <div className="shell">
            <div className="sec-eyebrow">What We Buy</div>
            <h2>From a single key-date slab to an entire collection</h2>
            <p className="sec-sub">
              Large lots welcome. Every category priced by people who handle these coins
              daily.
            </p>

            <div className="cats">
              <div className="cat">
                <div className="cert">
                  <span>Category</span>
                  <b>01 / 03</b>
                </div>
                <h3>Graded Slabs</h3>
                <p>PCGS, NGC, CACG — certified coins of every grade.</p>
              </div>
              <div className="cat">
                <div className="cert">
                  <span>Category</span>
                  <b>02 / 03</b>
                </div>
                <h3>Junk Silver</h3>
                <p>90% &amp; 40% silver priced strong off live spot.</p>
              </div>
              <div className="cat">
                <div className="cert">
                  <span>Category</span>
                  <b>03 / 03</b>
                </div>
                <h3>Gold &amp; World</h3>
                <p>Bullion, gold coins, and world numismatics.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="cta-band" id="start">
          <svg
            className="guilloche"
            aria-hidden="true"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid slice"
            viewBox="0 0 1400 420"
          >
            <g transform="translate(700,210)">
              {[0, 12, 24, -12, -24].map((deg) => (
                <ellipse
                  key={deg}
                  rx="520"
                  ry="120"
                  fill="none"
                  stroke="#C8A24B"
                  strokeWidth="0.5"
                  opacity="0.22"
                  transform={`rotate(${deg})`}
                />
              ))}
            </g>
          </svg>
          <div className="cta-inner">
            <h2>
              Ready to see what your coins are <em>worth?</em>
            </h2>
            <p>
              Start your buyback now — it takes a few minutes and there's no obligation.
            </p>
            <Link className="btn btn-gold" href="/sell">
              Start a buyback →
            </Link>
            <div className="hero-foot">
              Itemized offer by email · No obligation · You stay in control
            </div>
          </div>
        </section>

        <footer>
          <div className="foot-inner">
            <span>© 2026 Witter Coin · America's Coin Shop · San Francisco</span>
            <a href="mailto:buyback@wittercoin.com">buyback@wittercoin.com</a>
          </div>
        </footer>
      </div>

      {/* All homepage styles, scoped under .wc-home so we don't disturb /sell, /admin, etc. */}
      <style>{`
.wc-home{
  --ink:#0F2E22;
  --ink-deep:#0A2118;
  --paper:#F7F6F1;
  --paper-raise:#FFFFFF;
  --text:#1A2620;
  --text-soft:#5C6B62;
  --gold:#C8A24B;
  --gold-deep:#A37F2E;
  --silver:#ADB6BD;
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
}
.wc-home *{margin:0;padding:0;box-sizing:border-box}
.wc-home a{color:inherit}
.wc-home :focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:2px}

/* topbar */
.wc-home .topbar{background:var(--ink-deep);color:#E9E5D8;font-family:var(--mono);font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;text-align:center;padding:9px 16px}
.wc-home .topbar b{color:var(--gold);font-weight:600}

/* header */
.wc-home header{background:var(--ink);border-bottom:1px solid rgba(200,162,75,.25)}
.wc-home .nav{max-width:1180px;margin:0 auto;padding:18px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.wc-home .wordmark{display:flex;align-items:baseline;gap:12px;color:#F3EFE3;text-decoration:none}
.wc-home .wordmark .name{font-family:var(--display);font-size:21px;font-weight:600;letter-spacing:.04em}
.wc-home .wordmark .sub{font-family:var(--mono);font-size:10.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold)}
.wc-home .nav-cta{font-family:var(--body);font-weight:600;font-size:14px;color:var(--ink);background:linear-gradient(180deg,#D9B660,#BE9740);text-decoration:none;padding:10px 18px;border-radius:3px;white-space:nowrap}
.wc-home .nav-cta:hover{filter:brightness(1.06)}

/* hero */
.wc-home .hero{position:relative;background:var(--ink);color:#F3EFE3;overflow:hidden}
.wc-home .hero .guilloche{position:absolute;inset:0;opacity:.5;pointer-events:none}
.wc-home .hero-inner{position:relative;max-width:1180px;margin:0 auto;padding:88px 28px 96px;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:64px;align-items:center}
.wc-home .eyebrow{font-family:var(--mono);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--gold);display:flex;align-items:center;gap:14px;margin-bottom:26px}
.wc-home .eyebrow::before{content:"";height:1px;width:34px;background:var(--gold);opacity:.6}
.wc-home h1{font-family:var(--display);font-weight:500;font-size:clamp(40px,5.2vw,64px);line-height:1.06;letter-spacing:.005em;margin-bottom:24px}
.wc-home h1 em{font-style:italic;color:var(--gold)}
.wc-home .hero p.lede{font-size:17px;line-height:1.7;color:#C9CFC4;max-width:52ch;margin-bottom:34px}
.wc-home .cta-row{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.wc-home .btn{display:inline-block;text-decoration:none;font-weight:600;font-size:15.5px;padding:15px 28px;border-radius:3px;transition:transform .15s ease,filter .15s ease}
.wc-home .btn:active{transform:translateY(1px)}
.wc-home .btn-gold{color:var(--ink-deep);background:linear-gradient(180deg,#E0BE68,#BE9740);box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 8px 24px rgba(0,0,0,.35)}
.wc-home .btn-gold:hover{filter:brightness(1.07)}
.wc-home .btn-ghost{color:#EDE8DA;border:1px solid rgba(237,232,218,.35)}
.wc-home .btn-ghost:hover{border-color:var(--gold);color:var(--gold)}
.wc-home .hero-foot{margin-top:26px;font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:#9FAA9F}
.wc-home .hero-foot span{color:var(--gold)}

/* ticket */
.wc-home .ticket-wrap{perspective:1200px}
.wc-home .ticket{background:var(--paper-raise);color:var(--text);border-radius:4px;box-shadow:0 30px 70px rgba(0,0,0,.45),0 2px 0 rgba(255,255,255,.06);position:relative;animation:wcTicketIn .9s cubic-bezier(.2,.7,.2,1) both .15s}
@keyframes wcTicketIn{from{opacity:0;transform:translateY(26px) rotateX(6deg)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){
  .wc-home .ticket{animation:none}
}
.wc-home .ticket-border{position:absolute;inset:9px;border:1px solid var(--gold);border-radius:2px;pointer-events:none}
.wc-home .ticket-border::after{content:"";position:absolute;inset:3px;border:1px solid rgba(200,162,75,.35)}
.wc-home .ticket-head{padding:26px 30px 16px;text-align:center;border-bottom:1px dashed var(--hairline)}
.wc-home .ticket-head .t-co{font-family:var(--display);font-size:18px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--ink)}
.wc-home .ticket-head .t-doc{font-family:var(--mono);font-size:10.5px;letter-spacing:.3em;text-transform:uppercase;color:var(--text-soft);margin-top:5px}
.wc-home .ticket-rows{padding:18px 30px 8px}
.wc-home .t-row{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:9px 0;border-bottom:1px solid #EFEDE5;font-size:13.5px}
.wc-home .t-row .desc{line-height:1.4}
.wc-home .t-row .desc small{display:block;font-family:var(--mono);font-size:10.5px;color:var(--text-soft);letter-spacing:.04em;margin-top:2px}
.wc-home .t-row .amt{font-family:var(--mono);font-weight:500;white-space:nowrap}
.wc-home .t-total{display:flex;justify-content:space-between;align-items:center;padding:16px 30px 8px}
.wc-home .t-total .lbl{font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--text-soft)}
.wc-home .t-total .sum{font-family:var(--display);font-size:30px;font-weight:600;color:var(--ink)}
.wc-home .ticket-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 30px 24px;font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;color:var(--text-soft)}
.wc-home .seal{width:54px;height:54px;flex:none}

/* ledger */
.wc-home .ledger{background:var(--paper);border-bottom:1px solid var(--hairline)}
.wc-home .ledger-inner{max-width:1180px;margin:0 auto;padding:0 28px;display:grid;grid-template-columns:repeat(4,1fr)}
.wc-home .ledger-cell{padding:30px 22px;border-left:1px solid var(--hairline);text-align:left}
.wc-home .ledger-cell:first-child{border-left:none;padding-left:0}
.wc-home .ledger-cell .big{font-family:var(--display);font-size:30px;font-weight:600;color:var(--ink);line-height:1}
.wc-home .ledger-cell .small{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-soft);margin-top:9px}

/* sections */
.wc-home section{padding:96px 28px}
.wc-home .shell{max-width:1180px;margin:0 auto}
.wc-home .sec-eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.26em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:16px}
.wc-home h2{font-family:var(--display);font-weight:500;font-size:clamp(30px,3.6vw,44px);line-height:1.1;color:var(--ink);max-width:22ch}
.wc-home .sec-sub{margin-top:14px;color:var(--text-soft);max-width:56ch}

/* steps */
.wc-home .steps{margin-top:56px;border-top:1px solid var(--hairline)}
.wc-home .step{display:grid;grid-template-columns:120px minmax(0,.85fr) minmax(0,1.3fr);gap:28px;padding:36px 0;border-bottom:1px solid var(--hairline);align-items:baseline}
.wc-home .step .no{font-family:var(--display);font-size:44px;font-weight:500;font-style:italic;color:var(--gold-deep);line-height:1}
.wc-home .step h3{font-family:var(--body);font-weight:700;font-size:18px;color:var(--ink);letter-spacing:.01em}
.wc-home .step p{color:var(--text-soft);font-size:15.5px}
.wc-home .step .tag{display:inline-block;margin-top:10px;font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold-deep);border:1px solid var(--hairline-dark);padding:4px 10px;border-radius:99px}

/* what we buy */
.wc-home .buy{background:var(--paper-raise);border-top:1px solid var(--hairline);border-bottom:1px solid var(--hairline)}
.wc-home .cats{margin-top:52px;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.wc-home .cat{border:1px solid var(--hairline);border-radius:4px;background:var(--paper);padding:26px 24px 24px;position:relative;transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease}
.wc-home .cat:hover{border-color:var(--gold);transform:translateY(-3px);box-shadow:0 14px 34px rgba(15,46,34,.10)}
.wc-home .cat .cert{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--text-soft);display:flex;justify-content:space-between;border-bottom:1px solid var(--hairline);padding-bottom:12px;margin-bottom:16px}
.wc-home .cat h3{font-family:var(--display);font-size:21px;font-weight:600;color:var(--ink);margin-bottom:9px}
.wc-home .cat p{font-size:14px;color:var(--text-soft);line-height:1.6}
.wc-home .cat .cert b{color:var(--gold-deep);font-weight:600}

/* final CTA */
.wc-home .cta-band{background:var(--ink);position:relative;overflow:hidden}
.wc-home .cta-band .guilloche{position:absolute;inset:0;opacity:.4;pointer-events:none}
.wc-home .cta-inner{position:relative;max-width:880px;margin:0 auto;text-align:center;padding:0 28px}
.wc-home .cta-inner h2{color:#F3EFE3;margin:0 auto;max-width:none}
.wc-home .cta-inner h2 em{font-style:italic;color:var(--gold)}
.wc-home .cta-inner p{color:#C9CFC4;margin:18px auto 36px;max-width:48ch}
.wc-home .cta-inner .hero-foot{margin-top:24px}

/* footer */
.wc-home footer{background:var(--ink-deep);color:#9FAA9F;padding:34px 28px}
.wc-home .foot-inner{max-width:1180px;margin:0 auto;display:flex;justify-content:space-between;align-items:center;gap:16px;font-family:var(--mono);font-size:12px;letter-spacing:.06em}
.wc-home .foot-inner a{color:var(--gold);text-decoration:none}
.wc-home .foot-inner a:hover{text-decoration:underline}

/* responsive */
@media (max-width:980px){
  .wc-home .hero-inner{grid-template-columns:1fr;gap:52px;padding:64px 24px 72px}
  .wc-home .ledger-inner{grid-template-columns:repeat(2,1fr)}
  .wc-home .ledger-cell{padding:24px 18px}
  .wc-home .ledger-cell:nth-child(odd){border-left:none;padding-left:0}
  .wc-home .step{grid-template-columns:64px 1fr;grid-template-rows:auto auto}
  .wc-home .step p{grid-column:2}
  .wc-home .cats{grid-template-columns:repeat(2,1fr)}
}
@media (max-width:560px){
  .wc-home section{padding:68px 20px}
  .wc-home .cats{grid-template-columns:1fr}
  .wc-home .ledger-inner{grid-template-columns:repeat(2,1fr)}
  .wc-home .foot-inner{flex-direction:column;text-align:center}
  .wc-home .t-total .sum{font-size:25px}
}
      `}</style>
    </>
  );
}
