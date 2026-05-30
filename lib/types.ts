/**
 * Shared domain types for the buyback portal.
 */

export type BuybackStatus =
  | "New"
  | "Pricing"
  | "Offer Sent"
  | "Approved"
  | "Declined"
  | "Label Sent"
  | "In Transit"
  | "Received"
  | "Paid";

export type ItemCategory = "Slab" | "Raw" | "Junk Silver" | "Gold" | "World";

export type BuybackSource = "Web Form" | "Email" | "Photo" | "Manual";

/** A single coin / line item as it flows through the system (pre-Airtable). */
export interface BuybackItem {
  id?: string;
  description: string;
  quantity: number;
  gradingService?: string;
  certNumber?: string;
  year?: string;
  denomination?: string;
  grade?: string;
  cac?: boolean;
  cdnBid?: number | null;
  cdnAsk?: number | null;
  dealerAsk?: number | null;
  offer?: number | null;
  category?: ItemCategory;
  notes?: string;
  /**
   * Downscaled slab photo as a base64 data URL. Client→server transport only
   * (from the /sell camera capture); persisted as an Airtable attachment on
   * the item, never stored as a literal field. Stripped before pricing.
   */
  photoDataUrl?: string;
}


/** Customer-supplied contact info from the public form. */
export interface SellerContact {
  name: string;
  email: string;
  phone?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}

/** Full buyback record as stored / returned by the API. */
export interface BuybackRecord {
  id: string;
  ref: string;
  customerName: string;
  customerEmail: string;
  status: BuybackStatus;
  vip: boolean;
  dateSubmitted: string;
  dateReceived?: string | null;
  itemCount: number;
  estimatedValue: number;
  offerAmount?: number | null;
  marginPct?: number | null;
  avgCoinValue?: number | null;
  approvalToken?: string;
  offerSentAt?: string | null;
  approvedAt?: string | null;
  trackingNumber?: string | null;
  labelUrl?: string | null;
  carrier?: string | null;
  source: BuybackSource;
  notes?: string;
  items?: BuybackItem[];
}

/** Result of submitting the public form. */
export interface SubmitResult {
  ok: boolean;
  ref: string;
  id: string;
  estimatedValue: number;
  itemCount: number;
  vip: boolean;
  message: string;
}

/** Sum + per-item-average helpers operate on these. */
export interface BuybackTotals {
  estimatedValue: number; // sum of CDN bid * qty (our reference value)
  itemCount: number; // sum of quantities
  avgCoinValue: number;
}
