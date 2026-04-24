/**
 * Server-side Sui RPC URL resolution.
 *
 * Order of precedence:
 *   1. Explicit `SUI_RPC_URL` env override
 *   2. BlockVision private endpoint (`BLOCKVISION_API_KEY` set) — paid, much
 *      higher rate limits and lower p95 than the free public node
 *   3. Public Sui fullnode (`https://fullnode.<network>.sui.io:443`) — used as
 *      a last-resort fallback so local dev keeps working without a key
 *
 * IMPORTANT: this helper must NOT be imported from client components, because
 * `BLOCKVISION_API_KEY` is a server-only secret. Browser RPC calls (PayButton
 * etc.) keep using the public fullnode.
 */
export function getSuiRpcUrl(): string {
  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as
    | 'mainnet'
    | 'testnet';

  if (process.env.SUI_RPC_URL) return process.env.SUI_RPC_URL;

  const blockvisionKey = process.env.BLOCKVISION_API_KEY;
  if (blockvisionKey) {
    // Format from BlockVision dashboard:
    //   https://sui-<network>.blockvision.org/v1/<API_KEY>
    return `https://sui-${network}.blockvision.org/v1/${blockvisionKey}`;
  }

  return `https://fullnode.${network}.sui.io:443`;
}
