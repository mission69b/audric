/**
 * POST /api/transactions/prepare — Phase 4 (9 sponsored writes)
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 3 → Phase 4 widening) ---
 *
 * Phase 3 (S.175) shipped the `save_deposit` canary through this route.
 * Phase 4 widens the dispatcher to cover every sponsored-tx write:
 *
 *   save, withdraw, borrow, repay, send, swap, claim-rewards,
 *   harvest, volo-stake, volo-unstake
 *
 * [S.243 — 2026-05-22] `save_contact` removed entirely from web-v2 per
 * V07E_CONTACTS_SIMPLIFICATION Path A. Pre-S.243 it was a Prisma-only
 * write that flowed through `/api/contacts/save` (deleted).
 *
 * [S.245 — 2026-05-22] `pay_api` deleted from engine entirely per
 * V07E_D_QUESTION_AUDITS D-2 reframe. apps/web dies en bloc in v0.7e
 * Phase 5; pay_api returns as a Commerce primitive in Audric Store SPEC.
 *
 * The route's job per the legacy audric/web sponsored-tx contract:
 *
 *   1. Auth gate (zkLogin JWT → wallet address; ownership binding via
 *      `body.address === walletAddress`).
 *   2. Per-type body validation via discriminated Zod union.
 *   3. `buildWriteStep(body)` → `WriteStep` (the SDK's canonical shape).
 *   4. `composeTx` with type-appropriate hooks:
 *      - `feeHooks.save_deposit` (10 bps) when type is `save` OR
 *        `harvest` (harvest's deposit leg uses save_deposit).
 *      - `feeHooks.borrow` (5 bps) when type is `borrow`.
 *      - `overlayFee: { rate: OVERLAY_FEE_RATE, receiver: T2000_OVERLAY_FEE_WALLET }`
 *        when type is `swap` OR `harvest` (Cetus swap legs).
 *   5. Post-compose validation for `claim-rewards` (empty rewards → 400)
 *      and `harvest` (empty claimed → 400) so the user doesn't burn
 *      gas on a no-op claim.
 *   6. Enoki sponsor with `allowedMoveCallTargets` + `allowedAddresses`
 *      (the `composeTx` result includes `derivedAllowedAddresses` —
 *      transferObjects recipients auto-discovered).
 *   7. Return `{ bytes, digest }` for client-side zkLogin signing.
 *
 * --- PHASE 5e (2026-05-19) — Bundle support landed. ---
 *
 * Bundle support (`type: 'bundle'`) added. Multi-write atomic Payment
 * Intents now route through the same Enoki sponsor flow as singles —
 * `composeTx` natively accepts `steps: WriteStep[]` (PTB with N
 * operations) and per-step `feeHooks` fire transparently for each
 * matching step. Bundle is invariant: all-succeed-or-all-revert via
 * Sui's PTB semantics — same on-chain atomicity legacy `apps/web`
 * relies on. See `lib/audric/sponsored-tx.ts` for the client dispatch
 * shape + `app/(chat)/api/audric-chat/route.ts` for the chat-route
 * bundle marker (the engine `composeBundleFromToolResults` helper
 * stays the canonical bundle composer; the chat route calls it
 * verbatim at step-boundary buffering).
 *
 * --- WHAT WE INTENTIONALLY DO NOT PORT (deferred) ---
 *
 *   - Rate-limit (`@/lib/rate-limit`) — Phase 5+ defense-in-depth
 *     pass-through. web-v2 is single-user-per-session per zkLogin
 *     session anyway; lower priority than legacy multi-tab flows.
 *   - Balance pre-validation (`validateBalance`) — engine preflight +
 *     guards already reject impossible writes before LLM emits the
 *     tool call. Phase 5 may re-add as a server-side safety net.
 *   - Cetus route forwarding (`precomputedRoute`) — Phase 5 perf
 *     optimization. Without it, `addSwapToTx` does its own route
 *     discovery, ~150ms slower but identical correctness.
 *   - Harvest plan stash (legacy `harvestPlan` response field) —
 *     Phase 5 with the broader narration polish.
 *   - Compose-error / Enoki-error metrics surfaces (legacy
 *     `emitPrepareDuration`, `emitEnokiSponsorDuration`, etc.).
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 4 — Mechanical write
 * tool migration"; legacy reference: audric/apps/web/app/api/
 * transactions/prepare/route.ts L185-264 (`buildStepFromRequest`)
 * + L545-630 (`buildAndSponsor`).
 */

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { toBase64 } from "@mysten/sui/utils";
import {
  addFeeTransfer,
  assertAllowedAsset,
  BORROW_FEE_BPS,
  composeTx,
  OVERLAY_FEE_RATE,
  SAVE_FEE_BPS,
  SUPPORTED_ASSETS,
  type SupportedAsset,
  T2000_OVERLAY_FEE_WALLET,
  type WriteStep,
} from "@t2000/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { extractMoveCallTargets } from "@/lib/audric/extract-move-call-targets";
import { redactAddressesInText, redactPII } from "@/lib/audric/log-redact";
import { getCurrentUser } from "@/lib/audric-auth";
import { env } from "@/lib/env";
import { getSuiRpcUrl } from "@/lib/sui-rpc";
import { resolveSuinsCached } from "@/lib/suins-cache";

export const maxDuration = 30;

const ENOKI_BASE = "https://api.enoki.mystenlabs.com/v1";

// ---------------------------------------------------------------------------
// Body schema — discriminated union per `type`. Each branch validates only
// the fields its type needs. Legacy validation patterns preserved.
// ---------------------------------------------------------------------------

const addressField = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "address must be a 0x-prefixed 32-byte hex");

// [Smoke 2026-05-22 send-with-suins] The system prompt promises
// "the SDK resolves handles / SuiNS to canonical addresses" (see
// `lib/audric/system-prompt.ts` L322), but pre-fix the recipient
// field demanded strict 0x hex — passing `to: "funkii.sui"` got
// rejected at this Zod gate as "Invalid request body" before any
// resolver ran. The LLM then burned 2 failed permission cards before
// learning to pre-resolve with `resolve_suins`. This polymorphic
// field accepts the three forms the prompt promises:
//   - 0x hex (no resolution needed, passes through)
//   - `.sui` SuiNS name (`funkii.sui`, `team.alex.sui`)
//   - `@audric` Audric handle (`alice@audric`) — narration form,
//     converted to `alice.audric.sui` before SuiNS RPC lookup
// The POST handler runs the actual resolution between this validation
// gate and `buildWriteStep` so the SDK always receives canonical hex.
const recipientField = z.union([
  addressField,
  z
    .string()
    .regex(
      /^[a-z0-9-]+(\.[a-z0-9-]+)*\.sui$/i,
      "must be a SuiNS name like alex.sui"
    ),
  z
    .string()
    .regex(
      /^[a-z0-9-]+@audric$/i,
      "must be an Audric handle like alice@audric"
    ),
]);

const stableAsset = z.enum(["USDC", "USDsui"]);
// [S.264 — 2026-05-23] `send` accepts every SDK-supported asset, not
// just USDC. Pre-fix this gate was `z.enum(["USDC"])` which would have
// caught the bug if Layer 1 (audric-chat-client.tsx) hadn't already
// silently coerced the LLM's `asset: "SUI"` to `"USDC"`. We derive
// from `SUPPORTED_ASSETS` keys (single source of truth) so this stays
// in sync if the SDK ever adds a 10th asset — same pattern the engine
// uses for `ALL_NAVI_ASSETS = Object.keys(SUPPORTED_ASSETS)`. The
// runtime check matches `OPERATION_ASSETS.send: '*'` in SDK constants
// (the SDK's own allow-list); type stays strict via the cast.
const SUPPORTED_ASSET_KEYS = Object.keys(SUPPORTED_ASSETS) as [
  SupportedAsset,
  ...SupportedAsset[],
];
const anySupportedAsset = z.enum(SUPPORTED_ASSET_KEYS);
const positiveAmount = z.number().positive("amount must be > 0").finite();
const nonNegativeAmount = z.number().min(0).finite();

const saveSchema = z.object({
  type: z.literal("save"),
  address: addressField,
  amount: positiveAmount,
  asset: stableAsset.optional(),
});
const withdrawSchema = z.object({
  type: z.literal("withdraw"),
  address: addressField,
  amount: positiveAmount,
  asset: stableAsset.optional(),
});
const borrowSchema = z.object({
  type: z.literal("borrow"),
  address: addressField,
  amount: positiveAmount,
  asset: stableAsset.optional(),
});
const repaySchema = z.object({
  type: z.literal("repay"),
  address: addressField,
  amount: positiveAmount,
  asset: stableAsset.optional(),
});
const sendSchema = z.object({
  type: z.literal("send"),
  address: addressField,
  amount: positiveAmount,
  recipient: recipientField,
  asset: anySupportedAsset.optional(),
});
const swapSchema = z.object({
  type: z.literal("swap"),
  address: addressField,
  amount: positiveAmount,
  from: z.string().min(1),
  to: z.string().min(1),
  slippage: z.number().positive().max(0.5).optional(),
  byAmountIn: z.boolean().optional(),
});
const claimRewardsSchema = z.object({
  type: z.literal("claim-rewards"),
  address: addressField,
  // Legacy convention: clients send `amount: 0` as a placeholder for
  // amount-less tools. Allow but don't require it.
  amount: nonNegativeAmount.optional(),
});
const harvestSchema = z.object({
  type: z.literal("harvest"),
  address: addressField,
  amount: nonNegativeAmount.optional(),
  slippage: z.number().positive().max(0.5).optional(),
  minRewardUsd: nonNegativeAmount.optional(),
});
const voloStakeSchema = z.object({
  type: z.literal("volo-stake"),
  address: addressField,
  amount: positiveAmount,
});
const voloUnstakeSchema = z.object({
  type: z.literal("volo-unstake"),
  address: addressField,
  // `amount === 0` means unstake-all (legacy convention preserved).
  amount: nonNegativeAmount,
});

// ─── Phase 5e: multi-write atomic Payment Intent ─────────────────────────
//
// Each bundle step is `{toolName, input}` — the same shape the SDK's
// `composeTx({steps})` accepts. Bundle step `toolName`s mirror the SDK's
// `WriteStep.toolName` union exactly (single source of truth there).
// Per-step input validation is intentionally light at this layer: the
// engine's preflight already rejected impossible writes before the LLM
// emitted the tool call, and `composeTx` itself throws on malformed inputs
// (e.g. invalid recipient address, unknown asset). Mirroring single-write
// schemas per-step would duplicate ~80 LoC of validation that fires nowhere.
const bundleStepSchema = z.object({
  toolName: z.enum([
    "save_deposit",
    "withdraw",
    "borrow",
    "repay_debt",
    "send_transfer",
    "swap_execute",
    "claim_rewards",
    "harvest_rewards",
    "volo_stake",
    "volo_unstake",
  ]),
  input: z.record(z.unknown()),
});
const bundleSchema = z.object({
  type: z.literal("bundle"),
  address: addressField,
  // [SPEC 7 v0.4 Layer 2] Bundles cap at 4 ops (MAX_BUNDLE_OPS in engine
  // `compose-bundle.ts`). The engine helper enforces the cap before
  // emitting `steps[]`; we re-enforce here as defense-in-depth against a
  // malformed client request that bypasses the chat route's marker path.
  steps: z.array(bundleStepSchema).min(2).max(4),
});

const prepareBodySchema = z.discriminatedUnion("type", [
  saveSchema,
  withdrawSchema,
  borrowSchema,
  repaySchema,
  sendSchema,
  swapSchema,
  claimRewardsSchema,
  harvestSchema,
  voloStakeSchema,
  voloUnstakeSchema,
  bundleSchema,
]);

type PrepareBody = z.infer<typeof prepareBodySchema>;
type BundleBody = z.infer<typeof bundleSchema>;

// ---------------------------------------------------------------------------
// Dispatch helpers
// ---------------------------------------------------------------------------

const SUI_ADDRESS_STRICT_REGEX = /^0x[a-fA-F0-9]{64}$/;
const AUDRIC_HANDLE_REGEX = /^([a-z0-9-]+)@audric$/i;

/**
 * Resolve a recipient input (hex / `.sui` / `@audric`) to canonical hex.
 *
 * **Why this exists.** The system prompt at `lib/audric/system-prompt.ts`
 * L322 promises the LLM: *"The SDK resolves handles / SuiNS to canonical
 * addresses. Do NOT manually look up and re-type the underlying 0x
 * address."* Pre-fix, the recipient field's Zod schema rejected anything
 * non-hex with `400 Invalid request body`, so the LLM's natural call
 * `send_transfer({ to: "funkii.sui" })` failed twice before it learned to
 * pre-resolve via `resolve_suins`. The user saw two failed permission
 * cards for one send. This helper closes the contract gap by actually
 * doing the resolution the prompt promised.
 *
 * **Cache-aware:** uses `resolveSuinsCached` (5min positive / 10sec
 * negative TTL) so repeat sends to the same recipient are RPC-free.
 *
 * **Audric handle normalization:** `alice@audric` is the user-facing
 * narration form; the on-chain SuiNS leaf is `alice.audric.sui`. The
 * convention is documented in `lib/audric/system-prompt.ts` L370.
 */
async function resolveRecipient(raw: string): Promise<string> {
  if (SUI_ADDRESS_STRICT_REGEX.test(raw)) {
    return raw.toLowerCase();
  }
  const audricMatch = raw.match(AUDRIC_HANDLE_REGEX);
  const suinsName = audricMatch
    ? `${audricMatch[1]?.toLowerCase()}.audric.sui`
    : raw.toLowerCase();
  const resolved = await resolveSuinsCached(suinsName, {
    suiRpcUrl: getSuiRpcUrl(),
  });
  if (!resolved) {
    throw new Error(
      `"${raw}" isn't a registered SuiNS name or Audric handle — double-check the spelling, or paste the full 0x address.`
    );
  }
  return resolved.toLowerCase();
}

/**
 * Mirror of legacy `buildStepFromRequest` (prepare/route.ts L185-264).
 * The `type` strings come from the body schema's discriminator and
 * the tool names come from `@t2000/sdk` `WriteStep.toolName`. Pre-step
 * validation (e.g. `assertAllowedAsset`) runs here so a 400 surfaces
 * before `composeTx` is called.
 */
function buildWriteStep(body: PrepareBody): WriteStep {
  switch (body.type) {
    case "save":
      assertAllowedAsset("save", body.asset);
      return {
        toolName: "save_deposit",
        input: { amount: body.amount, asset: body.asset ?? "USDC" },
      };
    case "withdraw":
      return {
        toolName: "withdraw",
        input: { amount: body.amount, asset: body.asset ?? "USDC" },
      };
    case "borrow":
      assertAllowedAsset("borrow", body.asset);
      return {
        toolName: "borrow",
        input: { amount: body.amount, asset: body.asset ?? "USDC" },
      };
    case "repay":
      return {
        toolName: "repay_debt",
        input: { amount: body.amount, asset: body.asset ?? "USDC" },
      };
    case "send":
      return {
        toolName: "send_transfer",
        input: {
          to: body.recipient,
          amount: body.amount,
          asset: (body.asset ?? "USDC") as SupportedAsset,
        },
      };
    case "swap":
      return {
        toolName: "swap_execute",
        input: {
          from: body.from,
          to: body.to,
          amount: body.amount,
          ...(body.slippage === undefined ? {} : { slippage: body.slippage }),
          ...(body.byAmountIn === undefined
            ? {}
            : { byAmountIn: body.byAmountIn }),
        },
      };
    case "claim-rewards":
      return { toolName: "claim_rewards", input: {} };
    case "harvest":
      return {
        toolName: "harvest_rewards",
        input: {
          ...(body.slippage === undefined ? {} : { slippage: body.slippage }),
          ...(body.minRewardUsd === undefined
            ? {}
            : { minRewardUsd: body.minRewardUsd }),
        },
      };
    case "volo-stake":
      return {
        toolName: "volo_stake",
        input: { amountSui: body.amount },
      };
    case "volo-unstake":
      return {
        toolName: "volo_unstake",
        input: { amountVSui: body.amount > 0 ? body.amount : "all" },
      };
    default:
      throw new Error(
        `Unhandled prepare type: ${(body as { type: string }).type}`
      );
  }
}

/**
 * Returns true when the type's PTB includes a Cetus swap leg that
 * needs the overlay-fee wired through. Currently `swap` (direct user
 * swap) and `harvest` (compound: claim → swap → save).
 *
 * Phase 5e: bundles are checked separately via `bundleNeedsOverlayFee`
 * because a bundle is a heterogeneous PTB whose overlay-fee requirement
 * depends on any contained swap_execute / harvest step.
 */
function needsOverlayFee(type: PrepareBody["type"]): boolean {
  return type === "swap" || type === "harvest";
}

/**
 * [Phase 5e] Returns true when ANY bundle step is a swap leg
 * (`swap_execute` / `harvest_rewards`) — the overlay fee must wire
 * through the same composed PTB so the Cetus appender splits the
 * fee proportionally on each contained swap. composeTx itself doesn't
 * inspect per-step necessity; it applies overlayFee globally when set,
 * and the SDK's `addSwapToTx` is the only consumer (no-op for non-swap
 * steps). Safe to set on any bundle that contains at least one swap.
 */
function bundleNeedsOverlayFee(body: BundleBody): boolean {
  return body.steps.some(
    (s) => s.toolName === "swap_execute" || s.toolName === "harvest_rewards"
  );
}

/**
 * [Phase 5e] Map bundle steps to the SDK's `WriteStep[]`. The shape is
 * already correct (`{toolName, input}` mirrors WriteStep) — this is a
 * structural pass-through cast that lets the SDK's discriminated
 * `composeTx` step typing take over from here.
 */
function buildBundleSteps(body: BundleBody): WriteStep[] {
  return body.steps.map((s) => ({
    toolName: s.toolName,
    input: s.input,
  })) as WriteStep[];
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 1. Auth gate.
  const session = await getCurrentUser();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  const walletAddress = session.user.id;
  const jwt = request.headers.get("x-zklogin-jwt");

  // 2. Parse + validate body.
  let body: PrepareBody;
  try {
    const json = await request.json();
    body = prepareBodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  // 3. Ownership binding.
  if (body.address !== walletAddress) {
    return NextResponse.json(
      { error: "address does not match authenticated session" },
      { status: 403 }
    );
  }

  // 3.5. [Smoke 2026-05-22 send-with-suins] Resolve `send` recipients
  // that arrived as SuiNS names / `@audric` handles to canonical hex
  // BEFORE buildWriteStep hands the step to the SDK. The Zod gate
  // above accepts these polymorphic forms; the SDK below always
  // wants a 0x address. See `resolveRecipient` doc for the contract.
  //
  // [S.263 — 2026-05-23] Bundle steps containing send_transfer get the
  // SAME treatment. Pre-S.263 the comment here claimed "engine-side
  // bundle composition already resolves before stamping steps[]" — that
  // was wrong. The engine's `compose-bundle.ts` packages the LLM's tool
  // calls into a bundle marker but never resolves SuiNS in the recipient
  // field. Result: `swap → send to alice@audric` bundles failed at
  // `composeTx.send_transfer` (`packages/sdk/src/composeTx.ts:578` calls
  // `validateAddress(input.to)` which is strict-hex). The LLM was forced
  // to retry with progressively-stripped names until it threaded the raw
  // 0x — exactly the multi-card UX the single-send path was patched to
  // avoid. This block extends the existing single-send pattern across
  // both paths so symmetry holds.
  //
  // Architectural rationale (over an SDK-side fix): keeping SuiNS
  // resolution at the application layer preserves the SDK's "thin
  // transaction builder over Sui primitives" contract — composeTx
  // doesn't gain a new failure mode (SuiNS RPC down → can't build), and
  // Audric's brand-specific `@audric` translation stays out of `@t2000/
  // sdk`. CLI's contacts.json legacy path is a separate cleanup tracked
  // in the backlog (S.264 candidate).
  if (body.type === "send") {
    try {
      body = { ...body, recipient: await resolveRecipient(body.recipient) };
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 400 }
      );
    }
  } else if (body.type === "bundle") {
    try {
      const resolvedSteps = await Promise.all(
        body.steps.map(async (step) => {
          if (step.toolName !== "send_transfer") {
            return step;
          }
          const stepInput = step.input as {
            to?: unknown;
            [k: string]: unknown;
          };
          if (typeof stepInput.to !== "string") {
            return step;
          }
          const resolved = await resolveRecipient(stepInput.to);
          return { ...step, input: { ...stepInput, to: resolved } };
        })
      );
      body = { ...body, steps: resolvedSteps };
    } catch (err) {
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        { status: 400 }
      );
    }
  }

  // 4. Build the SDK WriteStep[] — single-write or bundle.
  let steps: WriteStep[];
  try {
    steps =
      body.type === "bundle" ? buildBundleSteps(body) : [buildWriteStep(body)];
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  // 5. Compose the Sui tx.
  const suiClient = new SuiJsonRpcClient({
    url: getSuiRpcUrl(),
    network: env.NEXT_PUBLIC_SUI_NETWORK as
      | "mainnet"
      | "testnet"
      | "devnet"
      | "localnet",
  });

  const wantOverlayFee =
    body.type === "bundle"
      ? bundleNeedsOverlayFee(body)
      : needsOverlayFee(body.type);

  let composed: Awaited<ReturnType<typeof composeTx>>;
  try {
    composed = await composeTx({
      sender: body.address,
      client: suiClient,
      sponsoredContext: true,
      steps,
      ...(wantOverlayFee
        ? {
            overlayFee: {
              rate: OVERLAY_FEE_RATE,
              receiver: T2000_OVERLAY_FEE_WALLET,
            },
          }
        : {}),
      feeHooks: {
        // [v1.24.3 / S.120] 10 bps overlay fee on save_deposit (fires
        // for both top-level saves AND harvest's deposit leg).
        save_deposit: ({ tx, coin, input }) => {
          const asset: SupportedAsset = (input.asset ??
            "USDC") as SupportedAsset;
          const decimals = SUPPORTED_ASSETS[asset].decimals;
          addFeeTransfer(
            tx,
            coin,
            SAVE_FEE_BPS,
            T2000_OVERLAY_FEE_WALLET,
            input.amount,
            decimals
          );
        },
        // 5 bps overlay fee on borrow — split out of the borrowed coin
        // BEFORE the canonical transferObjects finalizes.
        borrow: ({ tx, coin, input }) => {
          const asset: SupportedAsset = (input.asset ??
            "USDC") as SupportedAsset;
          const decimals = SUPPORTED_ASSETS[asset].decimals;
          addFeeTransfer(
            tx,
            coin,
            BORROW_FEE_BPS,
            T2000_OVERLAY_FEE_WALLET,
            input.amount,
            decimals
          );
        },
      },
    });
  } catch (err) {
    // [Phase 5.5 / D-17] Redact embedded addresses from SDK error
    // payloads. composeTx errors can mention sender / recipient
    // addresses in the message (e.g. "no coins for type X owned by
    // 0x…"); pass-through scan keeps non-address detail readable.
    console.error(
      `[prepare] composeTx failed for type=${body.type}:`,
      redactPII(err)
    );
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to assemble transaction",
      },
      { status: 500 }
    );
  }

  // 6. Post-compose validation for amount-less write types where the
  // success criterion isn't visible from the input. Legacy convention:
  // empty rewards → 400 "No rewards available" so the user doesn't
  // burn gas on a no-op.
  //
  // Phase 5e: bundles skip this check. A bundle's amount-less leg (e.g.
  // `harvest_rewards` chained with `swap_execute`) is the LLM's
  // explicit choice — if it produces an empty-rewards no-op, the user
  // sees a failed bundle receipt at execute time, which is the same
  // semantic the single-write check produces. Adding a per-step
  // "is this leg a no-op?" check here would require iterating
  // perStepPreviews + matching toolName + extracting per-step empty
  // states, which the SDK's own compose validation already catches.
  if (body.type === "claim-rewards") {
    const preview = composed.perStepPreviews[0];
    if (preview?.toolName === "claim_rewards" && preview.rewards.length === 0) {
      return NextResponse.json(
        { error: "No rewards available to claim" },
        { status: 400 }
      );
    }
  }

  // [Smoke 2026-05-22 harvest-plan-threading] Capture the harvest plan
  // computed by composeTx (claimed/swaps/skipped/expectedUsdcDeposited)
  // so the response can carry it back to the client. Without this, the
  // tx executes fine but the receipt card sees an empty plan and falls
  // into the "No rewards available" empty state — and the LLM sees only
  // `{tx, balanceChanges}` and hallucinates dust-floor behavior from
  // session context (see smoke trace: model said "below $0.01 floor,
  // transferred to wallet" while savings ticked up ~$0.009 because the
  // swap+deposit ACTUALLY ran). Mirrors `apps/web/app/api/transactions/
  // prepare/route.ts` L638-663 — the canonical pattern.
  let harvestPlan:
    | {
        claimed: unknown;
        swaps: unknown;
        skipped: unknown;
        expectedUsdcDeposited: number;
      }
    | undefined;
  if (body.type === "harvest") {
    const preview = composed.perStepPreviews[0];
    if (preview?.toolName === "harvest_rewards") {
      if (preview.claimed.length === 0) {
        return NextResponse.json(
          { error: "No rewards available to harvest" },
          { status: 400 }
        );
      }
      harvestPlan = {
        claimed: preview.claimed,
        swaps: preview.swaps,
        skipped: preview.skipped,
        expectedUsdcDeposited: preview.expectedUsdcDeposited,
      };
    }
  }

  // 7. Forward to Enoki for sponsorship.
  const sponsorHeaders: Record<string, string> = {
    Authorization: `Bearer ${env.ENOKI_SECRET_KEY}`,
    "Content-Type": "application/json",
  };
  if (jwt) {
    sponsorHeaders["zklogin-jwt"] = jwt;
  }

  const moveCallTargets = extractMoveCallTargets(composed.tx);
  const allowedAddresses = Array.from(
    new Set([...composed.derivedAllowedAddresses, body.address])
  );
  const sponsorBody: Record<string, unknown> = {
    network: env.NEXT_PUBLIC_SUI_NETWORK,
    transactionBlockKindBytes: toBase64(composed.txKindBytes),
    sender: body.address,
    allowedAddresses,
  };
  if (moveCallTargets.length > 0) {
    sponsorBody.allowedMoveCallTargets = moveCallTargets;
  }

  const sponsorRes = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
    method: "POST",
    headers: sponsorHeaders,
    body: JSON.stringify(sponsorBody),
  });

  if (!sponsorRes.ok) {
    const errorBody = await sponsorRes.text().catch(() => "");
    // [Phase 5.5 / D-17] Enoki rejection bodies frequently echo the
    // submitter address ("sender X is not allowed" / "address Y has no
    // gas budget"); scrub before logging.
    console.error(
      `[prepare] Enoki sponsor error (${sponsorRes.status}) type=${body.type}:`,
      redactAddressesInText(errorBody)
    );
    return NextResponse.json(
      { error: parseEnokiError(errorBody, sponsorRes.status) },
      { status: sponsorRes.status }
    );
  }

  const { data } = (await sponsorRes.json()) as {
    data: { bytes: string; digest: string };
  };
  return NextResponse.json({
    bytes: data.bytes,
    digest: data.digest,
    ...(harvestPlan ? { harvestPlan } : {}),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEnokiError(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as {
      errors?: Array<{ message?: string }>;
      message?: string;
    };
    const first =
      parsed.errors?.[0]?.message ??
      parsed.message ??
      `Sponsorship failed (${status})`;
    return first;
  } catch {
    return `Sponsorship failed (${status})`;
  }
}
