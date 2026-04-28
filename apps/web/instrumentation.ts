/**
 * Next.js instrumentation hook — runs once per Node worker at server boot.
 *
 * We use it to trigger env-schema validation at the earliest possible
 * moment so misconfigured deploys fail with a loud, actionable error
 * BEFORE any request hits a degraded code path.
 *
 * If a required env var is missing, empty, or whitespace-only, the
 * import below throws inside `register()` and Vercel marks the
 * function as failed. The build log shows the formatted block from
 * `lib/env.ts` listing every misconfigured key plus the Vercel
 * settings URL — one click to fix.
 *
 * See `lib/env.ts` for the full schema and the bug story that motivated this.
 */

export async function register() {
  // Side-effect import. Module-load triggers the Zod parse + throw.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./lib/env');

    // [v0.54] Inject the shared Upstash DeFi cache store ASAP, before
    // any request handler runs. Without this every Vercel function
    // process keeps its own in-memory DeFi cache, defeating the
    // cross-instance SSOT the v0.54 engine work shipped. Side-effect
    // import: module-load runs the injection. Idempotent — safe if
    // a route also imports it via belt-and-suspenders.
    //
    // The module is also re-imported by `lib/portfolio.ts` and
    // `lib/engine/engine-factory.ts` as a backstop in case
    // instrumentation is skipped (e.g. Edge runtime, custom function
    // bundles). See `init-engine-stores.ts` for the full rationale.
    await import('./lib/engine/init-engine-stores');
  }
}
