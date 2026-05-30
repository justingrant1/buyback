/**
 * Junk-silver / melt pricing.
 *
 * Marley pays "pretty strong" on junk silver because it's the floor of the
 * business, and prices it off the day the package arrives. This module:
 *   - fetches a spot price (silver/gold) when METALS_API_KEY is set, else uses
 *     a manually-set fallback so the math always works;
 *   - converts a face value (or weight) of common US 90% silver into melt.
 *
 * 90% "junk" US coins contain 0.715 troy oz of silver per $1 face (standard
 * dealer constant). Adjust SILVER_OZ_PER_DOLLAR_FACE if you prefer 0.715 vs
 * the slightly conservative 0.7150.
 */

import { env, hasMetalsCreds } from "@/lib/env";

export const SILVER_OZ_PER_DOLLAR_FACE = 0.715;

export interface SpotPrices {
  silver: number; // USD / troy oz
  gold: number; // USD / troy oz
  asOf: string;
  stub: boolean;
}

// Sensible fallbacks so junk math never returns 0 in dev. Update as needed.
const FALLBACK: SpotPrices = {
  silver: 30,
  gold: 2400,
  asOf: "fallback",
  stub: true,
};

export async function getSpot(): Promise<SpotPrices> {
  if (!hasMetalsCreds()) return FALLBACK;
  try {
    const url = new URL(`${env.METALS_API_BASE_URL}/latest`);
    url.searchParams.set("api_key", env.METALS_API_KEY);
    url.searchParams.set("currency", "USD");
    url.searchParams.set("unit", "toz");
    const res = await fetch(url.toString(), { next: { revalidate: 60 * 30 } });
    if (!res.ok) return FALLBACK;
    const json: any = await res.json();
    const silver = Number(json?.metals?.silver ?? json?.silver);
    const gold = Number(json?.metals?.gold ?? json?.gold);
    if (!Number.isFinite(silver) || !Number.isFinite(gold)) return FALLBACK;
    return { silver, gold, asOf: json?.timestamp ?? new Date().toISOString(), stub: false };
  } catch {
    return FALLBACK;
  }
}

/** Melt value of US 90% junk silver from its total face value. */
export function junkSilverMelt(faceValue: number, silverSpot: number): number {
  const oz = faceValue * SILVER_OZ_PER_DOLLAR_FACE;
  return round2(oz * silverSpot);
}

/** Melt value from a raw troy-oz weight of pure silver. */
export function silverMeltByOunces(troyOz: number, silverSpot: number): number {
  return round2(troyOz * silverSpot);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
