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
  swap(params: { from: string; to: string; amount: number; slippage?: number; byAmountIn?: boolean }): Promise<TxResult>;
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
            const err = await prepareRes.json().catch(() => ({}));
            throw new Error(`[PREPARE_${prepareRes.status}] ${(err as Record<string, string>).error ?? 'Unknown prepare error'}`);
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
            const err = await executeRes.json().catch(() => ({}));
            throw new Error(`[EXECUTE_${executeRes.status}] ${(err as Record<string, string>).error ?? 'Unknown execute error'}`);
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

          async swap({ from, to, amount, slippage, byAmountIn }) {
            return sponsoredTransaction('swap', { amount, from, to, slippage, byAmountIn });
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
              const err = await prepareRes.json();
              throw new Error(err.error ?? 'Failed to prepare service payment');
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
