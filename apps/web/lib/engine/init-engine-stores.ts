/**
 * One-shot engine store initialization.
 *
 * Loaded twice for defense-in-depth:
 *   1. From `instrumentation.ts` — runs once per Vercel worker at boot,
 *      BEFORE any request handler. This is the primary load.
 *   2. As a side-effect import from `lib/portfolio.ts` and
 *      `lib/engine/engine-factory.ts` — covers the case where a request
 *      hits a route whose entry point doesn't transitively pull in the
 *      instrumentation hook (Edge runtime, custom invocations).
 *
 * Idempotent — `setDefiCacheStore` is a setter on a module-level
 * singleton, so calling it multiple times in the same process is
 * safe and just replaces the active store with a fresh instance
 * (which is fine because each new instance points to the same
 * Upstash backend; warm cache lives in Redis, not in the store
 * object).
 *
 * Why this exists
 * ---------------
 * Pre-this-module, the `setDefiCacheStore` call lived in
 * `engine-factory.ts`. That module is imported only by
 * `/api/engine/chat`, `/api/engine/sessions`, and
 * `/api/engine/resume`. Other routes that consume the engine's
 * DeFi cache — `/api/portfolio`, `/api/analytics/portfolio-history`
 * — load `lib/portfolio.ts` directly and never trigger the
 * factory module. On Vercel each route runs in its own
 * serverless function with its own process, so those routes never
 * had the Upstash store injected and silently fell back to the
 * engine's default `InMemoryDefiCacheStore`. Result: the chat
 * route's `balance_check` populated Redis, but `/api/portfolio`'s
 * fresh fetch (in a different process) couldn't read it and
 * returned `partial+0` during a 429 burst → Full Portfolio Overview
 * showed "DeFi —" while the same address showed full DeFi in
 * `balance_check` and the timeline canvas. Same SSOT divergence
 * the v0.54 work was meant to eliminate, just relocated to the
 * "wrong process injected the store" failure mode.
 */

import { setDefiCacheStore, setWalletCacheStore, setFetchLock } from '@t2000/engine';
import { env } from '@/lib/env';
import { UpstashDefiCacheStore } from './upstash-defi-cache';
import { UpstashWalletCacheStore } from './upstash-wallet-cache';
import { UpstashFetchLock } from './upstash-fetch-lock';

let initialized = false;

export function initEngineStores(): void {
  if (initialized) return;
  initialized = true;

  // Vitest seeds a placeholder Upstash URL (`https://test.upstash.io`)
  // in `vitest.setup.ts` so env-schema validation passes. If we
  // instantiate the store anyway, every test that imports
  // `lib/portfolio.ts` triggers a real network call to that bogus
  // host on the first cache lookup. The store catches the error
  // gracefully ("cache get failed, continuing as cache miss") but
  // each TLS handshake / retry burns multiple seconds, blowing the
  // 5s default `testTimeout` for any test that touches the engine.
  // Skip injection in test env — tests want the in-memory default.
  // eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: VITEST is set by vitest itself, has no env-schema entry, and only gates a test-only bypass that never runs in production.
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') {
    return;
  }

  // Defensive — if either env var is missing the engine falls back
  // to its default in-memory store. The env schema marks both as
  // required so this branch should be unreachable in production,
  // but the guard prevents a misconfigured preview deploy from
  // crashing the whole process.
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn(
      '[init-engine-stores] UPSTASH_REDIS_REST_URL or _TOKEN missing — DeFi + wallet caches will use in-memory store (per-instance, not shared) and the cross-instance fetch lock will use in-memory mode (no cross-instance coalescing). Set both env vars to enable cross-instance SSOT.',
    );
    return;
  }

  // [v0.54] DeFi half — shared cache for `fetchAddressDefiPortfolio`.
  setDefiCacheStore(new UpstashDefiCacheStore());

  // [PR 1 — v0.55] Wallet half — shared cache for `fetchAddressPortfolio`.
  // Same SSOT bug class as DeFi, just on the wallet portfolio. Closes
  // the divergence where balance_check / portfolio_analysis /
  // transaction_history could see three different totals on one chat
  // turn under BlockVision burst.
  setWalletCacheStore(new UpstashWalletCacheStore());

  // [PR 2 — v0.55] Cross-instance fetch lock — coalesces concurrent
  // BlockVision fan-outs across Vercel instances. Without this, even
  // with the shared caches, N concurrent instances all miss the cache
  // for the same address at the same instant and all N fan out to BV.
  // With it, only one instance is the leader; the rest poll the cache.
  setFetchLock(new UpstashFetchLock());
}

// Side-effect — run on import. Safe because `initEngineStores` is
// idempotent. Callers can also invoke explicitly if they want to
// be sure (e.g. a test that resets the engine state mid-suite).
initEngineStores();
