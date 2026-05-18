/**
 * Next.js instrumentation hook — runs once per Node worker at server boot.
 *
 * Triggers env-schema validation at the earliest possible moment so
 * misconfigured deploys fail with a loud, actionable error BEFORE any
 * request hits a degraded code path.
 *
 * See `lib/env.ts` for the schema; see the t2000 `env-validation-gate`
 * rule for the cross-monorepo standard this implements.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Side-effect import. Module-load triggers the Zod parse + throw.
    await import("./lib/env");
  }
}
