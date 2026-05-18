export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// [v0.7c Day 1c] Pattern preserved for guest-vs-regular email detection
// in `sidebar-user-nav.tsx`. The audric stub `getCurrentUser()` does not
// yet emit `guest-*` emails; Phase 2 may wire the demo path if/when an
// audric guest flow lands.
export const guestRegex = /^guest-\d+$/;

export const suggestions = [
  "What are the advantages of using Next.js?",
  "Write code to demonstrate Dijkstra's algorithm",
  "Help me write an essay about Silicon Valley",
  "What is the weather in San Francisco?",
];
