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
  "Send USDC + USDsui anywhere — free, instant, gasless",
  "Decentralized memory — encrypted on Walrus, yours to wipe",
  "Private chats & files — encrypted at rest, never public",
  "Auto — automatically picks the best model for every task",
  "Live crypto + stock research — prices, charts, screeners, on-chain & analyst data",
  "Web search, PDF analysis & diagrams — all built in",
];

/** Teased, never sold — clearly labeled "coming". */
export const COMING_SOON: string[] = [
  "End-to-end encrypted chats — sealed with Seal, readable only by you",
  "Decentralized backup — your memory, end-to-end on Walrus",
];

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    priceUsd: 0,
    tagline: "The private AI, on the house",
    features: [
      "20 chats/day on open, uncensored models",
      "10 images/day — generate, edit & upscale",
      "1 video/day",
      "Web search + cited multi-step research",
      "Pay-as-you-go top-up for premium models & more media",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsd: 18,
    originalPriceUsd: 36,
    includedCreditUsd: 20,
    tagline: "All the models, generous",
    features: [
      "$20/mo credit — more than topping up, never expires",
      "Unlimited chat on open models",
      "Every premium + frontier model (Claude, GPT-5.x, Gemini)",
      "No daily caps — images & video funded by your credit",
      "Premium video — Grok Imagine, Veo & Kling",
      "Full image suite — generate, edit & upscale",
    ],
    priceEnv: "STRIPE_PRICE_PRO",
  },
  {
    id: "max",
    name: "Max",
    priceUsd: 100,
    originalPriceUsd: 200,
    includedCreditUsd: 110,
    tagline: "Maximum everything",
    features: [
      "$110/mo credit — more than topping up, never expires",
      "Everything in Pro, at the highest usage",
      "Most monthly credit for premium models, video & media",
      "First access to new features",
    ],
    priceEnv: "STRIPE_PRICE_MAX",
  },
];

export const TOPUP_PRESETS_USD = [5, 10, 25, 50];

/**
 * What pay-as-you-go credit unlocks — shown on the top-up checkout so it isn't
 * just a bare amount. Benefit-led, minimal. Credit funds premium/frontier model
 * usage and media generation; core open-model chat + data skills stay free.
 */
export const TOPUP_PERKS: string[] = [
  "Every premium + frontier model — Claude, GPT-5.5, Gemini",
  "Premium video (Grok Imagine, Veo, Kling) + the full image suite",
  "Never expires — only pay for what you use",
];
