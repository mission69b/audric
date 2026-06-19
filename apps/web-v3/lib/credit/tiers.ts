/**
 * Subscription tiers (Phase 5, SPEC_AUDRIC_V3 §4b).
 *
 * 4-tier ladder: Free / Pro / Pro+ / Max. Prices + included-credit are the
 * founder-approved launch numbers (still revisitable on usage-cost data, §4b:
 * "finalize on usage data"). Subscribe is gated on the matching `STRIPE_PRICE_*`
 * env being provisioned (the seed script creates them). The free tier + PAYG
 * top-up are the always-on path; subs add monthly included credit. Pure data;
 * safe on client + server.
 */

export type TierId = "free" | "pro" | "proPlus" | "max";

export type Tier = {
  id: TierId;
  name: string;
  /** Monthly USD price; null/0 = free. */
  priceUsd: number | null;
  /** Monthly credit included with the subscription, granted on each paid invoice. */
  includedCreditUsd?: number;
  tagline: string;
  features: string[];
  /** Which env Price ID gates this tier's subscribe (server resolves it). */
  priceEnv?: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_PRO_PLUS" | "STRIPE_PRICE_MAX";
};

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: 0,
    tagline: "The private AI, on the house",
    features: [
      "Free open model (Kimi) — uncensored, unlimited core chat",
      "Web search + image generation",
      "Private Memory (opt-in) + Passport wallet",
      "Pay-as-you-go top-up for premium models",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 18,
    includedCreditUsd: 10,
    tagline: "Premium models, unlimited",
    features: [
      "Everything in Free",
      "All premium models + media generation",
      "Effectively unlimited text",
      "$10/mo included credit · Walrus E2E backup + portable memory",
    ],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  {
    id: "proPlus",
    name: "Pro+",
    priceUsd: 48,
    includedCreditUsd: 30,
    tagline: "For daily, serious use",
    features: [
      "Everything in Pro",
      "Priority routing + higher media caps",
      "$30/mo included credit",
      "Higher storage limits",
    ],
    priceEnv: "STRIPE_PRICE_PRO_PLUS",
  },
  {
    id: "max",
    name: "Max",
    priceUsd: 100,
    includedCreditUsd: 75,
    tagline: "Maximum everything",
    features: [
      "Everything in Pro+",
      "Frontier models + top priority",
      "$75/mo included credit + roll-forward",
      "Highest limits & storage",
    ],
    priceEnv: "STRIPE_PRICE_MAX",
  },
];

export const TOPUP_PRESETS_USD = [5, 10, 25, 50];
