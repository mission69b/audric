/**
 * Reserved username list — names that cannot be claimed as
 * `username.audric.sui` leaf subnames.
 *
 * Source of truth for the rationale + future additions:
 *   t2000/spec/runbooks/RUNBOOK_audric_sui_parent.md §7
 *
 * This file is the EXECUTABLE list — every audric route that mints or
 * checks a leaf subname MUST go through `isReserved()` here, not duplicate
 * the set inline. Updates to the list require BOTH:
 *
 *   1. Edit RUNBOOK §7 with the new entries + rationale (founder review)
 *   2. Edit this file's `RESERVED_USERNAMES` set
 *
 * The two MUST stay in sync — the runbook carries the "why"; this file
 * carries the "what". Drift between the two is a bug.
 *
 * History:
 *   - v1 (SPEC 10 v0.2.1, 35 entries) — D3 baseline only.
 *   - v2 (S.74, +10 entries → 45) — route-collision sentinels for the
 *     new /[username] dynamic route.
 *   - v3 (S.75, +~125 entries → ~170) — Phase A.5 founder-approved
 *     expansion: §7.2 brand variants + §7.3 web/ops + §7.4 financial
 *     primitives + §7.5 third-party brands (Tier A + Tier B) + §7.6
 *     regulators + §7.7 abuse magnets + §7.8 future-product / static-
 *     route extension. See RUNBOOK §7 for the per-category rationale.
 *   - v4 (S.84 polish v3, +6 entries → 195) — founder audit found 2
 *     real route-collision gaps (`activity`, `contacts` — both in
 *     `PANEL_URL_MAP` but unreserved) + 4 defensive singular/plural
 *     parity adds (`setting`, `goal`, `activities`, `bots`).
 *   - v5 (S.91, +11 entries → 206) — post-S.88 audit additions:
 *     §7.4 +8 financial-flow primitives (fee/fees/refund/refunds/gas/
 *     bridge/escrow/safe), §7.5 Tier A +1 (slush — Mysten Labs wallet),
 *     §7.7 +2 fallback-state primitives (unknown/placeholder). All
 *     match existing section intent (fund-routing impersonation +
 *     ecosystem brand impersonation + null-state confusion).
 */

const RESERVED = [
  // ───────────────────────────────────────────────────────────────────────
  // §7.1 — D3 baseline (35 entries, locked in SPEC 10 v0.2.1)
  // ───────────────────────────────────────────────────────────────────────

  // System / role / access
  'admin',
  'support',
  'audric',
  'team',
  'root',
  'api',
  'www',
  'mod',
  'mods',
  'staff',
  'official',
  'verify',
  'verified',
  'help',
  'info',
  'mail',
  'system',
  'bot',
  'notification',

  // Footguns / null states
  'null',
  'undefined',
  'test',
  'bots', // parity with `bot` (cf. `mod`/`mods`) — added S.84 polish v3

  // Audric product names (don't let users impersonate the products)
  'pay',
  'send',
  'receive',
  'swap',
  'save',
  'borrow',
  'repay',
  'store',
  'passport',
  'intelligence',
  'finance',

  // Squat magnets — D3 specifically called these out (high social value,
  // low identity meaning, classic squat targets)
  'mom',
  'dad',

  // ───────────────────────────────────────────────────────────────────────
  // §7.2 — Audric brand variants (12 entries — phishing primitive defense)
  //
  // Every brand-prefixed handle is a phishing primitive ("hey, send your
  // USDC to audric-support.audric.sui to verify your account"). Cheap to
  // reserve; impossible to recover post-mint. Hyphens are valid SuiNS
  // characters so these are claimable absent reservation.
  // ───────────────────────────────────────────────────────────────────────
  'audric-team',
  'audric-support',
  'audric-official',
  'audric-help',
  'audric-pay',
  'audric-store',
  'audric-finance',
  'audric-passport',
  'audric-intelligence',
  'audric-bot',
  'audric-admin',
  'audric-system',

  // ───────────────────────────────────────────────────────────────────────
  // §7.3 — Web/ops generics (16 entries — typical app routes)
  //
  // Mirror common app routes (`audric.ai/dashboard`, `audric.ai/settings`).
  // If a user could mint `dashboard.audric.sui`, social-engineering
  // victims clicking "go to your dashboard" links could be redirected.
  // Low likelihood, near-zero cost to reserve.
  // ───────────────────────────────────────────────────────────────────────
  'app',
  'dashboard',
  'account',
  'settings',
  'setting', // defensive singular pair for `settings` — added S.84 polish v3
  'profile',
  'login',
  'signin',
  'signup',
  'register',
  'auth',
  'callback',
  'status',
  'docs',
  'faq',
  'blog',
  'news',

  // ───────────────────────────────────────────────────────────────────────
  // §7.4 — Crypto primitives + financial verbs (24 entries — original 16 +
  //        S.91 expansion of 8 financial-flow primitives)
  //
  // If a user mints `treasury.audric.sui` and pretends to be Audric's
  // treasury wallet, victims sending fees/donations there lose funds.
  // Financial-verb handles (`stake`, `claim`, etc.) get socially-engineered
  // into "send to {verb}.audric.sui to {action}."
  //
  // S.91 additions extend the set with financial-flow primitives that
  // were structural gaps — fee/refund/gas/bridge/escrow/safe all match
  // the section's intent (fund-routing impersonation surface). See
  // RUNBOOK §7.4 for per-entry rationale.
  // ───────────────────────────────────────────────────────────────────────
  'wallet',
  'treasury',
  'vault',
  'pool',
  'dao',
  'defi',
  'lend',
  'lending',
  'invest',
  'yield',
  'stake',
  'unstake',
  'claim',
  'deposit',
  'withdraw',
  'transfer',
  // S.91 expansion — financial-flow primitives
  'fee',
  'fees',
  'refund',
  'refunds',
  'gas',
  'bridge',
  'escrow',
  'safe',

  // ───────────────────────────────────────────────────────────────────────
  // §7.5 Tier A — Sui ecosystem brands (13 entries — high impersonation
  // value, founders/users actively interact with these)
  //
  // Even though Audric isn't claiming to be these brands, having
  // `binance.audric.sui` resolve to a random user creates phishing
  // opportunities ("send your USDC to binance.audric.sui to deposit on
  // Binance"). Reserving is reversible via /api/admin/identity/release;
  // mint-then-recover is not.
  //
  // S.91 add: `slush` — Mysten Labs' new wallet brand (succeeding
  // Suiet brand-wise). Active phishing target as adoption grows.
  // ───────────────────────────────────────────────────────────────────────
  'sui',
  'mysten',
  'mystenlabs',
  'navi',
  'cetus',
  'volo',
  'walrus',
  'scallop',
  'kriya',
  'suiet',
  'phantom',
  'suins',
  'slush', // S.91

  // ───────────────────────────────────────────────────────────────────────
  // §7.5 Tier B — Major crypto/exchange brands (13 entries — high
  // impersonation value globally)
  // ───────────────────────────────────────────────────────────────────────
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'circle',
  'usdc',
  'binance',
  'coinbase',
  'kraken',
  'okx',
  'bybit',
  'coingecko',
  'coinmarketcap',

  // ───────────────────────────────────────────────────────────────────────
  // §7.6 — Regulator / government (7 entries)
  //
  // Any user minting `sec.audric.sui` and impersonating a regulator is
  // both a user-protection failure (phishing) AND a legal-exposure
  // problem for Audric (the regulator may demand revocation or sue).
  // `treasury` is already covered by §7.4.
  // ───────────────────────────────────────────────────────────────────────
  'sec',
  'irs',
  'fed',
  'fbi',
  'ofac',
  'cftc',
  'fincen',

  // ───────────────────────────────────────────────────────────────────────
  // §7.7 — Generic abuse magnets / footguns (12 entries — original 10 +
  //        S.91 expansion of 2 fallback-state primitives)
  //
  // Common JavaScript / database / null-state strings. If they ever
  // appear in error messages or fallback rendering paths ("Send to:
  // anonymous.audric.sui" when the actual recipient lookup failed) they
  // create confusion. Low-likelihood failure mode, cheap defense.
  //
  // S.91 adds: `unknown` (fallback state — "Unknown sender:
  // unknown.audric.sui") and `placeholder` (debug fallback — UI
  // placeholder text could leak as a literal handle reference).
  // ───────────────────────────────────────────────────────────────────────
  'none',
  'void',
  'nil',
  'nan',
  'error',
  'deleted',
  'removed',
  'banned',
  'anonymous',
  'anon',
  // S.91 expansion — fallback-state primitives
  'unknown',
  'placeholder',

  // ───────────────────────────────────────────────────────────────────────
  // §7.8a — Static-route sentinels (S.74 + S.75, 14 entries)
  //
  // Top-level static folders + Next.js special files under `app/`.
  // Next.js prioritizes static segments over the new `[username]`
  // dynamic route, so claiming one of these would resolve to the
  // static page instead of the user's profile — confusing for the
  // would-be claimant and unfixable post-claim.
  //
  // **Keep this list in sync with every new top-level static folder
  // added to `app/`.** Current audit (2026-05-06): admin (in §7.1),
  // api (§7.1), auth (§7.3), pay (§7.1), settings (§7.3) — covered by
  // earlier sections; the entries below are the ones not otherwise
  // claimed.
  // ───────────────────────────────────────────────────────────────────────
  'new',
  'chat',
  'invoice',
  'litepaper',
  'privacy',
  'terms',
  'disclaimer',
  'security',
  'icon', // app/icon.svg
  'favicon', // app/favicon.ico (potential)
  'manifest', // app/manifest.webmanifest (potential)
  'robots', // app/robots.txt (potential)
  'sitemap', // app/sitemap.xml (potential)
  'opengraph-image', // app/opengraph-image.tsx

  // ───────────────────────────────────────────────────────────────────────
  // §7.8b — Future-product reservation (S.75, 23 entries)
  //
  // Audric features that either exist on the roadmap (Audric 2.0
  // Phase E `/report/[address]` portfolio pages, Audric Store,
  // notifications) or are likely future expansions. Reserving early
  // avoids the "we shipped /credit but @credit was already claimed"
  // embarrassment.
  //
  // Heuristic for inclusion: would shipping a feature with this URL
  // segment in the next 12 months be embarrassing if a user already
  // claimed it? If yes, reserve.
  // ───────────────────────────────────────────────────────────────────────
  'credit', // Audric Finance op (currently 'borrow', 'credit' is the noun form for the same product)
  'savings', // noun form of `save` (which is reserved) — the surface name for the savings product
  'portfolio',
  'portfolios',
  'balance',
  'balances',
  'home',
  'feed',
  'inbox',
  'notifications', // plural form of `notification` (reserved in §7.1)
  'search',
  'explore',
  'discover',
  'onboarding',
  'welcome',
  'report', // Audric 2.0 Phase E `/report/[address]`
  'reports',
  'analytics',
  'wallets', // plural form of `wallet` (reserved in §7.4)
  'goals', // /api/user/goals → likely future /goals page
  'goal', // defensive singular pair for `goals` — added S.84 polish v3
  'memories', // /api/user/memories → likely future /memories page
  'preferences',
  'watch', // /api/user/watch-addresses → likely future /watch page
  // [S.84 polish v3] Panel routes — `PANEL_URL_MAP['activity']`,
  // `PANEL_URL_MAP['contacts']` in `hooks/usePanel.ts`. Today the panel
  // system pushes these URLs via `window.history.pushState`, so a refresh
  // would resolve via `[username]/page.tsx` (the bug that "panel state
  // doesn't survive refresh" is separate). Reserving the labels prevents
  // a user from claiming `activity.audric.sui` / `contacts.audric.sui`
  // and stealing the URL space if/when the panels get static `app/`
  // routes — and short-circuits the lookup today either way.
  'activity',
  'activities', // defensive plural pair for `activity`
  'contacts', // plural pair for `contact` (already in §7.8c)

  // ───────────────────────────────────────────────────────────────────────
  // §7.8c — Operator / brand pages (S.75, 24 entries)
  //
  // Common B2B/B2C marketing routes the company will ship at scale
  // (about page, careers, press kit, investor page). Reserve before
  // claim-rush if Audric ever lands on Hacker News.
  //
  // Founder explicitly requested `investors` in S.75 — the rest of the
  // cluster (investor / shareholders / board / advisors / partners /
  // ambassadors) follows the same logic.
  // ───────────────────────────────────────────────────────────────────────
  'about',
  'contact',
  'company',
  'press',
  'media',
  'careers',
  'jobs',
  'hiring',
  'investors',
  'investor',
  'shareholders',
  'board',
  'advisors',
  'partners',
  'partner',
  'ambassador',
  'ambassadors',
  'pricing',
  'plans',
  'plan',
  'billing',
  'subscription',
  'premium',
  'upgrade',

  // ───────────────────────────────────────────────────────────────────────
  // §7.8d — Legal / compliance (S.75, 7 entries)
  //
  // Legal pages not in §7.3 (which covers blog/docs/faq/news). Privacy
  // and terms are static-route sentinels and live in §7.8a.
  // ───────────────────────────────────────────────────────────────────────
  'legal',
  'tos',
  'eula',
  'policy',
  'gdpr',
  'cookies',
  'compliance',
] as const;

/**
 * The reserved set. ALL labels MUST be lowercase — the lookup is
 * case-insensitive via `isReserved()` but the set itself stores the
 * canonical lowercase form.
 *
 * Total: 206 entries (§7.1: 36, §7.2: 12, §7.3: 17, §7.4: 24,
 * §7.5: 26 (Tier A 13 + Tier B 13), §7.6: 7, §7.7: 12, §7.8: 72
 * (a:14 + b:27 + c:24 + d:7)). Set size will dedupe any accidental
 * cross-category overlap; the explicit categorization above is for
 * human auditors.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set(RESERVED);

/**
 * Returns true if the label is reserved and cannot be claimed.
 *
 * Caller is expected to have already passed length + charset validation
 * — `isReserved()` does NOT re-validate (it just does a Set lookup on
 * the lowercased input).
 */
export function isReserved(label: string): boolean {
  return RESERVED_USERNAMES.has(label.trim().toLowerCase());
}
