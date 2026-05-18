/**
 * Server-side Sui RPC URL resolution.
 *
 * **Vendored** (~14 LoC, byte-identical to `apps/web/lib/sui-rpc.ts`) per
 * the Day 2b cross-app-import audit: the production helper uses
 * `@/lib/env` which is audric/web's path alias — pulling it in via
 * cross-package import would require a tsconfig alias hack. Vendoring
 * is cleaner. Phase 6 cutover collapses both copies into a shared lib.
 *
 * Order of precedence:
 *   1. Explicit `SUI_RPC_URL` env override
 *   2. BlockVision private endpoint — paid, much higher rate limits and
 *      lower p95 than the free public node (`BLOCKVISION_API_KEY` is
 *      required by env schema, so this branch always wins in production)
 *   3. Public Sui fullnode — defense-in-depth fallback that should never
 *      fire (the env gate in `lib/env.ts` rejects empty BLOCKVISION_API_KEY
 *      at boot)
 *
 * IMPORTANT: this helper must NOT be imported from client components.
 * `env.BLOCKVISION_API_KEY` is server-only and the env proxy throws on
 * client-side reads.
 */

import { env } from "./env";

export function getSuiRpcUrl(): string {
  const network = env.NEXT_PUBLIC_SUI_NETWORK;

  if (env.SUI_RPC_URL) {
    return env.SUI_RPC_URL;
  }

  const blockvisionKey = env.BLOCKVISION_API_KEY;
  if (blockvisionKey) {
    return `https://sui-${network}.blockvision.org/v1/${blockvisionKey}`;
  }

  return `https://fullnode.${network}.sui.io:443`;
}
