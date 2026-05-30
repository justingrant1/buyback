# Witter Coin Buyback Portal — Technical & Product Overview

**Audience:** CEO / CTO / Senior Engineers
**Status:** MVP built, deployed to Vercel, integrations wired with graceful fallbacks
**Repo:** `github.com/justingrant1/buyback`
**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind · Airtable (system of record) · Shippo (labels) · SendGrid (email) · CDN/Greysheet + PCGS (pricing) · Anthropic Vision (slab photos)

---

## 1. The problem we're solving

Today the buyback program runs entirely out of a shared Gmail inbox:

1. Customers email coins / spreadsheets / photos to a buyback address.
2. Marley **hand-builds** a bid sheet in a spreadsheet for each one.
3. He emails a boilerplate offer, waits for a reply.
4. On approval, he **manually** creates a FedEx label and ships.

This does not scale. Volume is high (average **~$10K per batch**, one batch hit **$71K**), ~70–80% of intake now flows through the buyback email, and low-value "junk" submissions consume time that should be reserved for the big-fish customers. There is no priority queue, no margin visibility, and pricing/arrival-date mistakes happen under load.

**Goal:** convert an ad-hoc, manual, email-driven process into a structured funnel with automated pricing, a prioritized work queue, one-click offers, and automated label generation — while preserving the personal touch for VIP customers.

---

## 2. Solution at a glance

```
Customer ──► /sell web form ──► auto-price (CDN bid/ask + PCGS) ──► Airtable
                                                                     │
Marley  ──► /admin priority queue (VIP + value + age) ──► review/adjust offer
                                                                     │
                          ──► "Send offer" email w/ approve link ────┘
                                                                     │
Customer ──► /offer/:token ──► Accept ──► auto FedEx label (Shippo) + email
```

---

## 3. Architecture

- **Framework:** Next.js 14 App Router. UI pages are React Server/Client components; backend is implemented as Route Handlers under `app/api/**`.
- **System of record:** Airtable base `BuyBack` (`appFojtGFQF3Ga4Tx`), three linked tables. Chosen so Marley/Ben can view, sort, and hand-edit records directly while the app reads/writes via API.
- **Auth:** single shared staff password (`APP_PASSWORD`) → signed session cookie (`SESSION_SECRET`). Enforced by `middleware.ts` over `/admin` and `/api/admin/*`.
- **Customer offer security:** each buyback has an unguessable `approvalToken`; the customer offer page is reachable only via `/offer/:token` — no login required for sellers.
- **Graceful degradation:** every third-party integration **stubs cleanly** when its key is absent, so the entire flow is runnable/testable without secrets.

### Directory map
| Path | Responsibility |
|---|---|
| `app/page.tsx` | Customer marketing landing page (CTA → `/sell`); discreet staff login top-right |
| `app/sell/page.tsx` | Public intake form |
| `app/offer/[token]/page.tsx` | Token-gated customer offer review / accept / decline |
| `app/admin/page.tsx` | Staff priority queue + KPIs |
| `app/admin/[id]/page.tsx` | Bid-sheet editor (line items, margin, send offer, CSV) |
| `app/admin/login/page.tsx` | Staff login |
| `app/api/**` | Route handlers (see API table) |
| `lib/pricing.ts` | Reference value, suggested offer, margin, VIP/low-value flags, priority score |
| `lib/cdn.ts`, `lib/cdnCatalog.ts` | Greysheet/CDN bid-ask lookups |
| `lib/pcgs.ts` | PCGS cert lookups |
| `lib/vision.ts`, `lib/imageCrop.ts` | Slab photo → fields (Anthropic Vision) |
| `lib/buybackAirtable.ts` | Airtable read/write data layer |
| `lib/shippo.ts` | Prepaid label generation (stubs when no key) |
| `lib/email.ts` | Offer/label emails via SendGrid (logs when no key) |
| `lib/metals.ts` | Spot metal pricing for junk silver |
| `lib/auth.ts`, `middleware.ts` | Session + route protection |
| `lib/env.ts` | Validated env access + business-rule thresholds |
| `lib/ref.ts` | Human-readable buyback reference codes |

---

## 4. API surface

| Route | Method | Purpose |
|---|---|---|
| `/api/price-items` | POST | Price a list of coins via CDN/PCGS (used by form + internal tools) |
| `/api/submit` | POST | Create a buyback + items in Airtable; flag VIP / low-value |
| `/api/admin/buybacks` | GET | Priority-sorted queue (`?status=` filter) |
| `/api/admin/buybacks/:id` | GET / PATCH | Detail + update offer/status (recomputes margin) |
| `/api/admin/buybacks/:id/send-offer` | POST | Email itemized offer + approve link |
| `/api/offer/:token` | GET | Customer-safe offer view |
| `/api/offer/:token/approve` | POST | Accept → Shippo label + email, or decline |
| `/api/admin/login` | POST / DELETE | Staff login / logout |

---

## 5. Pricing model (per Marley's actual workflow)

CDN/Greysheet bid-ask is the backbone, but the logic mirrors how Marley actually prices:

- **Anchor on CDN _bid_**, not retail — Greysheet is inflated for generics.
- **Reference value** = our value of the coin to us. `bid × qty`; if only ask is known, use a conservative `ask × 0.85`.
- **Suggested offer** = `reference × (1 − margin)`. Default margin **15%** (`DEFAULT_MARGIN`, tunable 10–20%).
- **Junk silver** gets a thinner `JUNK_MARGIN` (~5%) since it's the price floor and we pay strong on it.
- **VIP batches** (≥ `VIP_THRESHOLD`, default **$20K**) are flagged for a personal touch and never auto-priced away.
- **Low-value batches** (< `LOW_VALUE_FLOOR`, default **$2,500**) are deprioritized in the queue.
- **Priority score** (admin queue ordering): VIP dominates, then value (capped), then age (older bubbles up); low-value gets pushed down.

All numbers above are env-driven so leadership/Marley can retune without code changes.

---

## 6. Data model (Airtable, 3 linked tables)

- **Customers** — name, email, phone, VIP flag, lifetime stats, # times sold back.
- **Buybacks** — Ref, Status, Customer (link), Date Submitted/Received, Item Count, Estimated Value, Offer Amount, Margin %, Avg Coin Value, Approval Token, Label URL, Tracking #, Carrier, Source, Notes.
- **Buyback Items** — Description, Qty, Grading Service, Cert #, Year, Denomination, Grade, CAC, CDN Bid/Ask, Dealer Ask, Offer, Category (Slab/Raw/Junk Silver/Gold/World).

Status lifecycle: `New → Pricing → Offer Sent → Approved/Declined → Label Sent → In Transit → Received → Paid`.

---

## 7. Integrations & fallback behavior

| Integration | Used for | If key absent |
|---|---|---|
| Airtable | System of record | **Required** |
| CDN / Greysheet | Bid/ask pricing | Items priced without market data (manual entry) |
| PCGS | Cert # → coin details | Slab fields entered manually |
| Anthropic Vision | Slab photo → fields | Photo intake disabled; manual entry |
| Shippo | Prepaid FedEx labels | Returns a **fake** tracking #/label (`stub: true`) |
| SendGrid | Offer + label emails | **Logs** the email to console instead of sending |
| Metals.dev | Junk silver spot/melt | Junk silver falls back to manual entry |

This is intentional: the product is demonstrable and end-to-end testable before every vendor account is provisioned.

---

## 8. Security notes

- Secrets live only in `.env.local` (gitignored). Only `.env.example` (no values) is committed.
- `SESSION_SECRET` is a long random string used to sign the staff session cookie.
- Customer offer access is via a per-record unguessable token, not an account.
- All `/admin` and `/api/admin/*` routes sit behind middleware auth.
- **Production deploy:** set the same env vars in Vercel → Project → Settings → Environment Variables, and set `APP_BASE_URL` to the production domain so emailed approve links resolve correctly.

---

## 9. Local setup

```bash
cp .env.example .env.local   # fill APP_PASSWORD + SESSION_SECRET + Airtable + CDN
npm install
npm run dev                  # http://localhost:3000
npm run build                # production build check
```

- Customer flow: `/sell` → submit coins → record appears in Airtable.
- Staff flow: `/admin` (password = `APP_PASSWORD`) → price → send offer → open the (stubbed) email link → Accept → label generated.

---

## 10. Roadmap (discussed, not yet built)

1. **AI email parser** — for customers who won't leave email: read the inbox, extract coins from spreadsheets/images, draft a bid sheet straight into the queue.
2. **Arrival-date spot pricing** — auto-use the silver price from the day a package *arrived*, not today's, to prevent the mispricing Marley flagged.
3. **Slab Pricer photo bridge** — "photograph the box of slabs" → items straight into a buyback (the camera flow demoed).
4. **Payout tracking** — Stripe/ACH once coins are received and cleared.
5. **Customer accounts / history** — repeat-seller recognition to keep big fish "in the fold."

---

## 11. Key product decisions & rationale

- **Web form as the primary funnel, VIP-by-email preserved.** Marley was clear the biggest customers (Teresa, Mike — $50K+/week) should not be forced to do more work; the form deflects the long tail of low-value email while keeping high-value relationships personal.
- **Airtable over a custom DB.** Keeps the staff in a familiar, directly-editable tool and shortens time-to-value; can migrate later if scale demands.
- **Margin made visible per batch.** Marley estimated 10–20% per batch; surfacing live margin in the editor protects profitability under high volume.
- **Stub-everything strategy.** Lets us ship and demo immediately, then turn on vendors incrementally.
