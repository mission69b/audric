export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// [v0.7c Session 5.5] `guestRegex` removed — the template wired a
// "guest" email regex in `sidebar-user-nav.tsx` that triggered a dev
// fallback toast ("Sign-in is wired in Phase 2."). Phase 2 shipped
// months ago (S.175+ wired full zkLogin); the fallback became a stale
// dev leak. Dropped along with the guest branch in `sidebar-user-nav`.

// [v0.7c Session 5.5] `suggestions` neutered to an empty array — the
// template shipped 4 generic prompts ("What are the advantages of
// using Next.js?", "Write code to demonstrate Dijkstra's algorithm",
// etc.) which `SuggestedActions` + `preview.tsx` import + render in
// the template chat shell. Path A retargets production traffic to
// `web-v2/audric-chat` (which uses Audric's own chip-bar from
// `chip-configs.ts`), so the template SuggestedActions surface is
// unreachable in production. The empty array keeps the template files
// type-checking until Session 9a deletes them wholesale — no template
// prompts leak in the meantime.
export const suggestions: string[] = [];
