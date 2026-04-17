/**
 * Feature flag registry for Audric.
 *
 * V1 mechanism: env-var kill-switches. No per-user gating, no LaunchDarkly.
 * See audric-copilot-smart-confirmations.plan.md §10 for rationale.
 *
 * Adding a new flag:
 *   1. Add it to FeatureFlags below
 *   2. Read the env var here (server) + provide a NEXT_PUBLIC_ mirror (client)
 *   3. Document both in .env.example
 */

export interface FeatureFlags {
  copilot: {
    enabled: boolean;
  };
}

const parseBool = (value: string | undefined): boolean =>
  value === "true" || value === "1";

/**
 * Server-side feature flags. Safe to call from any server context
 * (route handlers, server components, cron jobs). Reads `process.env`
 * directly — no caching needed since env is static for the process lifetime.
 */
export function getServerFeatureFlags(): FeatureFlags {
  return {
    copilot: {
      enabled: parseBool(process.env.COPILOT_ENABLED),
    },
  };
}

/**
 * Client-side feature flags, derived from `NEXT_PUBLIC_*` env vars at build time.
 * Must be kept in sync with the server-side values via deploy config.
 *
 * Safe to call from client components — `NEXT_PUBLIC_*` is inlined by Next at build.
 */
export function getClientFeatureFlags(): FeatureFlags {
  return {
    copilot: {
      enabled: parseBool(process.env.NEXT_PUBLIC_COPILOT_ENABLED),
    },
  };
}

/**
 * Convenience guard used at the top of cron jobs and server-side Copilot routes.
 * Returns true if Copilot is enabled; false otherwise. Pair with an early return.
 *
 * Example:
 *   if (!isCopilotEnabled()) return new Response(null, { status: 404 });
 */
export function isCopilotEnabled(): boolean {
  return parseBool(process.env.COPILOT_ENABLED);
}
