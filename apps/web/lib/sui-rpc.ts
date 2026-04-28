import { env } from '@/lib/env';

/**
 * Server-side Sui RPC URL resolution.
 *
 * Order of precedence:
 *   1. Explicit `SUI_RPC_URL` env override
 *   2. BlockVision private endpoint (`BLOCKVISION_API_KEY` is required by
 *      env schema, so this branch always wins in production) — paid, much
 *      higher rate limits and lower p95 than the free public node
 *   3. Public Sui fullnode (`https://fullnode.<network>.sui.io:443`) — kept
 *      only as a defense-in-depth fallback that should never fire (the env
 *      gate in `lib/env.ts` rejects empty BLOCKVISION_API_KEY at boot)
 *
 * IMPORTANT: this helper must NOT be imported from client components.
 * `env.BLOCKVISION_API_KEY` is server-only and the env proxy throws on
 * client-side reads. Browser RPC calls (PayButton etc.) keep using the
 * public fullnode.
 */
export function getSuiRpcUrl(): string {
  const network = env.NEXT_PUBLIC_SUI_NETWORK;

  if (env.SUI_RPC_URL) return env.SUI_RPC_URL;

  const blockvisionKey = env.BLOCKVISION_API_KEY;
  if (blockvisionKey) {
    // Format from BlockVision dashboard:
    //   https://sui-<network>.blockvision.org/v1/<API_KEY>
    return `https://sui-${network}.blockvision.org/v1/${blockvisionKey}`;
  }

  return `https://fullnode.${network}.sui.io:443`;
}
