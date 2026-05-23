/**
 * sponsoredTx — client-side orchestrator for ALL sponsored-tx writes.
 *
 * Phase 4 generalization of Phase 3's `sponsoredSave`. One function
 * dispatches every sponsored write type (save, withdraw, borrow,
 * repay, send, swap, claim-rewards, harvest) through the same
 * prepare → sign → execute round-trip. [S.277 — 2026-05-23] Volo
 * stake / unstake removed (engine 2.18.0 "Earns Its Keep" cut):
 *
 *  1. POST `/api/transactions/prepare` with `{ type, address, ...params }`
 *     + the user's JWT in the `x-zklogin-jwt` header. Server builds
 *     the PTB via `@t2000/sdk` `composeTx`, applies the appropriate
 *     fee hook (save / borrow) or overlay fee (swap / harvest), and
 *     sponsors the tx via Enoki. Returns `{ bytes, digest }`.
 *  2. Decode base64 bytes, sign locally via `ZkLoginSigner.signTransaction`
 *     (browser-only signer from `@t2000/sdk/browser`).
 *  3. POST `/api/transactions/execute` with `{ digest, signature }`.
 *     Server forwards to Enoki for co-sign + chain submission and
 *     waits for checkpoint settlement.
 *
 * [S.243 / V07E_CONTACTS_SIMPLIFICATION Path A — 2026-05-22]
 * Pre-S.243, `save_contact` was the one non-on-chain write
 * (Prisma-only upsert via `/api/contacts/save`). Contacts deleted
 * entirely; web-v2 now has zero non-sponsored write paths.
 *
 * [S.245 / V07E_D_QUESTION_AUDITS D-2 reframe — 2026-05-22]
 * `pay_api` deleted from engine entirely. apps/web dies en bloc in
 * v0.7e Phase 5. pay_api returns as a Commerce primitive in Audric
 * Store SPEC (clean-slate redesign, not a port).
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 4 — Mechanical write
 * tool migration"; legacy reference: audric/apps/web/hooks/useAgent.ts
 * L245-326 `sponsoredTransaction` + `apps/web/app/api/transactions/
 * prepare/route.ts` L185-264 dispatcher.
 */

import type { SupportedAsset } from "@t2000/sdk";
import { deserializeKeypair, type ZkLoginSession } from "@/lib/zklogin";

/**
 * Discriminated union covering every sponsored-tx write the Phase 4
 * dispatcher handles. The `type` strings match the legacy prepare
 * route's `SingleTxType` values verbatim so the audric/web prepare
 * route's input handling can be ported byte-compatibly into web-v2.
 *
 * Phase 5e (2026-05-19): adds `type: 'bundle'` for multi-write atomic
 * Payment Intents. The bundle variant carries a `steps[]` array of
 * `{toolName, input}` entries which the prepare-route forwards
 * verbatim to `composeTx({steps})` — same on-chain atomicity legacy
 * audric/web relies on (all-succeed-or-all-revert via Sui PTB).
 */
export type SponsoredTxBundleStep = {
  /**
   * Engine WRITE_TOOLS tool name. Mirrors the SDK's
   * `WriteStep.toolName` union exactly (single source of truth).
   * `save_contact` removed entirely from web-v2 per S.243.
   * `pay_api` removed from engine entirely per S.245.
   */
  toolName:
    | "save_deposit"
    | "withdraw"
    | "borrow"
    | "repay_debt"
    | "send_transfer"
    | "swap_execute"
    | "claim_rewards"
    | "harvest_rewards";
  /**
   * Tool input as the engine tool's input schema expects (matches
   * `WriteStep.input` shape). Passed verbatim to the prepare-route.
   */
  input: Record<string, unknown>;
};

export type SponsoredTxRequest =
  | {
      type: "save";
      amount: number;
      asset?: "USDC" | "USDsui";
    }
  | {
      type: "withdraw";
      amount: number;
      asset?: "USDC" | "USDsui";
    }
  | {
      type: "borrow";
      amount: number;
      asset?: "USDC" | "USDsui";
    }
  | {
      type: "repay";
      amount: number;
      asset?: "USDC" | "USDsui";
    }
  | {
      // [S.264 — 2026-05-23] `asset` widened from "USDC"-only to every
      // SDK-supported asset. Pre-fix the chat client hardcoded
      // `asset: "USDC"` here regardless of LLM intent, so a
      // `send_transfer({ asset: "SUI" })` silently shipped USDC. The
      // SDK's `composeTx.send_transfer` already handles all 9 assets
      // (USDC, USDsui, SUI, USDT, USDe, WAL, ETH, NAVX, GOLD) via
      // `OPERATION_ASSETS.send: '*'`; widening the type here closes
      // the audric-side leak.
      type: "send";
      amount: number;
      recipient: string;
      asset?: SupportedAsset;
    }
  | {
      type: "swap";
      amount: number;
      from: string;
      to: string;
      slippage?: number;
      byAmountIn?: boolean;
    }
  | {
      type: "claim-rewards";
    }
  | {
      type: "harvest";
      slippage?: number;
      minRewardUsd?: number;
    }
  | {
      type: "bundle";
      /**
       * Multi-write atomic Payment Intent. 2–4 steps (engine
       * MAX_BUNDLE_OPS = 4). The prepare-route forwards `steps`
       * verbatim to `composeTx({steps})` which assembles one PTB;
       * Sui's on-chain semantics enforce all-succeed-or-all-revert.
       */
      steps: SponsoredTxBundleStep[];
    };

/**
 * [Smoke 2026-05-22 harvest-plan-threading] Mirror of apps/web's
 * `HarvestPlanLite` (hooks/useAgent.ts L124-129). Only harvest_rewards
 * populates this — it's the per-leg breakdown computed by `composeTx`
 * at sponsor time (claimed[] / swaps[] / skipped[] /
 * expectedUsdcDeposited). The audric chat client merges it into the
 * resume tool_result so:
 *   - The TransactionReceiptCard renders the actual harvest breakdown
 *     ("Claimed 0.0077 vSUI → swap → ~$0.009 USDC deposited") instead
 *     of falling into the "No rewards available" empty state.
 *   - The LLM has truthful per-leg data to narrate, not session-context
 *     guesses about dust floors that may not apply (priceCache might
 *     not know vSUI's USD value, in which case the dust filter doesn't
 *     fire and the swap proceeds regardless of the $0.01 default).
 */
export interface HarvestPlanLite {
  claimed: Array<{
    symbol?: string;
    amount: number;
    estimatedValueUsd?: number;
  }>;
  expectedUsdcDeposited: number;
  skipped: Array<{
    symbol?: string;
    amount: number;
    reason: "untradeable" | "dust" | "no-route";
  }>;
  swaps: Array<{
    fromSymbol: string;
    inputAmount: number;
    expectedOutputUsdc: number;
  }>;
}

export interface SponsoredTxResult {
  balanceChanges: Array<{
    coinType: string;
    amount: string;
    owner?: unknown;
  }>;
  digest: string;
  /**
   * Set only for harvest_rewards. Threaded from prepare → execute →
   * client so the receipt card and the LLM narration both see the
   * per-leg breakdown. See `HarvestPlanLite` doc above.
   */
  harvestPlan?: HarvestPlanLite;
  objectChanges?: unknown;
}

export class SponsoredTxError extends Error {
  readonly stage: "prepare" | "sign" | "execute";
  readonly httpStatus?: number;

  constructor(
    stage: "prepare" | "sign" | "execute",
    message: string,
    httpStatus?: number
  ) {
    super(message);
    this.name = "SponsoredTxError";
    this.stage = stage;
    this.httpStatus = httpStatus;
  }
}

/**
 * Map the discriminated input → the flat JSON body the prepare route
 * expects. Centralizes the few type-specific shape transforms (e.g.
 * `claim-rewards` adds `amount: 0`; `harvest` adds `amount: 0`) so
 * the rest of the orchestrator stays generic.
 */
function buildPrepareBody(
  req: SponsoredTxRequest,
  address: string
): Record<string, unknown> {
  const base = { type: req.type, address };
  switch (req.type) {
    case "save":
    case "withdraw":
    case "borrow":
    case "repay":
      return {
        ...base,
        amount: req.amount,
        ...(req.asset ? { asset: req.asset } : {}),
      };
    case "send":
      return {
        ...base,
        amount: req.amount,
        recipient: req.recipient,
        ...(req.asset ? { asset: req.asset } : {}),
      };
    case "swap":
      return {
        ...base,
        amount: req.amount,
        from: req.from,
        to: req.to,
        ...(req.slippage === undefined ? {} : { slippage: req.slippage }),
        ...(req.byAmountIn === undefined ? {} : { byAmountIn: req.byAmountIn }),
      };
    case "claim-rewards":
      // Legacy prepare expects `amount: 0` placeholder for amount-less
      // tools so the shared `SingleBuildRequest` schema validation
      // passes uniformly.
      return { ...base, amount: 0 };
    case "harvest":
      return {
        ...base,
        amount: 0,
        ...(req.slippage === undefined ? {} : { slippage: req.slippage }),
        ...(req.minRewardUsd === undefined
          ? {}
          : { minRewardUsd: req.minRewardUsd }),
      };
    case "bundle":
      // [Phase 5e] Pass `steps[]` verbatim — prepare-route validates the
      // structure via `bundleSchema` and forwards to `composeTx({steps})`.
      return { ...base, steps: req.steps };
    default:
      throw new Error(
        `Unhandled sponsoredTx type: ${(req as { type: string }).type}`
      );
  }
}

/**
 * Run a complete sponsored transaction round-trip. Caller-friendly
 * signature: one call, one result, typed errors per stage so the
 * UI can show specific failure messages.
 */
export async function sponsoredTx(
  request: SponsoredTxRequest & { session: ZkLoginSession }
): Promise<SponsoredTxResult> {
  const { session, ...req } = request;
  const body = buildPrepareBody(req, session.address);

  // --- 1. Prepare: server builds + sponsors the tx ---
  let prepareRes: Response;
  try {
    prepareRes = await fetch("/api/transactions/prepare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-zklogin-jwt": session.jwt,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new SponsoredTxError(
      "prepare",
      `Network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!prepareRes.ok) {
    const payload = (await prepareRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new SponsoredTxError(
      "prepare",
      payload.error ?? `Prepare failed (${prepareRes.status})`,
      prepareRes.status
    );
  }

  const { bytes, digest, harvestPlan } = (await prepareRes.json()) as {
    bytes: string;
    digest: string;
    harvestPlan?: HarvestPlanLite;
  };

  // --- 2. Sign locally with zkLogin ephemeral key + ZK proof ---
  let signature: string;
  try {
    const { ZkLoginSigner } = (await import("@t2000/sdk/browser")) as {
      ZkLoginSigner: new (
        ephemeralKeypair: ReturnType<typeof deserializeKeypair>,
        proof: ZkLoginSession["proof"],
        address: string,
        maxEpoch: number
      ) => {
        signTransaction: (
          txBytes: Uint8Array
        ) => Promise<{ signature: string }>;
      };
    };

    const ephemeralKeypair = deserializeKeypair(session.ephemeralKeyPair);
    const signer = new ZkLoginSigner(
      ephemeralKeypair,
      session.proof,
      session.address,
      session.maxEpoch
    );

    const txBytes = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));
    const result = await signer.signTransaction(txBytes);
    signature = result.signature;
  } catch (err) {
    throw new SponsoredTxError(
      "sign",
      err instanceof Error ? err.message : String(err)
    );
  }

  // --- 3. Execute: server forwards to Enoki + waits for checkpoint ---
  let executeRes: Response;
  try {
    executeRes = await fetch("/api/transactions/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest, signature }),
    });
  } catch (err) {
    throw new SponsoredTxError(
      "execute",
      `Network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!executeRes.ok) {
    const payload = (await executeRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new SponsoredTxError(
      "execute",
      payload.error ?? `Execute failed (${executeRes.status})`,
      executeRes.status
    );
  }

  const executeResult = (await executeRes.json()) as SponsoredTxResult;
  // Merge the prepare-side harvestPlan onto the execute result. The
  // execute route only knows about the on-chain digest + balanceChanges;
  // the per-leg plan was computed by composeTx at prepare time and lives
  // there. The merge happens here so callers always see the full result
  // shape regardless of which type was requested.
  return {
    ...executeResult,
    ...(harvestPlan ? { harvestPlan } : {}),
  };
}
