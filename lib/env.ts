/**
 * Centralized, typed access to env vars for the Witter Buyback portal.
 *
 * Reuses the same CDN / PCGS / Anthropic / Airtable credentials as the Slab
 * Pricer (Ben App) and adds buyback-specific config: a dedicated Airtable base,
 * Shippo (shipping labels), SendGrid (offer emails), metals spot pricing, and
 * the VIP / low-value thresholds Marley asked for.
 *
 * Throws at first use if something required is missing, so failures happen
 * loud and early instead of silently producing "undefined" requests.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function numberOpt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  // ---- Vision (Anthropic Claude) ----
  get ANTHROPIC_API_KEY() {
    return required("ANTHROPIC_API_KEY");
  },
  ANTHROPIC_VISION_MODEL: optional("ANTHROPIC_VISION_MODEL", "claude-sonnet-4-6"),

  // OpenAI legacy fallback (only referenced if the vision lib falls back)
  get OPENAI_API_KEY() {
    return required("OPENAI_API_KEY");
  },
  OPENAI_VISION_MODEL: optional("OPENAI_VISION_MODEL", "gpt-4o"),

  // ---- CDN (Greysheet) ----
  CDN_BASE_URL: optional("CDN_BASE_URL", "https://cpgpublicapiv2beta.greysheet.com"),
  get CDN_API_KEY() {
    return required("CDN_API_KEY");
  },
  get CDN_API_TOKEN() {
    return required("CDN_API_TOKEN");
  },

  // ---- PCGS Public API ----
  PCGS_API_BASE_URL: optional("PCGS_API_BASE_URL", "https://api.pcgs.com/publicapi"),
  get PCGS_API_TOKEN() {
    return required("PCGS_API_TOKEN");
  },

  // ---- Airtable (dedicated Buybacks base) ----
  get AIRTABLE_TOKEN() {
    return required("AIRTABLE_TOKEN");
  },
  get AIRTABLE_BASE_ID() {
    return required("AIRTABLE_BASE_ID");
  },
  AIRTABLE_CUSTOMERS_TABLE: optional("AIRTABLE_CUSTOMERS_TABLE", "Customers"),
  AIRTABLE_BUYBACKS_TABLE: optional("AIRTABLE_BUYBACKS_TABLE", "Buybacks"),
  AIRTABLE_ITEMS_TABLE: optional("AIRTABLE_ITEMS_TABLE", "Buyback Items"),

  // ---- Shippo (shipping labels) ----
  // Optional at build time; the shippo lib degrades to a stub when missing.
  SHIPPO_API_TOKEN: optional("SHIPPO_API_TOKEN", ""),
  // Where the customer ships TO (our receiving address).
  SHIP_TO_NAME: optional("SHIP_TO_NAME", "Witter Coin — Buybacks"),
  SHIP_TO_STREET: optional("SHIP_TO_STREET", ""),
  SHIP_TO_CITY: optional("SHIP_TO_CITY", ""),
  SHIP_TO_STATE: optional("SHIP_TO_STATE", ""),
  SHIP_TO_ZIP: optional("SHIP_TO_ZIP", ""),
  SHIP_TO_PHONE: optional("SHIP_TO_PHONE", ""),
  SHIP_TO_EMAIL: optional("SHIP_TO_EMAIL", ""),

  // ---- SendGrid (offer / label emails) ----
  SENDGRID_API_KEY: optional("SENDGRID_API_KEY", ""),
  SENDGRID_FROM_EMAIL: optional("SENDGRID_FROM_EMAIL", "buyback@wittercoin.com"),
  SENDGRID_FROM_NAME: optional("SENDGRID_FROM_NAME", "Witter Coin Buybacks"),

  // ---- Metals spot (junk silver / melt) ----
  // Optional API for spot prices; junk pricing falls back to manual entry.
  METALS_API_KEY: optional("METALS_API_KEY", ""),
  METALS_API_BASE_URL: optional("METALS_API_BASE_URL", "https://api.metals.dev/v1"),

  // ---- App ----
  // Public base URL, used to build approve-offer links in emails.
  APP_BASE_URL: optional("APP_BASE_URL", "http://localhost:3000"),
  get APP_PASSWORD() {
    return required("APP_PASSWORD");
  },
  get SESSION_SECRET() {
    return required("SESSION_SECRET");
  },

  // ---- Business rules (configurable) ----
  // Above this, route to a human / VIP personal touch (no auto-anything).
  VIP_THRESHOLD: numberOpt("VIP_THRESHOLD", 20000),
  // Below this, flag as low-value (junk / bulk) and deprioritize.
  LOW_VALUE_FLOOR: numberOpt("LOW_VALUE_FLOOR", 2500),
  // Default margin we aim to make on each batch (10–20% per Marley).
  DEFAULT_MARGIN: numberOpt("DEFAULT_MARGIN", 0.15),
  // Thinner margin on junk silver — it's our floor; we pay "pretty strong".
  JUNK_MARGIN: numberOpt("JUNK_MARGIN", 0.05),
} as const;


export function hasCdnCreds(): boolean {
  return Boolean(process.env.CDN_API_KEY && process.env.CDN_API_TOKEN);
}
export function hasAirtableCreds(): boolean {
  return Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID);
}
export function hasAnthropicCreds(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
export function hasOpenAiCreds(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
export function hasShippoCreds(): boolean {
  return Boolean(process.env.SHIPPO_API_TOKEN);
}
export function hasSendgridCreds(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY);
}
export function hasMetalsCreds(): boolean {
  return Boolean(process.env.METALS_API_KEY);
}
