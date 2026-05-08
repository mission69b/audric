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

    // [S.123 v0.55.x] Process-level safety net for unhandled rejections
    // and uncaught exceptions.
    //
    // Without this, Vercel/Node 20+ default `--unhandled-rejections=throw`
    // calls `process.exit(128)` on any rejected promise that isn't observed
    // within the same microtask queue drain. That kills EVERY in-flight
    // request on the serverless instance — not just the one that triggered
    // the rejection.
    //
    // The engine already ships its own structural fix (S.123 v1.24.7
    // `early-dispatcher.ts` `.catch` attached at dispatch time), but tools
    // can be wired through other paths (cron jobs, background scripts,
    // future code) that don't go through the dispatcher. This handler is
    // the last line of defense — log loudly so we get an alert, but DO NOT
    // crash the process.
    //
    // If a future bug introduces a frequent unhandled rejection, the noise
    // here will be visible in Vercel logs / Sentry — that's the signal to
    // fix the actual bug. Silent survival is intentional: a serverless
    // instance carrying 50 concurrent users should not die because one of
    // them tripped a misconfigured Brave Search request.
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[S.123 unhandledRejection] Process survived rejection:', {
        reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
        promise: String(promise),
      });
    });

    process.on('uncaughtException', (err) => {
      console.error('[S.123 uncaughtException] Process survived exception:', {
        message: err.message,
        stack: err.stack,
      });
    });
  }
}
