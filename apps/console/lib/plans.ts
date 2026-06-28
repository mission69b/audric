// Console plan display data (client-safe). DISPLAY-ONLY: the canonical charged
// price is the Stripe Price (env STRIPE_PRICE_*), and the canonical included
// credit is granted by the shared webhook (web-v3 includedCreditUsdForTier).
// These numbers mirror web-v3's tiers.ts for display; if they ever drift, the
// money is still correct (Stripe + webhook are the source of truth).

export type ConsolePlanId = "pro" | "max";

export type ConsolePlan = {
  id: ConsolePlanId;
  name: string;
  priceUsd: number;
  includedCreditUsd: number;
  priceEnv: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_MAX";
};

export const CONSOLE_PLANS: ConsolePlan[] = [
  {
    id: "pro",
    name: "Pro",
    priceUsd: 18,
    includedCreditUsd: 20,
    priceEnv: "STRIPE_PRICE_PRO",
  },
  {
    id: "max",
    name: "Max",
    priceUsd: 100,
    includedCreditUsd: 110,
    priceEnv: "STRIPE_PRICE_MAX",
  },
];
