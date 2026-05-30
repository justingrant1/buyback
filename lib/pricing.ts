/**
 * Buyback pricing helpers.
 *
 * Reuses the Slab Pricer's CDN lookup core to attach Greysheet bid/ask to each
 * line item, then computes the reference value, suggested offer, and margin.
 *
 * "Reference value" = what we consider the coin worth to us (we anchor on CDN
 * bid / Greysheet wholesale, per Marley — gravitates toward bid, not retail).
 * The suggested OFFER is reference * (1 - margin). Marley/Ben override per line
 * or per batch in the admin UI.
 */

import { env } from "@/lib/env";
import type { BuybackItem, BuybackTotals } from "@/lib/types";

/**
 * The reference value of a single item line (qty included).
 * Order of preference: explicit dealerAsk override is ignored for OUR value;
 * we anchor on CDN bid, fall back to a fraction of ask, then 0.
 */
export function itemReferenceValue(item: BuybackItem): number {
  const qty = item.quantity > 0 ? item.quantity : 1;
  const bid = item.cdnBid ?? null;
  const ask = item.cdnAsk ?? null;
  let unit = 0;
  if (bid != null && bid > 0) unit = bid;
  else if (ask != null && ask > 0) unit = ask * 0.85; // conservative when only ask known
  return round2(unit * qty);
}

/** Suggested per-line offer given a target margin (defaults to env). */
export function suggestedItemOffer(item: BuybackItem, margin = env.DEFAULT_MARGIN): number {
  const ref = itemReferenceValue(item);
  return round2(ref * (1 - clampMargin(margin)));
}

/** Roll up a list of items into reference value, count, and average. */
export function computeTotals(items: BuybackItem[]): BuybackTotals {
  let estimatedValue = 0;
  let itemCount = 0;
  for (const it of items) {
    estimatedValue += itemReferenceValue(it);
    itemCount += it.quantity > 0 ? it.quantity : 1;
  }
  estimatedValue = round2(estimatedValue);
  const avgCoinValue = itemCount > 0 ? round2(estimatedValue / itemCount) : 0;
  return { estimatedValue, itemCount, avgCoinValue };
}

/** Total of explicit per-line offers (falls back to suggested when missing). */
export function sumOffers(items: BuybackItem[], margin = env.DEFAULT_MARGIN): number {
  let total = 0;
  for (const it of items) {
    total += it.offer != null ? it.offer : suggestedItemOffer(it, margin);
  }
  return round2(total);
}

/** Margin we make on a batch given our reference value and what we pay out. */
export function batchMargin(referenceValue: number, offerAmount: number): number {
  if (referenceValue <= 0) return 0;
  return (referenceValue - offerAmount) / referenceValue;
}

/** Is this batch a VIP (personal-touch) batch? */
export function isVip(estimatedValue: number): boolean {
  return estimatedValue >= env.VIP_THRESHOLD;
}

/** Is this batch below our low-value floor (junk / deprioritize)? */
export function isLowValue(estimatedValue: number): boolean {
  return estimatedValue < env.LOW_VALUE_FLOOR;
}

/**
 * Priority score for the admin queue.
 * Higher = handle sooner. VIP and value dominate; age breaks ties.
 */
export function priorityScore(opts: {
  vip: boolean;
  estimatedValue: number;
  dateSubmitted: string | Date;
  isRepeatCustomer?: boolean;
}): number {
  const ageHours =
    (Date.now() - new Date(opts.dateSubmitted).getTime()) / (1000 * 60 * 60);
  let score = 0;
  if (opts.vip) score += 100000;
  if (opts.isRepeatCustomer) score += 5000;
  score += Math.min(opts.estimatedValue, 100000) / 2; // value weight, capped
  score += Math.min(ageHours, 240) * 10; // older waits longer -> bumps up
  if (isLowValue(opts.estimatedValue)) score -= 3000; // push junk down
  return Math.round(score);
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function clampMargin(m: number): number {
  if (!Number.isFinite(m)) return env.DEFAULT_MARGIN;
  if (m < 0) return 0;
  if (m > 0.9) return 0.9;
  return m;
}
