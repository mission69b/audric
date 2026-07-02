// Mirror of web-v3 `lib/credit/tiers.ts` — subscription tiers + top-up presets.
// Kept byte-faithful (prices, included credit, taglines, feature copy) so the
// mobile billing screen shows exactly what web-v3 does. Update in lockstep when
// web-v3's catalog changes. Pure data.
//
// NOTE (iOS): Apple IAP vs web-link billing is a store-policy fork tracked in
// the mobile spec; this file is the display catalog only — the purchase path is
// wired in the billing phase, not here.

export type TierId = "free" | "pro" | "max";

export type Tier = {
  id: TierId;
  name: string;
  priceUsd: number | null;
  /** Pre-discount list price (display-only) — drives the beta strikethrough. */
  originalPriceUsd?: number;
  includedCreditUsd?: number;
  tagline: string;
  features: string[];
};

export const EVERY_PLAN: string[] = [
  "Uncensored — open models that won't refuse you",
  "Zero data retention — your chats are never training data",
  "Permissionless — no account, no KYC, no seed phrase",
  "Non-custodial wallet — your keys, your money, always",
  "Send USDC + USDsui anywhere — free, instant, gasless",
  "Decentralized memory — encrypted on Walrus",
  "Private chats & files — encrypted at rest, never public",
  "Auto — automatically picks the best model for every task",
  "Skills — built-in live data: crypto, stocks & on-chain (prices, charts, screeners, ratings)",
  "Web search, PDF analysis & diagrams — all built in",
];

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
      "Video generation — fast, high-quality clips",
      "Full image suite — generate, edit & upscale",
    ],
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
  },
];

export const TOPUP_PRESETS_USD = [5, 10, 25, 50];

export const TOPUP_PERKS: string[] = [
  "Every premium + frontier model — Claude, GPT-5.5, Gemini",
  "Video generation + the full image suite",
  "Never expires — only pay for what you use",
];
