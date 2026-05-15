/**
 * Wallet allowlist for the AI-SDK-native engine cutover.
 *
 * SPEC 37 v0.7a Phase 2 Day 13 — opt specific Sui addresses into the
 * `AISDKEngine` codepath without flipping the global
 * `USE_AI_SDK_NATIVE_ENGINE` kill-switch. Drives founder dogfood +
 * alpha-tester rollout BEFORE broader percentage / 100% flips.
 *
 * Resolution order in `engine-factory.ts`:
 *   1. Address in `USE_AI_SDK_NATIVE_ENGINE_WALLETS` → AISDKEngine.
 *   2. `USE_AI_SDK_NATIVE_ENGINE === '1'` → AISDKEngine.
 *   3. Default → legacy QueryEngine.
 *
 * The unauth/demo path always honours #2 only (no address available).
 *
 * Why Set<string> + isValidSuiAddress filter at parse time:
 *   - Comparison is hot-path (every authenticated chat boot calls this).
 *     Set.has is O(1) — beats array.includes for any non-trivial size.
 *   - Invalid addresses get dropped at boot with a console warning, not
 *     a thrown error. An ops-level typo (extra comma, missing `0x`)
 *     should not brick chat for everyone — log it and move on.
 *
 * Pairs naturally with a future percentage gate (founder + alpha
 * wallets via allowlist; broader rollout via percentage). Both can run
 * concurrently without conflict — the address check fires first.
 *
 * Architectural fit: lives in the audric host, NOT in the engine. Same
 * rationale as `account-age-gate.ts` (SPEC 30 D-13). The engine has no
 * concept of "this audric user" — that's a host concern. When/if a
 * second host needs the same gate, copy this 30-line module.
 */

import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

/**
 * Parses the comma-separated allowlist env value into a Set of
 * normalised Sui addresses.
 *
 * - Trims whitespace per entry.
 * - Drops entries that fail `isValidSuiAddress`.
 * - Lower-cases via `normalizeSuiAddress` (Sui addresses ARE
 *   case-insensitive on-chain — `0xABC...` and `0xabc...` are the
 *   same wallet — but JS Set.has is case-sensitive, so we normalise).
 * - Empty / undefined / whitespace-only input → empty Set (allowlist OFF).
 *
 * Returns the Set + a list of dropped raw entries so callers can log
 * the ops-misconfig without re-parsing.
 */
export function parseWalletAllowlist(
  raw: string | undefined | null,
): { allowlist: Set<string>; dropped: string[] } {
  if (!raw || !raw.trim()) {
    return { allowlist: new Set(), dropped: [] };
  }

  const allowlist = new Set<string>();
  const dropped: string[] = [];

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (!isValidSuiAddress(trimmed)) {
      dropped.push(trimmed);
      continue;
    }
    allowlist.add(normalizeSuiAddress(trimmed));
  }

  return { allowlist, dropped };
}

/**
 * Module-level memoised allowlist Set.
 *
 * Parsed lazily on first call from `process.env.USE_AI_SDK_NATIVE_ENGINE_WALLETS`
 * via the canonical `env` proxy. Re-reading env on every chat request
 * would be wasteful — the value can only change on Vercel re-deploy
 * or runtime env update (which restarts the serverless function), so
 * one parse per cold start is correct.
 *
 * Tests use `parseWalletAllowlist` directly to avoid the module-level
 * cache and exercise inputs deterministically.
 */
let cachedAllowlist: Set<string> | null = null;

/**
 * Test-only: clear the module-level cache. Production code never
 * calls this — the cache is parse-once-per-cold-start by design.
 */
export function _resetCachedAllowlist(): void {
  cachedAllowlist = null;
}

/**
 * Returns true when `address` is in the allowlist (and the allowlist
 * is non-empty). Always false when the env var is unset or empty.
 *
 * Address comparison is normalised — `0xABC...` matches `0xabc...`
 * regardless of how the caller cased it.
 */
export function isAddressAllowlisted(
  address: string | undefined | null,
  rawAllowlist: string | undefined | null,
): boolean {
  if (!address) return false;
  if (cachedAllowlist === null) {
    const { allowlist, dropped } = parseWalletAllowlist(rawAllowlist);
    if (dropped.length > 0) {
      console.warn(
        `[engine-factory] dropped ${dropped.length} invalid wallet(s) from USE_AI_SDK_NATIVE_ENGINE_WALLETS:`,
        dropped,
      );
    }
    cachedAllowlist = allowlist;
  }
  if (cachedAllowlist.size === 0) return false;
  if (!isValidSuiAddress(address)) return false;
  return cachedAllowlist.has(normalizeSuiAddress(address));
}
