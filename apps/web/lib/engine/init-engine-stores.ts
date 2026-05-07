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

import { setDefiCacheStore, setWalletCacheStore, setFetchLock, setNaviCacheStore, setTelemetrySink } from '@t2000/engine';
import { env } from '@/lib/env';
import { UpstashDefiCacheStore } from './upstash-defi-cache';
import { UpstashWalletCacheStore } from './upstash-wallet-cache';
import { UpstashFetchLock } from './upstash-fetch-lock';
import { UpstashNaviCacheStore } from './upstash-navi-cache';
import { VercelTelemetrySink } from './vercel-sink';
import {
  setTxHistoryCacheStore,
  UpstashTxHistoryCacheStore,
} from '@/lib/upstash-tx-history-cache';
import {
  setSuinsCacheStore,
  UpstashSuinsCacheStore,
} from '@/lib/suins-cache';

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

  // [PR 5 — v0.56] Telemetry sink — always set unconditionally in Vercel.
  // Does NOT depend on Upstash; you want structured Observability log lines
  // even if Redis isn't configured (e.g. a staging deploy with no Redis).
  // Setting before the Upstash guard ensures it fires regardless.
  setTelemetrySink(new VercelTelemetrySink());

  // Defensive — if either env var is missing the engine falls back
  // to its default in-memory store. The env schema marks both as
  // required so this branch should be unreachable in production,
  // but the guard prevents a misconfigured preview deploy from
  // crashing the whole process.
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn(
      '[init-engine-stores] UPSTASH_REDIS_REST_URL or _TOKEN missing — DeFi + wallet + NAVI caches will use in-memory store (per-instance, not shared) and the cross-instance fetch lock will use in-memory mode (no cross-instance coalescing). Set both env vars to enable cross-instance SSOT.',
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

  // [PR 4 — v0.56] NAVI MCP read cache — 30s TTL for address-scoped reads
  // (savings, health), 5-min TTL for rates. Prevents repeated MCP round-trips
  // on consecutive tool calls for the same address in the same chat session.
  setNaviCacheStore(new UpstashNaviCacheStore());

  // [PR 7 — v0.57] Transaction-history cache — 30s TTL keyed by
  // (address + opts fingerprint). Same SSOT bug class as PR 1+2 but for
  // the BlockVision Sui RPC path used by `/api/activity` and `/api/history`.
  // Without it, dashboard auto-refresh + concurrent users produce 429
  // bursts on `client.queryTransactionBlocks` (observed in Vercel logs
  // 2026-04-28). Coalesces with `awaitOrFetch` over the existing PR 2 lock.
  setTxHistoryCacheStore(new UpstashTxHistoryCacheStore());

  // [S18-F12 — May 2026] SuiNS handle resolution cache — 5min positive,
  // 30s negative TTL. Promoted from per-Lambda in-memory (S18-F9) to
  // Upstash so the entire fleet shares one cache, eliminating the
  // cold-Lambda RPC penalty during launch bursts (100-1000 concurrent
  // signups was the trigger). Used by `/[username]/page.tsx` (public
  // profile renders) + `/api/identity/reserve` (pre-mint check) +
  // `/api/identity/check` (claim availability).
  setSuinsCacheStore(new UpstashSuinsCacheStore());
}

// Side-effect — run on import. Safe because `initEngineStores` is
// idempotent. Callers can also invoke explicitly if they want to
// be sure (e.g. a test that resets the engine state mid-suite).
initEngineStores();
