/**
 * Subscription tiers (SPEC_AUDRIC_V3 §4b).
 *
 * 3-tier ladder: Free / Pro / Max (S.485 — dropped the speculative Pro+; it
 * re-appears when it earns a real exclusive, e.g. the decentralized E2E slice).
 * The DB `subscriptionTier` enum still carries "proPlus" so re-adding needs no
 * migration. Prices + included-credit are the founder-approved launch numbers
 * (revisitable on usage-cost data, §4b). Pure data; safe on client + server.
 *
 * STRUCTURE: the privacy/ownership story is NOT a tier differentiator — it's
 * what Audric IS, shared by every plan (EVERY_PLAN). The tiers differentiate on
 * models + included credit + caps. COMING_SOON is teased, never sold.
 */

export type TierId = "free" | "pro" | "max";

export type Tier = {
  id: TierId;
  name: string;
  /** Monthly USD price; null/0 = free. */
  priceUsd: number | null;
  /** Pre-discount list price (display-only) — drives the "beta · 50% off"
   * strikethrough. The actual charged price stays `priceUsd` (the Stripe price),
   * so existing subscribers are unaffected. */
  originalPriceUsd?: number;
  /** Monthly credit included with the subscription, granted on each paid invoice. */
  includedCreditUsd?: number;
  tagline: string;
  features: string[];
  /** Which env Price ID gates this tier's subscribe (server resolves it). */
  priceEnv?: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_MAX";
};

/**
 * "The Audric difference" — included in EVERY plan, Free included. Benefit-led
 * copy (what you get), not feature-led. These are real today.
 */
export const EVERY_PLAN: string[] = [
  "Uncensored — open models that won't refuse you",
  "Zero data retention — your chats are never training data",
  "Permissionless — no account, no KYC, no seed phrase",
  "Non-custodial wallet — your keys, your money, always",
  "Send USDC anywhere — free, instant, gasless",
  "Private memory & chats — encrypted, yours to delete anytime",
  "Auto — automatically picks the best model for every task",
  "Recipes — pay-per-use live-data flows, with your own USDC",
];

/** Teased, never sold — clearly labeled "coming". */
export const COMING_SOON: string[] = [
  "Confidential AI (Pro & Max) — verifiable TEE models even the provider can't read",
  "Decentralized backup — your memory, end-to-end on Walrus",
];

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: 0,
    tagline: "The private AI, on the house",
    features: [
      "Open, uncensored models — unlimited core chat",
      "Web search + image generation",
      "Pay-as-you-go top-up for premium models",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 18,
    originalPriceUsd: 36,
    includedCreditUsd: 25,
    tagline: "All the models, generous",
    features: [
      "$25/mo credit — more than topping up, never expires",
      "Unlimited chat on open models",
      "Every premium + frontier model",
      "Image & media generation",
      "Confidential (TEE) models when they land",
    ],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  {
    id: "max",
    name: "Max",
    priceUsd: 100,
    originalPriceUsd: 200,
    includedCreditUsd: 150,
    tagline: "Maximum everything",
    features: [
      "$150/mo credit — more than topping up, never expires",
      "Everything in Pro",
      "Highest media & usage caps",
      "Confidential (TEE) models when they land",
      "First access to new features",
    ],
    priceEnv: "STRIPE_PRICE_MAX",
  },
];

export const TOPUP_PRESETS_USD = [5, 10, 25, 50];
