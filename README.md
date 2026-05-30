# Witter Coin — Buyback Portal

A self-serve buyback intake + pricing + fulfillment workflow that replaces the
all-manual "everyone emails the Gmail" process Marley described.

Today: customers email coins/spreadsheets/photos → Marley hand-builds a bid
sheet in a spreadsheet → emails a boilerplate offer → manually makes a FedEx
label after approval. It doesn't scale with the volume (avg ~$10k/batch, up to
$71k), and low-value "junk" emails eat time that should go to the big fish.

This app turns that into a funnel:

```
Customer  ──►  /sell web form  ──►  auto-price (CDN bid/ask + PCGS)  ──►  Airtable
                                                                          │
Marley  ──►  /admin priority queue (VIP + value + age)  ──►  review/adjust offer
                                                                          │
                              ──►  "Send offer" email w/ approve link  ───┘
                                                                          │
Customer  ──►  /offer/:token  ──►  Accept  ──►  auto FedEx label (Shippo) + email
```

## What's built

### Customer-facing
- **`/sell`** — public intake form. Add coins (slab/raw/junk/gold/world), with
  grading service + cert number for slabs so they price fastest.
- **`/offer/:token`** — token-gated offer review. Customer sees the itemized bid,
  enters their ship-from address, and **Accepts** (→ prepaid label) or **Declines**.

### Internal (password-gated `/admin`)
- **`/admin`** — the **priority queue** Marley asked for: VIPs, highest value, and
  oldest first, plus KPIs (open buybacks, pipeline value, "need pricing" count)
  and status filters.
- **`/admin/:id`** — the bid-sheet editor: line items with CDN bid/ask, a
  **suggested offer** + **live margin**, set/send the offer email, mark
  Received/Paid/Declined, and **Download CSV** (the spreadsheet Marley builds today).

### APIs
| Route | Purpose |
|---|---|
| `POST /api/price-items` | price a list of coins via CDN/PCGS (used by form + tools) |
| `POST /api/submit` | create a buyback + items in Airtable, flag VIP/low-value |
| `GET /api/admin/buybacks` | priority-sorted queue (`?status=` filter) |
| `GET/PATCH /api/admin/buybacks/:id` | detail + update offer/status (recomputes margin) |
| `POST /api/admin/buybacks/:id/send-offer` | email the itemized offer + approve link |
| `GET /api/offer/:token` | customer-safe offer view |
| `POST /api/offer/:token/approve` | accept → Shippo label + email, or decline |
| `POST/DELETE /api/admin/login` | staff login / logout |

## Pricing model
Per Marley: CDN bid/ask is the backbone, but he leans on **bids** (Greysheet is
inflated for generics) and pays **strong on junk silver** since it's the floor.
So `lib/pricing.ts` uses CDN **bid** as the reference value, applies a
`DEFAULT_MARGIN` (10–20%) for most coins and a thinner `JUNK_MARGIN` for junk
silver, and surfaces a **suggested offer** Marley can override per batch. Big
auction-grade/world coins still get a human — those are flagged **VIP** above
`VIP_THRESHOLD` and never auto-priced away.

## Graceful degradation (build now, add keys later)
Every external integration stubs cleanly when its key is absent, so the whole
flow is testable today:
- **Shippo** missing → returns a fake tracking #/label URL (`stub: true`).
- **SendGrid** missing → logs the email to the console instead of sending.
- **Metals** missing → junk silver falls back to manual entry.

## Getting started
```bash
cp .env.example .env.local   # fill in at least APP_PASSWORD + SESSION_SECRET + Airtable/CDN
npm install
npm run dev                  # http://localhost:3000
```
- Customer flow: open `/sell`, submit a few coins, watch it land in Airtable.
- Staff flow: open `/admin` (password = `APP_PASSWORD`), price it, send the offer,
  then open the link from the (stubbed) email and Accept to generate a label.

## Airtable schema (3 tables)
- **Customers** — name, email, phone, VIP, lifetime stats, # times sold back.
- **Buybacks** — Ref, Status, Customer, Date Submitted/Received, Item Count,
  Estimated Value, Offer Amount, Margin %, Avg Coin Value, Approval Token,
  Label URL, Tracking Number, Carrier, Source, Notes.
- **Buyback Items** — Description, Qty, Grading Service, Cert #, Year,
  Denomination, Grade, CAC, CDN Bid/Ask, Dealer Ask, Offer, Category.

## Roadmap (discussed, not yet built)
- **AI email parser** for customers who won't leave email (reads the inbox,
  extracts coins from spreadsheets/images, drafts a bid sheet to the queue).
- **Arrival-date spot pricing** — auto-use the silver price from the day a
  package arrived, not today's, to avoid mispricing.
- **Slab Pricer photo bridge** — "take a photo of the box of slabs" → items
  straight into a buyback (the camera flow Marley loved in the demo).
- Stripe/ACH payout tracking once received.


