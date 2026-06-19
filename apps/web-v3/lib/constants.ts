export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// Composer chips (SPEC_AUDRIC_V3 §5c) — lean, prefill-only set (injection into
// the composer, CHIP_REVIEW_3 — never auto-send), so the user edits/adds params
// before sending. Core loop: Research · Create · Send (P2P). The "Pay for a
// service" chip was dropped (generic x402 Services are CUT from MVP, S.478) —
// it returns when Recipes land (Phase 4b).
export const suggestions = [
  "Research a topic",
  "Create an image",
  "Send money",
];
