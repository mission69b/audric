'use client';

import { useMemo } from 'react';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { deserializeKeypair } from '@/lib/zklogin';
export interface ServiceResult {
  success: boolean;
  paymentDigest: string;
  price: string;
  serviceId: string;
  result: unknown;
}

export interface ServiceRetryMeta {
  serviceId: string;
  gatewayUrl: string;
  serviceBody: string;
  price: string;
}

export class ServiceDeliveryError extends Error {
  paymentDigest: string;
  meta: ServiceRetryMeta;

  constructor(message: string, paymentDigest: string, meta: ServiceRetryMeta) {
    super(message);
    this.name = 'ServiceDeliveryError';
    this.paymentDigest = paymentDigest;
    this.meta = meta;
  }
}

/**
 * [SPEC 26 P5 review remediation / 2026-05-13] Typed error for the
 * gateway's settle-on-success "no delivery, no charge" path.
 *
 * Why a typed class (vs reusing `ServiceDeliveryError` or throwing
 * generic `Error`):
 *
 *   - `ServiceDeliveryError` semantically means "you WERE charged but
 *     the service failed" — its UI surface (`<ErrorReceipt>`) tells the
 *     user "payment of $X confirmed; contact support for refund." That
 *     is the OPPOSITE of what SPEC 26 settle-on-success communicates
 *     ("you were NOT charged, free to retry").
 *   - Pre-this-fix, `payService` threw a generic `Error` for SPEC 26
 *     402s, which `executeToolAction` then wrapped into `{
 *     paymentConfirmed: false }` — correct top-line signal but the
 *     `settleVerdict` / `settleReason` / 402-status fields the LLM
 *     prompt's D-8 paragraph relies on were dropped on the floor.
 *
 * Carries the `paymentDigest` because audric pre-settles USDC on-chain
 * via Enoki BEFORE the gateway is called (SPEC 26 O-4 architectural
 * caveat) — the digest is the bookkeeping handle for the deferred
 * `refund(digest)` flow once the MPP refund primitive ships.
 */
export class SettleNoDeliveryError extends Error {
  /** SPEC 26 verdict from the gateway: 'refundable' | 'charge-failed' (and any future verdict). */
  settleVerdict: string;
  /** Operator-facing reason from the gateway's `x-settle-reason` header. */
  settleReason: string;
  /** Sui digest of the on-chain pre-settlement transfer (audric pre-charges before calling the gateway). */
  paymentDigest: string | null;

  constructor(
    message: string,
    settleVerdict: string,
    settleReason: string,
    paymentDigest: string | null,
  ) {
    super(message);
    this.name = 'SettleNoDeliveryError';
    this.settleVerdict = settleVerdict;
    this.settleReason = settleReason;
    this.paymentDigest = paymentDigest;
  }
}

/**
 * [v0.55.x / S.122] Typed error for Enoki session-expired (`code: 'expired'`
 * or `code: 'jwt_error'` — both classified as `session_expired` by
 * `lib/enoki-error.ts`). Thrown by the `sponsoredTransaction` helper when
 * `/api/transactions/prepare` or `/api/transactions/execute` returns 401
 * + body `{ code: 'session_expired' }`.
 *
 * Why a typed class (vs a string-prefix on a generic Error):
 * - `executeBundleAction` + `executeToolAction` need to detect this error
 *   class to mark stepResults / executionResult with `_sessionExpired:
 *   true` so the UI renders the re-auth state (NOT "Payment Intent
 *   reverted") and the resume route short-circuits the Anthropic call.
 * - The pre-fix path threw `Error('[PREPARE_401] message')`; the `code:
 *   'session_expired'` field returned by the server was discarded and
 *   downstream had no programmatic signal to differentiate "session
 *   died" from "Enoki rejected for any other reason." Surfaced
 *   2026-05-08 (8 production failures / 12h) when the user saw
 *   "Payment Intent reverted atomically" + "rejected by Anthropic"
 *   instead of "your sign-in expired, please sign back in" — the
 *   underlying tx never even reached chain.
 */
export class EnokiSessionExpiredError extends Error {
  readonly code = 'session_expired' as const;
  /** 'prepare' or 'execute' — which route surfaced the 401. */
  readonly stage: 'prepare' | 'execute';

  constructor(message: string, stage: 'prepare' | 'execute') {
    super(message);
    this.name = 'EnokiSessionExpiredError';
    this.stage = stage;
  }
}

export interface BalanceChange {
  coinType: string;
  amount: string;
  owner?: unknown;
}

/**
 * [Track B / 2026-05-08] `harvestPlan` is populated only by `harvestRewards()`.
 * Carries the per-leg breakdown (claimed/swaps/skipped/expectedUsdcDeposited)
 * computed server-side at compose time, so the resume tool_result can carry
 * the data the LLM needs to narrate the outcome. Other write actions leave
 * it undefined.
 */
export interface HarvestPlanLite {
  claimed: Array<{ symbol?: string; amount: number; estimatedValueUsd?: number }>;
  swaps: Array<{ fromSymbol: string; inputAmount: number; expectedOutputUsdc: number }>;
  skipped: Array<{ symbol?: string; amount: number; reason: 'untradeable' | 'dust' | 'no-route' }>;
  expectedUsdcDeposited: number;
}

export type TxResult = {
  tx: string;
  balanceChanges?: BalanceChange[];
  harvestPlan?: HarvestPlanLite;
};

/**
 * [SPEC 7 P2.4 Layer 3] Minimal bundle-step shape sent over the wire.
 * The full `WriteStep` type lives in `@t2000/sdk` (server-only); we keep
 * the browser surface minimal so the SDK doesn't have to be reachable
 * from client code. The prepare route validates and re-types each step
 * server-side via `composeTx`.
 */
export interface BundleStep {
  toolName: string;
  input: unknown;
  /**
   * [SPEC 13 Phase 1] Index of an earlier step whose output coin handle
   * is consumed as THIS step's input coin. The prepare route forwards
   * this to `composeTx({ steps })`, whose orchestration loop threads
   * `priorOutputs[N]` into the consumer appender's `inputCoin`,
   * suppressing the wallet pre-fetch path. Populated by the engine's
   * `composeBundleFromToolResults` for whitelisted aligned producer →
   * consumer pairs.
   */
  inputCoinFromStep?: number;
  /**
   * [SPEC 20.2 / D-1 (a)] Engine-captured Cetus route from the matching
   * `swap_quote` for THIS step. Only meaningful when `toolName ===
   * 'swap_execute'`; ignored for other tools. Forwarded as `cetusRoute`
   * to `/api/transactions/prepare?type=bundle`, where the route validates
   * (D-2 coin match + D-3 freshness) and injects it as
   * `step.input.precomputedRoute` for `composeTx`. Undefined → legacy
   * fallback (correct, just slower; D-5 dual-path).
   */
  cetusRoute?: unknown;
}

export interface AgentActions {
  address: string;
  send(params: { to: string; amount: number; asset?: string }): Promise<TxResult>;
  save(params: { amount: number; asset?: string; protocol?: string }): Promise<TxResult>;
  withdraw(params: { amount: number; asset?: string; protocol?: string; fromAsset?: string; toAsset?: string }): Promise<TxResult>;
  borrow(params: { amount: number; asset?: string; protocol?: string }): Promise<TxResult>;
  repay(params: { amount: number; asset?: string; protocol?: string }): Promise<TxResult>;
  claimRewards(): Promise<TxResult>;
  /**
   * [Track B / 2026-05-08] Compound write — claim NAVI rewards, swap each
   * non-USDC reward to USDC inline, deposit the merged USDC into NAVI
   * savings. ALL legs settle in one Programmable Transaction Block; either
   * every leg lands or none of them do (atomic). Untradeable / dust
   * rewards transfer to the wallet so nothing is lost.
   *
   * Routed through `/api/transactions/prepare?type=harvest`, which builds
   * the PTB via the SDK's `addHarvestToTx` and sponsors it via Enoki.
   */
  harvestRewards(params: { slippage?: number; minRewardUsd?: number }): Promise<TxResult>;
  swap(params: {
    from: string;
    to: string;
    amount: number;
    slippage?: number;
    byAmountIn?: boolean;
    /**
     * [SPEC 20.2 / D-1 (a)] Engine-emitted Cetus route from the matching
     * `swap_quote` in the same turn. Forwarded into /api/transactions/
     * prepare body so the route handler can use it as the fast-path
     * (skips ~400-500ms findSwapRoute()). Undefined → legacy fallback
     * (correct, just slower; see D-5 dual-path).
     */
    cetusRoute?: unknown;
  }): Promise<TxResult>;
  stakeVSui(params: { amount: number }): Promise<TxResult>;
  unstakeVSui(params: { amount: number }): Promise<TxResult>;
  payService(params: { serviceId?: string; fields?: Record<string, string>; url?: string; rawBody?: Record<string, unknown> }): Promise<ServiceResult>;
  retryServiceDelivery(paymentDigest: string, meta: ServiceRetryMeta): Promise<ServiceResult>;
  /**
   * [SPEC 7 P2.4] Multi-write Payment Intent. All steps execute atomically
   * inside a single Payment Intent sponsored by Enoki. The single tx digest + the
   * combined `balanceChanges` are returned; the caller (executeToolAction)
   * is responsible for splitting balanceChanges back into per-step
   * `stepResults` shapes for the resume route.
   */
  executeBundle(steps: ReadonlyArray<BundleStep>): Promise<TxResult>;
}

export function useAgent() {
  const { session, status } = useZkLogin();

  const agent = useMemo((): { address: string; getInstance: () => Promise<AgentActions> } | null => {
    if (!session || status !== 'authenticated') return null;

    return {
      address: session.address,
      async getInstance(): Promise<AgentActions> {
        const { ZkLoginSigner } = await import('@t2000/sdk/browser');

        const ephemeralKeypair = deserializeKeypair(session.ephemeralKeyPair);
        const signer = new ZkLoginSigner(
          ephemeralKeypair,
          session.proof,
          session.address,
          session.maxEpoch,
        );

        const address = session.address;
        const jwt = session.jwt;

        /**
         * Sponsored transaction flow:
         * 1. POST /api/transactions/prepare — server builds tx + sponsors via Enoki
         * 2. Sign locally with zkLogin signer (non-custodial)
         * 3. POST /api/transactions/execute — server submits signature to Enoki
         */
        async function sponsoredTransaction(
          txType: string,
          params: Record<string, unknown>,
        ): Promise<{
          tx: string;
          balanceChanges?: Array<{ coinType: string; amount: string; owner?: unknown }>;
          harvestPlan?: HarvestPlanLite;
        }> {
          const prepareHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (jwt) {
            prepareHeaders['x-zklogin-jwt'] = jwt;
          }

          let prepareRes: Response;
          try {
            prepareRes = await fetch('/api/transactions/prepare', {
              method: 'POST',
              headers: prepareHeaders,
              body: JSON.stringify({ type: txType, address, ...params }),
            });
          } catch (fetchErr) {
            throw new Error(`[PREPARE_NETWORK] ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
          }

          if (!prepareRes.ok) {
            const err = (await prepareRes.json().catch(() => ({}))) as Record<string, string>;
            // [S.122] Typed throw on session-expired so executeToolAction +
            // executeBundleAction can short-circuit the resume → Anthropic
            // path. Generic 401s (code missing or different) keep the legacy
            // string-prefixed Error for back-compat.
            if (prepareRes.status === 401 && err.code === 'session_expired') {
              throw new EnokiSessionExpiredError(
                err.error ?? 'Your sign-in session has expired. Please sign back in to continue.',
                'prepare',
              );
            }
            throw new Error(`[PREPARE_${prepareRes.status}] ${err.error ?? 'Unknown prepare error'}`);
          }

          const { bytes, digest, harvestPlan } = await prepareRes.json();

          let signature: string;
          try {
            const txBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0));
            const signResult = await signer.signTransaction(txBytes);
            signature = signResult.signature;
          } catch (signErr) {
            throw new Error(`[SIGN] ${signErr instanceof Error ? signErr.message : String(signErr)}`);
          }

          let executeRes: Response;
          try {
            executeRes = await fetch('/api/transactions/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ digest, signature }),
            });
          } catch (fetchErr) {
            throw new Error(`[EXECUTE_NETWORK] ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`);
          }

          if (!executeRes.ok) {
            const err = (await executeRes.json().catch(() => ({}))) as Record<string, string>;
            // [S.122] See parallel branch in the prepare path above.
            if (executeRes.status === 401 && err.code === 'session_expired') {
              throw new EnokiSessionExpiredError(
                err.error ?? 'Your sign-in session has expired. Please sign back in to continue.',
                'execute',
              );
            }
            throw new Error(`[EXECUTE_${executeRes.status}] ${err.error ?? 'Unknown execute error'}`);
          }

          const result = await executeRes.json();
          return {
            tx: result.digest,
            balanceChanges: result.balanceChanges,
            ...(harvestPlan ? { harvestPlan: harvestPlan as HarvestPlanLite } : {}),
          };
        }

        return {
          address,

          async send({ to, amount, asset }) {
            return sponsoredTransaction('send', { amount, recipient: to, asset });
          },

          async save({ amount, asset, protocol }) {
            return sponsoredTransaction('save', { amount, asset, protocol });
          },

          async withdraw({ amount, asset, protocol, fromAsset, toAsset }) {
            return sponsoredTransaction('withdraw', { amount, asset, protocol, fromAsset, toAsset });
          },

          async borrow({ amount, asset, protocol }) {
            // [v0.51.0] Plumb asset through to /api/transactions/prepare so
            // USDsui borrows route to NAVI's USDsui pool. Pre-v0.51 we
            // dropped the asset here even though the SDK allow-list now
            // accepts USDC + USDsui.
            return sponsoredTransaction('borrow', { amount, asset, protocol });
          },

          async repay({ amount, asset, protocol }) {
            // [v0.51.1] Plumb asset through to /api/transactions/prepare so a
            // USDsui debt repays via NAVI's USDsui pool with USDsui coins.
            // Pre-v0.51.1 we dropped asset here even though both the engine
            // tool and the prepare route already accepted it.
            return sponsoredTransaction('repay', { amount, asset, protocol });
          },

          async claimRewards() {
            return sponsoredTransaction('claim-rewards', { amount: 0 });
          },

          async harvestRewards({ slippage, minRewardUsd } = {}) {
            // [Track B / 2026-05-08] One-PTB compound. The amount field is
            // a placeholder — the route uses pending NAVI rewards, not a
            // user-supplied amount.
            return sponsoredTransaction('harvest', {
              amount: 0,
              ...(slippage !== undefined ? { slippage } : {}),
              ...(minRewardUsd !== undefined ? { minRewardUsd } : {}),
            });
          },

          async swap({ from, to, amount, slippage, byAmountIn, cetusRoute }) {
            return sponsoredTransaction('swap', {
              amount,
              from,
              to,
              slippage,
              byAmountIn,
              // [SPEC 20.2 / D-1 (a)] Forward to /api/transactions/prepare.
              // The route handler validates D-2 (coin-type match) + D-3
              // (freshness) before using as the fast-path.
              ...(cetusRoute !== undefined ? { cetusRoute } : {}),
            });
          },

          async stakeVSui({ amount }) {
            return sponsoredTransaction('volo-stake', { amount });
          },

          async unstakeVSui({ amount }) {
            return sponsoredTransaction('volo-unstake', { amount });
          },

          async executeBundle(steps) {
            // [SPEC 7 P2.4 Layer 3] Forward steps verbatim to the prepare
            // route; composeTx assembles them into one Payment Intent. The
            // shape is `{ steps: [{ toolName, input }] }` (type:'bundle' set
            // by the sponsoredTransaction helper). All-succeed-or-all-revert
            // is guaranteed on-chain by Sui Programmable Tx semantics.
            return sponsoredTransaction('bundle', { steps });
          },

          async payService({ serviceId, fields, url, rawBody }) {
            const prepareHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
            };
            if (jwt) {
              prepareHeaders['x-zklogin-jwt'] = jwt;
            }

            const preparePayload = serviceId
              ? { serviceId, fields, address }
              : { url, rawBody, address };

            const prepareRes = await fetch('/api/services/prepare', {
              method: 'POST',
              headers: prepareHeaders,
              body: JSON.stringify(preparePayload),
            });

            if (!prepareRes.ok) {
              const err = (await prepareRes.json().catch(() => ({}))) as Record<string, unknown>;
              // [SPEC 26 P5.2 / 2026-05-13] Mirror the SettleNoDeliveryError
              // throw from the complete-response branch below. The prepare
              // route now classifies the gateway's 402 settle-no-delivery
              // response BEFORE attempting the mppx Challenge parse and
              // returns the same shape (`paymentConfirmed: false` +
              // `settleVerdict` + `settleReason`). Without this branch the
              // settle metadata is dropped on the floor at the prepare
              // boundary, the LLM sees a generic "challenge could not be
              // parsed" error, and D-8 retry decisions become vibes-based.
              //
              // For prepare-side settle-no-delivery `paymentDigest` is
              // always null because no on-chain transfer has happened yet —
              // unlike the complete-side equivalent where the Sui transfer
              // already settled and the digest is the bookkeeping handle for
              // the deferred refund(digest) flow.
              if (
                prepareRes.status === 402 &&
                err.paymentConfirmed === false &&
                typeof err.settleVerdict === 'string'
              ) {
                throw new SettleNoDeliveryError(
                  typeof err.error === 'string' ? err.error : 'Upstream rejected; no charge.',
                  err.settleVerdict,
                  typeof err.settleReason === 'string' ? err.settleReason : 'unknown',
                  typeof err.paymentDigest === 'string' ? err.paymentDigest : null,
                );
              }
              throw new Error(typeof err.error === 'string' ? err.error : 'Failed to prepare service payment');
            }

            const prepareData = await prepareRes.json();

            if (prepareData.success && !prepareData.bytes) {
              return prepareData;
            }

            const { bytes, digest, meta } = prepareData;

            const txBytes = Uint8Array.from(atob(bytes), c => c.charCodeAt(0));
            const { signature } = await signer.signTransaction(txBytes);

            const completeRes = await fetch('/api/services/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ signature, digest, meta }),
            });

            if (!completeRes.ok) {
              const err = await completeRes.json();
              // [SPEC 26 P5 review remediation / 2026-05-13] If audric's
              // services/complete classified the gateway response as
              // settle-no-delivery (`paymentConfirmed: false` + `serviceStatus:
              // 402` + a `settleVerdict` field), throw the typed error so
              // executeToolAction can preserve verdict + reason for the LLM
              // (D-8 prompt depends on settleReason for retry decisions).
              // Order matters: this branch runs BEFORE the legacy
              // `paymentConfirmed: true` branch so the discriminator can never
              // collide.
              if (
                completeRes.status === 402 &&
                err.paymentConfirmed === false &&
                typeof err.settleVerdict === 'string'
              ) {
                throw new SettleNoDeliveryError(
                  err.error ?? 'Upstream rejected; no charge.',
                  err.settleVerdict,
                  typeof err.settleReason === 'string' ? err.settleReason : 'unknown',
                  typeof err.paymentDigest === 'string' ? err.paymentDigest : null,
                );
              }
              if (err.paymentConfirmed && err.paymentDigest) {
                throw new ServiceDeliveryError(
                  err.error ?? 'Service delivery failed after payment',
                  err.paymentDigest,
                  err.meta ?? meta,
                );
              }
              throw new Error(err.error ?? 'Service execution failed');
            }

            return completeRes.json();
          },

          async retryServiceDelivery(paymentDigest, meta) {
            const retryRes = await fetch('/api/services/retry', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paymentDigest, meta }),
            });

            if (!retryRes.ok) {
              const err = await retryRes.json();
              if (err.paymentConfirmed && err.paymentDigest) {
                throw new ServiceDeliveryError(
                  err.error ?? 'Service delivery retry failed',
                  err.paymentDigest,
                  err.meta ?? meta,
                );
              }
              throw new Error(err.error ?? 'Service retry failed');
            }

            return retryRes.json();
          },
        };
      },
    };
  }, [session, status]);

  return {
    agent,
    loading: status === 'loading',
    authenticated: status === 'authenticated',
    address: session?.address ?? null,
  };
}
