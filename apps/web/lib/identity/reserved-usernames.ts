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
 * Currently shipped: SPEC 10 D3 baseline only (35 entries — locked in
 * v0.2.1 before founder review). Phase A.5 extends with the founder-
 * approved categories from RUNBOOK §7.2–§7.8 (~85 additional candidates).
 */

const D3_BASELINE = [
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

  // Route-collision protection (added with SPEC 10 D.1 stub — S.74).
  // These match top-level static routes under `app/`. Next.js prioritizes
  // static segments over the `[username]` dynamic route, so claiming one
  // of these would resolve to the static page (homepage, settings, etc.)
  // instead of the user's profile — confusing for the would-be claimant
  // and unfixable post-claim. Keep this list in sync with every new
  // top-level static folder added to `app/`.
  'new',
  'chat',
  'settings',
  'auth',
  'invoice',
  'litepaper',
  'privacy',
  'terms',
  'disclaimer',
  'security',
] as const;

/**
 * The reserved set. ALL labels MUST be lowercase — the lookup is
 * case-insensitive via `isReserved()` but the set itself stores the
 * canonical lowercase form.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set(D3_BASELINE);

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
