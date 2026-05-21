/**
 * sponsoredTx — client-side orchestrator for ALL sponsored-tx writes.
 *
 * Phase 4 generalization of Phase 3's `sponsoredSave`. One function
 * dispatches every sponsored write type (save, withdraw, borrow,
 * repay, send, swap, claim-rewards, harvest, volo-stake,
 * volo-unstake) through the same prepare → sign → execute round-trip:
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
 * `pay_api` is intentionally EXCLUDED from web-v2's tool set
 * (Phase 4b deferral 2026-05-19). The legacy `/api/services/{prepare,
 * complete,retry}` 3-leg flow stays in `apps/web` until the Agentic
 * Commerce spec ships its first phase. See the comment block in
 * `app/(chat)/api/audric-chat/route.ts` near `writeToolsForWebV2`
 * for the full framing.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 4 — Mechanical write
 * tool migration"; legacy reference: audric/apps/web/hooks/useAgent.ts
 * L245-326 `sponsoredTransaction` + `apps/web/app/api/transactions/
 * prepare/route.ts` L185-264 dispatcher.
 */

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
   * `pay_api` is NEVER bundleable (no on-chain leg + not
   * `bundleable: true` in `tool-flags.ts`). `save_contact` removed
   * entirely from web-v2 per S.243.
   */
  toolName:
    | "save_deposit"
    | "withdraw"
    | "borrow"
    | "repay_debt"
    | "send_transfer"
    | "swap_execute"
    | "claim_rewards"
    | "harvest_rewards"
    | "volo_stake"
    | "volo_unstake";
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
      type: "send";
      amount: number;
      recipient: string;
      asset?: "USDC";
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
      type: "volo-stake";
      amount: number;
    }
  | {
      type: "volo-unstake";
      /**
       * `amount > 0` unstakes that exact amount; `amount === 0`
       * unstakes ALL (legacy convention preserved).
       */
      amount: number;
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

export interface SponsoredTxResult {
  balanceChanges: Array<{
    coinType: string;
    amount: string;
    owner?: unknown;
  }>;
  digest: string;
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
    case "volo-stake":
    case "volo-unstake":
      return { ...base, amount: req.amount };
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

  const { bytes, digest } = (await prepareRes.json()) as {
    bytes: string;
    digest: string;
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

  return (await executeRes.json()) as SponsoredTxResult;
}
