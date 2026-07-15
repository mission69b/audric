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
 *   2. BlockVision private endpoint — paid; only when `BLOCKVISION_API_KEY`
 *      is set (OPTIONAL since the 2026-07-15 BlockVision cost teardown —
 *      unset in prod, so this branch no longer fires)
 *   3. Public Sui fullnode — the production default post-teardown.
 *      NOTE: Sui JSON-RPC deactivates 2026-07-31; the legacy app's
 *      remaining JSON-RPC paths need a sunset/migration decision before
 *      then regardless of which endpoint serves them.
 *
 * IMPORTANT: this helper must NOT be imported from client components.
 * `env.BLOCKVISION_API_KEY` is server-only and the env proxy throws on
 * client-side reads.
 */

import { JsonRpcHTTPTransport, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
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

// HTTP statuses worth retrying: 429 (rate limit) + transient 5xx. A burst
// of concurrent reads (e.g. post-write portfolio refresh racing a swap's
// composeTx) momentarily trips BlockVision's rate limit; without a retry
// the 429 bubbles up as a hard composeTx failure and the write dies. See
// the 2026-05-30 swap-429 incident.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RPC_RETRIES = 3;

function backoffMs(attempt: number): number {
  // 150ms, 300ms, 600ms … capped at 2s, plus jitter to de-sync bursts.
  return Math.min(2000, 150 * 2 ** attempt) + Math.random() * 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** `fetch` wrapper that retries on 429 / transient 5xx with exponential
 * backoff (honoring `Retry-After` when present). Aborts propagate. */
function createRetryingFetch(): typeof fetch {
  return async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ): Promise<Response> => {
    let attempt = 0;
    while (true) {
      let res: Response;
      try {
        res = await fetch(input, init);
      } catch (err) {
        if (
          attempt >= MAX_RPC_RETRIES ||
          (err as Error)?.name === "AbortError"
        ) {
          throw err;
        }
        await sleep(backoffMs(attempt));
        attempt++;
        continue;
      }
      if (!RETRYABLE_STATUS.has(res.status) || attempt >= MAX_RPC_RETRIES) {
        return res;
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : backoffMs(attempt);
      await sleep(wait);
      attempt++;
    }
  };
}

/**
 * Canonical server-side Sui JSON-RPC client. Routes through the
 * BlockVision paid endpoint (`getSuiRpcUrl`) AND wraps the transport in
 * 429/5xx retry-with-backoff. Use this everywhere instead of
 * `new SuiJsonRpcClient({ url })` so transient rate limits don't hard-fail
 * transaction prepare / execute. Server-only (reads `BLOCKVISION_API_KEY`).
 */
export function createSuiRpcClient(): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    network: env.NEXT_PUBLIC_SUI_NETWORK as "mainnet" | "testnet" | "devnet",
    transport: new JsonRpcHTTPTransport({
      url: getSuiRpcUrl(),
      fetch: createRetryingFetch(),
    }),
  });
}
