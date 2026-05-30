# Witter Coin Buyback — Staff Guide

**For:** Marley, Ben, and anyone handling buybacks
**What this is:** a plain-English walkthrough of how to use the buyback portal day to day. No coding needed.

---

## The big picture (what changed)

Instead of every customer emailing the Gmail and you building each bid sheet by hand, customers now fill out a **web form**. Their coins show up automatically in a **priority queue**, already priced against the live market. You review, send the offer with one click, and when the customer accepts, the **shipping label is created for you**.

You still keep the personal touch with your big customers — the form just clears the clutter so you can focus on the high-value batches.

```
Customer fills out form  →  shows up in your queue (already priced)
        →  you review & send offer  →  customer clicks "Accept"
        →  label is auto-created     →  coins arrive  →  you pay
```

---

## Logging in

1. Go to the site and click **Staff Login** (top-right corner of the homepage).
2. Enter the staff password (Justin/Paul will give this to you).
3. You land on **the queue** — your main screen.

> The password is shared between you and Ben. Don't share it outside the team.

---

## Your main screen: the Queue (`/admin`)

This is the priority list you asked for. At the top you'll see quick numbers (KPIs):

- **Open buybacks** — how many are in progress
- **Pipeline value** — total dollars currently in flight
- **Need pricing** — how many are waiting on you

The list is **automatically sorted so the right work is at the top**:

1. **VIPs first** (your big fish — Teresa, Mike, etc.)
2. then **highest dollar value**
3. then **oldest** (so nothing sits and goes stale)

Low-value "junk" submissions are pushed to the bottom automatically.

You can also **filter by status** (New, Pricing, Offer Sent, Approved, etc.) to see just what you want.

---

## Working a buyback: the bid sheet (`/admin/:id`)

Click any row to open it. This is your bid sheet — the thing you used to build by hand.

What you'll see and do here:

1. **Line items** — every coin the customer submitted, each with:
   - the description, quantity, grade, cert #, category
   - the **CDN bid / ask** already pulled in for you
2. **Suggested offer + live margin** — the system suggests an offer based on our target margin and shows the **margin you're making** in real time. Adjust any line or the whole batch — the margin updates as you go.
3. **Send the offer** — when you're happy, click to **email the customer** the itemized offer plus an Accept/Decline link. (No more copy-pasting the boilerplate.)
4. **Update status** — mark **Received** when the box arrives, **Paid** when you've paid them, or **Declined** if it falls through.
5. **Download CSV** — exports the same spreadsheet you build today, if you ever need it outside the app.

### How pricing works (so you can trust/override it)

- It **anchors on CDN bid** (not retail), because Greysheet runs inflated on generics — exactly how you price.
- **Junk silver** is priced strong (thin margin) since it's our floor.
- The suggested offer is just a starting point — **you always have the final say** and can override any number.
- Big auction-grade and world coins are **flagged VIP** and never auto-priced away — they wait for you.

---

## What the customer sees

1. They fill out the **Get My Offer** form (`/sell`): their info + their coins (slab cert #, raw coins, junk silver, gold).
   - **They can also just upload their own spreadsheet.** If a customer already keeps their coins in an Excel/CSV list (the way many of them email you today), they can drop that file onto the form. The system reads it — even if their column names are different from ours — and fills in the coin rows automatically. They get a chance to review/fix the rows before submitting.
   - This means you can tell email customers: *"Just upload your list here and we'll take it from there"* — no more re-typing their spreadsheet into a bid sheet by hand.
2. You price it and send the offer.
3. They get an email, click the link, see the itemized offer, enter their ship-from address, and click **Accept** (or Decline).
4. On Accept, a **prepaid, insured FedEx label** is generated and emailed to them automatically.
5. The box ships to us; you mark it Received, then Paid.


---

## VIP / big-fish customers

Nothing forces your best customers to do more work. For anyone over the VIP threshold (currently **$20,000**), the system flags them and you can keep handling them personally, just like today — e.g. Teresa mails a box, you build it in a few minutes. The form is mainly to clear out the high volume of smaller stuff so it doesn't bury you.

---

## Tips & good habits

- **Work top-down.** The queue is already sorted — start at the top and you're handling the most important coins first.
- **Watch the margin number** while you set offers — it keeps each batch in the 10–20% range.
- **Mark "Received" when the box actually arrives.** This keeps the records (and the pricing dates) honest — important for silver that moves day to day.
- **Use the status filters** to find "needs pricing" vs "waiting on customer" fast.
- **Decline politely / leave a note.** The Notes field carries context for the next time that customer comes back.

---

## Quick troubleshooting

| Situation | What to do |
|---|---|
| A coin came in with no price | The market lookup didn't find it — enter the value manually on the line item. |
| Customer says they never got the offer email | Re-open the buyback and re-send the offer; double-check their email on the record. |
| Label didn't generate | Confirm the customer entered a full ship-from address; if it still fails, tell Justin/Paul — it may be a Shippo key issue. |
| Wrong customer info | Edit it directly on the record (or in Airtable). |
| Forgot the password / locked out | Ask Justin or Paul to reset it. |

---

## Who to contact

- **Day-to-day questions / how do I…?** — Ben or Marley (each other).
- **Something's broken / a feature request** — Justin / Paul.

That's it. Log in, work the queue top-down, send offers, and let the labels and emails handle themselves.
