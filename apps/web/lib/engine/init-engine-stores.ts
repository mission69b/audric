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

import { setDefiCacheStore } from '@t2000/engine';
import { UpstashDefiCacheStore } from './upstash-defi-cache';

let initialized = false;

export function initEngineStores(): void {
  if (initialized) return;
  initialized = true;

  // Defensive — if either env var is missing the engine falls back
  // to its default in-memory store. The env schema marks both as
  // required so this branch should be unreachable in production,
  // but the guard prevents a misconfigured preview deploy from
  // crashing the whole process.
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn(
      '[init-engine-stores] UPSTASH_REDIS_REST_URL or _TOKEN missing — DeFi cache will use in-memory store (per-instance, not shared). Set both env vars to enable cross-instance SSOT.',
    );
    return;
  }

  setDefiCacheStore(new UpstashDefiCacheStore());
}

// Side-effect — run on import. Safe because `initEngineStores` is
// idempotent. Callers can also invoke explicitly if they want to
// be sure (e.g. a test that resets the engine state mid-suite).
initEngineStores();
