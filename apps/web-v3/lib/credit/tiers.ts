/**
 * Subscription tiers (Phase 5 scaffold, SPEC_AUDRIC_TOPUP_METERING §5).
 *
 * ⚠️ PRICES + INCLUDED-CREDIT ARE PLACEHOLDERS — `TODO(usage-data)`. The spec
 * explicitly defers the numbers ("don't lock prices speculatively"); these
 * exist to render the 4-tier UI. Subscribe is INERT until the matching
 * `STRIPE_PRICE_*` env is provisioned (the seed script creates them). The free
 * tier + pay-as-you-go top-up are the live monetization path; subs flip on
 * once pricing lands post-usage.
 *
 * 4-tier ladder (Free / Plus / Pro / Max) — the industry-familiar shape
 * (ChatGPT, Claude). Pure data; safe on client + server.
 */

export type TierId = "free" | "plus" | "pro" | "max";

export type Tier = {
  id: TierId;
  name: string;
  /** Provisional monthly USD price; null = free. TODO(usage-data). */
  priceUsd: number | null;
  /**
   * Provisional monthly credit included with the subscription, granted on each
   * paid invoice. TODO(usage-data) — placeholder until per-token costs land.
   */
  includedCreditUsd?: number;
  tagline: string;
  features: string[];
  /** Which env Price ID gates this tier's subscribe (server resolves it). */
  priceEnv?: "STRIPE_PRICE_PLUS" | "STRIPE_PRICE_PRO" | "STRIPE_PRICE_MAX";
};

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: 0,
    tagline: "The private AI, on the house",
    features: [
      "Free open model (Kimi) — unlimited core chat",
      "Web search + image generation",
      "Private Memory + Passport wallet",
      "Pay-as-you-go top-up for premium models",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    priceUsd: 10,
    includedCreditUsd: 8,
    tagline: "More power, premium models",
    features: [
      "Everything in Free",
      "Premium models (metered from included credit)",
      "Higher daily limits",
      "Monthly included credit",
    ],
    priceEnv: "STRIPE_PRICE_PLUS",
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 20,
    includedCreditUsd: 16,
    tagline: "For daily, serious use",
    features: [
      "Everything in Plus",
      "All premium models + priority",
      "More monthly included credit",
      "Lower per-use rates",
    ],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  {
    id: "max",
    name: "Max",
    priceUsd: 100,
    includedCreditUsd: 80,
    tagline: "Maximum everything",
    features: [
      "Everything in Pro",
      "Highest limits + frontier models",
      "Largest monthly included credit + rollover",
      "Priority routing & support",
    ],
    priceEnv: "STRIPE_PRICE_MAX",
  },
];

export const TOPUP_PRESETS_USD = [5, 10, 25, 50];
