import { NextRequest, NextResponse } from 'next/server';
import { toBase64 } from '@mysten/sui/utils';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress, validateAmount } from '@/lib/auth';
import { getClient } from '@/lib/protocol-registry';
import { getPortfolio } from '@/lib/portfolio';
import {
  composeTx,
  addFeeTransfer,
  assertAllowedAsset,
  resolveTokenType,
  getDecimalsForCoinType,
  USDC_TYPE,
  SAVE_FEE_BPS,
  BORROW_FEE_BPS,
  SUPPORTED_ASSETS,
  T2000_OVERLAY_FEE_WALLET,
  type WriteStep,
  type SupportedAsset,
} from '@t2000/sdk';
import { env } from '@/lib/env';
import {
  emitBundleComposeDuration,
  emitBundleOutcome,
  emitSwapComposeDuration,
} from '@/lib/engine/bundle-metrics';
import {
  parseEnokiErrorBody,
  isExpiredSessionError,
  SESSION_EXPIRED_USER_MESSAGE,
  SESSION_EXPIRED_RESPONSE_CODE,
} from '@/lib/enoki-error';

export const runtime = 'nodejs';

const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const OVERLAY_FEE_RATE = 0.001;

// [SIMPLIFICATION DAYS 5+8] On-chain allowance billing is fully retired.
// [SPEC 7 P2.2c, 2026-05-02] Migrated from a fat ~600-line route to a thin
// dispatcher built on @t2000/sdk's `composeTx`. The SDK auto-derives the
// `allowedAddresses` array from the assembled Payment Intent's top-level
// `transferObjects` commands, eliminating the PR-H1/H4 hand-maintained-
// array bug class permanently. Fees stay an Audric concern (CLAUDE.md
// rule #9): we pass `feeHooks` to inline `addFeeTransfer` for USDC saves
// and borrows mid-intent without leaking fee policy into the SDK.
type SingleTxType =
  | 'send'
  | 'save'
  | 'withdraw'
  | 'borrow'
  | 'repay'
  | 'claim-rewards'
  | 'harvest'
  | 'swap'
  | 'volo-stake'
  | 'volo-unstake';

type TxType = SingleTxType | 'bundle';

interface SingleBuildRequest {
  type: SingleTxType;
  address: string;
  amount: number;
  recipient?: string;
  asset?: string;
  fromAsset?: string;
  toAsset?: string;
  protocol?: string;
  from?: string;
  to?: string;
  slippage?: number;
  byAmountIn?: boolean;
  /**
   * [Track B / 2026-05-08] `harvest`-only. USD floor below which rewards
   * skip the swap leg and transfer to wallet instead. Default $0.01.
   */
  minRewardUsd?: number;
}

/**
 * [SPEC 7 P2.4 Layer 3] Multi-write Payment Intent. The engine emits a
 * `pending_action` with `steps[]` when 2+ confirm-tier writes resolve in
 * the same turn and all are `bundleable: true`. Host posts the steps array
 * here verbatim; we forward to `composeTx({ steps })` which compiles them
 * into a single Payment Intent. All-succeed-or-all-revert atomicity is
 * enforced on-chain.
 *
 * Per-step balance validation is skipped — the engine already ran preflight
 * on each step, and the Enoki dry-run is the last line of defense before
 * on-chain. Adding host-side per-step validation would duplicate engine
 * logic without raising the safety floor.
 */
interface BundleBuildRequest {
  type: 'bundle';
  address: string;
  steps: WriteStep[];
}

type BuildRequest = SingleBuildRequest | BundleBuildRequest;

/**
 * Map a host-shaped {@link BuildRequest} to the SDK's typed `WriteStep`.
 * Throws on missing required fields (recipient for send, from/to for swap)
 * — symmetric with the pre-migration switch statement's behavior.
 *
 * `pay_api` and `save_contact` are not `composeTx` tools (see WriteToolName
 * JSDoc) and are routed through `services/prepare` / Prisma respectively;
 * they never reach this route.
 */
function buildStepFromRequest(body: SingleBuildRequest): WriteStep {
  const { type, recipient, amount, asset, from, to, slippage, byAmountIn } = body;
  switch (type) {
    case 'send':
      if (!recipient || !recipient.startsWith('0x')) {
        throw new Error('Invalid recipient');
      }
      return {
        toolName: 'send_transfer',
        input: { to: recipient, amount, asset: (asset ?? 'USDC') as SupportedAsset },
      };
    case 'save':
      assertAllowedAsset('save', asset);
      return {
        toolName: 'save_deposit',
        input: { amount, asset: (asset ?? 'USDC') as 'USDC' | 'USDsui' },
      };
    case 'withdraw':
      return {
        toolName: 'withdraw',
        input: { amount, asset: (body.fromAsset ?? asset ?? 'USDC') as 'USDC' | 'USDsui' },
      };
    case 'borrow':
      assertAllowedAsset('borrow', asset);
      return {
        toolName: 'borrow',
        input: { amount, asset: (asset ?? 'USDC') as 'USDC' | 'USDsui' },
      };
    case 'repay':
      return {
        toolName: 'repay_debt',
        input: { amount, asset: (asset ?? 'USDC') as 'USDC' | 'USDsui' },
      };
    case 'claim-rewards':
      return { toolName: 'claim_rewards', input: {} };
    case 'harvest':
      // [Track B / 2026-05-08] Compound write — claim → swap → save in
      // one PTB. `slippage` and `minRewardUsd` are forwarded to the SDK
      // appender (`addHarvestToTx`); the rest of the harvest plan is
      // derived from on-chain rewards at compose time.
      return {
        toolName: 'harvest_rewards',
        input: {
          ...(slippage !== undefined ? { slippage } : {}),
          ...(body.minRewardUsd !== undefined ? { minRewardUsd: body.minRewardUsd } : {}),
        },
      };
    case 'swap':
      if (!from || !to) throw new Error('from and to tokens are required');
      return {
        toolName: 'swap_execute',
        input: { from, to, amount, slippage, byAmountIn },
      };
    case 'volo-stake':
      return { toolName: 'volo_stake', input: { amountSui: amount } };
    case 'volo-unstake':
      return {
        toolName: 'volo_unstake',
        input: { amountVSui: amount > 0 ? amount : 'all' },
      };
  }
}

/**
 * Server-side balance validation — prevents building transactions that will
 * fail on-chain. Uses canonical `getPortfolio()` for USDC validation (the
 * common path), and a direct `getBalance` only when we need precision
 * against an exact `coinType` that `getPortfolio`'s symbol-aggregated
 * allocations can't disambiguate. Returns an error message string if
 * validation fails, or null if OK.
 */
async function validateBalance(
  type: SingleTxType,
  address: string,
  amount: number,
  body: SingleBuildRequest,
): Promise<string | null> {
  try {
    if (type === 'send' || type === 'save') {
      const sym = body.asset ?? 'USDC';
      const coinType = resolveTokenType(sym) ?? USDC_TYPE;

      if (coinType === USDC_TYPE || sym === 'USDC') {
        const portfolio = await getPortfolio(address);
        const usdc = portfolio.walletAllocations.USDC ?? 0;
        if (amount > usdc + 0.001) {
          return `Insufficient USDC balance: you have ${usdc.toFixed(4)} but requested ${amount}`;
        }
      } else {
        const client = getClient();
        // eslint-disable-next-line no-restricted-properties -- CANONICAL-BYPASS: coin-type-precise balance for tx-build validation
        const bal = await client.getBalance({ owner: address, coinType });
        const decimals = getDecimalsForCoinType(coinType);
        const available = Number(bal.totalBalance) / 10 ** decimals;
        if (amount > available + 0.001) {
          return `Insufficient ${sym} balance: you have ${available.toFixed(4)} but requested ${amount}`;
        }
      }
    } else if (type === 'swap') {
      const fromToken = body.from ?? body.fromAsset ?? 'USDC';
      const coinType = resolveTokenType(fromToken) ?? fromToken;

      if (coinType === USDC_TYPE || fromToken === 'USDC') {
        const portfolio = await getPortfolio(address);
        const usdc = portfolio.walletAllocations.USDC ?? 0;
        if (amount > usdc + 0.001) {
          return `Insufficient USDC balance: you have ${usdc.toFixed(4)} but requested ${amount}`;
        }
      } else {
        const client = getClient();
        // eslint-disable-next-line no-restricted-properties -- CANONICAL-BYPASS: coin-type-precise balance for tx-build validation
        const bal = await client.getBalance({ owner: address, coinType });
        const decimals = getDecimalsForCoinType(coinType);
        const available = Number(bal.totalBalance) / 10 ** decimals;
        if (amount > available + 0.001) {
          return `Insufficient ${fromToken} balance: you have ${available.toFixed(4)} but requested ${amount}`;
        }
      }
    }
  } catch {
    // Balance check failed — let the transaction attempt proceed
  }
  return null;
}

/**
 * POST /api/transactions/prepare
 *
 * 1. Builds a Sui transaction kind server-side via `composeTx`
 * 2. Sponsors it via Enoki (gasless for the user)
 * 3. Returns { bytes, digest } for client-side signing
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: BuildRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, address } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const rl = rateLimit(`tx:${address}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  if (type === 'bundle') {
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return NextResponse.json({ error: 'Bundle requires non-empty steps array' }, { status: 400 });
    }
    if (body.steps.length > 10) {
      return NextResponse.json({ error: 'Bundle exceeds 10-step limit' }, { status: 400 });
    }
    // [SPEC 7 P2.7] Break-glass disable. When the 48h soak metrics show
    // sustained revert_rate > 5%, set PAYMENT_STREAM_DISABLE=1 in Vercel
    // (server-only env, no rebuild needed — flipping takes <30s for the
    // next serverless invocation). Returns 503 so the client surfaces a
    // clean error and the user re-prompts; the LLM emits single-write
    // pending_actions naturally on the next turn (the engine's bundling
    // is purely additive — disabling the bundle path here doesn't break
    // single-step writes).
    //
    // Telemetry: not emitted here on purpose. The break-glass IS the
    // signal — Vercel logs already show the 503; if we emitted a
    // bundle_outcome_count{outcome=...} we'd be double-counting (the
    // user's request never reached composeTx, so neither compose_error
    // nor sponsorship_failed semantically applies).
    if (env.PAYMENT_STREAM_DISABLE === '1' || env.PAYMENT_STREAM_DISABLE === 'true') {
      console.warn('[prepare] Payment Intent disable flag is set — rejecting compiled intent');
      return NextResponse.json(
        {
          error:
            'Payment Intents are temporarily disabled. Please cancel and ask again — I\'ll do these one at a time.',
        },
        { status: 503 },
      );
    }
  } else {
    const { amount, recipient } = body;
    // `harvest` is amount-less for the same reason `claim-rewards` is —
    // the value comes from on-chain pending rewards, not user input.
    const skipAmountCheck =
      type === 'claim-rewards' || type === 'volo-unstake' || type === 'harvest';
    if (!skipAmountCheck && (!amount || amount <= 0)) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }
    if (!skipAmountCheck && type !== 'swap' && type !== 'volo-stake') {
      const amountCheck = validateAmount(type, amount);
      if (!amountCheck.valid) {
        return NextResponse.json({ error: amountCheck.reason }, { status: 400 });
      }
    }
    if (recipient && !isValidSuiAddress(recipient)) {
      return NextResponse.json({ error: 'Invalid recipient address' }, { status: 400 });
    }

    if (!skipAmountCheck && amount > 0) {
      if (type === 'send' && (!recipient || !recipient.startsWith('0x'))) {
        return NextResponse.json({ error: 'Invalid or missing recipient address' }, { status: 400 });
      }
      const balanceError = await validateBalance(type, address, amount, body);
      if (balanceError) {
        return NextResponse.json({ error: balanceError }, { status: 400 });
      }
    }
  }

  try {
    const result = await buildAndSponsor(body, jwt);

    if (!result.ok) {
      if (result.status === 429) {
        return NextResponse.json(
          { error: 'Too many transactions. Please try again shortly.' },
          { status: 429 },
        );
      }
      // [S18-F7] Session-expired carries a `code` so the client can
      // programmatically detect + trigger re-auth. Other errors omit it.
      const body: { error: string; code?: string } = { error: result.error };
      if (result.code) body.code = result.code;
      return NextResponse.json(
        body,
        { status: result.status >= 500 ? 502 : result.status },
      );
    }

    // [Track B / 2026-05-08] For harvest, surface the HarvestPlan back to
    // the client so it can attach the per-leg breakdown to the resume
    // tool_result. Without this, the LLM only sees the tx hash and can't
    // narrate "you claimed 0.0165 vSUI → ~$0.020 USDC into savings".
    const responseBody: { bytes: string; digest: string; harvestPlan?: unknown } = {
      bytes: result.bytes,
      digest: result.digest,
    };
    if (result.harvestPlan !== undefined) {
      responseBody.harvestPlan = result.harvestPlan;
    }
    return NextResponse.json(responseBody);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction build failed';
    const stack = err instanceof Error ? err.stack : '';
    console.error('[prepare] Error:', message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type SponsorResult =
  | { ok: true; bytes: string; digest: string; harvestPlan?: unknown }
  | { ok: false; status: number; error: string; code?: string };

async function buildAndSponsor(params: BuildRequest, jwt: string | null): Promise<SponsorResult> {
  console.log(`[prepare] composing ${params.type}...`);

  const steps: WriteStep[] =
    params.type === 'bundle' ? params.steps : [buildStepFromRequest(params)];

  // [SPEC 7 P2.7] Whether this request is a multi-step bundle. Used to gate
  // the three bundle-specific metrics. Single-step pending_actions are
  // already covered by per-tool telemetry (regenerate_count + harness
  // metrics); only multi-step bundles need the new instrumentation.
  const isBundle = params.type === 'bundle' && steps.length >= 2;

  // Overlay fee applies whenever a step's PTB will contain a Cetus swap —
  // either a top-level `swap_execute`, or the implicit per-leg swaps that
  // `harvest_rewards` performs internally to convert non-USDC rewards.
  // composeTx forwards `overlayFee` into both appenders; harvest's macro
  // (`addHarvestToTx`) then propagates it into every internal `addSwapToTx`
  // call so each swap leg charges the overlay (parity with single-op swap).
  // Without harvest in this predicate, the macro saw `overlayFee=undefined`
  // and every swap leg ran fee-free — observed in production 2026-05-08
  // (S.120 in the build tracker). The save fee on the deposit leg is wired
  // separately via `feeHooks.save_deposit` below — the harvest macro reuses
  // the same hook the single-op `save` path uses.
  const needsOverlayFee = steps.some(
    (s) => s.toolName === 'swap_execute' || s.toolName === 'harvest_rewards',
  );

  // [Backlog 2a-bis / 2026-05-04] Time `composeTx` whenever a step is
  // `swap_execute` (single-step OR bundled). The engine-side
  // `cetus.swap_execute_total_ms` instrumentation is dead code in audric
  // prod — confirm-tier writes flow through this route's `composeTx` call,
  // bypassing the engine tool's `call()` method. Capture the latency here
  // so the Backlog 2b decision gate has data for the dominant single-swap
  // shape, not just bundles.
  const composeStartedAt = isBundle || needsOverlayFee ? Date.now() : 0;

  let composed;
  try {
    composed = await composeTx({
      sender: params.address,
      client: getClient(),
      sponsoredContext: true,
      steps,
      overlayFee: needsOverlayFee
        ? { rate: OVERLAY_FEE_RATE, receiver: T2000_OVERLAY_FEE_WALLET }
        : undefined,
      feeHooks: {
        // [v1.24.3 / S.120 follow-up] Charge SAVE_FEE_BPS regardless of
        // stable asset. USDC + USDsui are both saveable per
        // savings-usdc-only.mdc. Pre-fix: hook short-circuited on
        // `asset !== 'USDC'`, so USDsui saves were silently fee-free.
        // Treasury already accepts multi-currency inflows from Cetus swap
        // overlays (which take fees in the swap output coin), so adding
        // USDsui costs nothing in treasury-management surface area.
        // Decimals derived from SUPPORTED_ASSETS so this stays correct if
        // a future saveable asset ships with non-6 decimals.
        save_deposit: ({ tx, coin, input }) => {
          const asset = input.asset ?? 'USDC';
          const decimals = SUPPORTED_ASSETS[asset].decimals;
          addFeeTransfer(tx, coin, SAVE_FEE_BPS, T2000_OVERLAY_FEE_WALLET, input.amount, decimals);
        },
        borrow: ({ tx, coin, input }) => {
          const asset = input.asset ?? 'USDC';
          const decimals = SUPPORTED_ASSETS[asset].decimals;
          addFeeTransfer(tx, coin, BORROW_FEE_BPS, T2000_OVERLAY_FEE_WALLET, input.amount, decimals);
        },
      },
    });
  } catch (composeErr) {
    // [SPEC 7 P2.7] composeTx threw locally before Enoki was contacted. This
    // is "our code is wrong" territory — wrong tool name, malformed input,
    // SDK regression, etc. Distinct from sponsorship_failed (Enoki dry-run
    // rejected the assembled Payment Intent). Re-throw to preserve the original
    // try/catch semantics in the POST handler.
    if (isBundle) {
      const reason =
        composeErr instanceof Error
          ? composeErr.message.slice(0, 80)
          : 'unknown';
      emitBundleOutcome({
        outcome: 'compose_error',
        stepCount: steps.length,
        reason,
      });
    }
    if (needsOverlayFee) {
      emitSwapComposeDuration({
        stepCount: steps.length,
        durationMs: Date.now() - composeStartedAt,
        outcome: 'compose_error',
      });
    }
    throw composeErr;
  }

  if (isBundle) {
    emitBundleComposeDuration(steps.length, Date.now() - composeStartedAt);
  }
  if (needsOverlayFee) {
    emitSwapComposeDuration({
      stepCount: steps.length,
      durationMs: Date.now() - composeStartedAt,
      outcome: 'success',
    });
  }

  if (params.type === 'claim-rewards') {
    const preview = composed.perStepPreviews[0];
    if (preview.toolName === 'claim_rewards' && preview.rewards.length === 0) {
      return { ok: false, status: 400, error: 'No rewards available to claim' };
    }
  }

  let harvestPlan: unknown | undefined;
  if (params.type === 'harvest') {
    // [Track B / 2026-05-08] Two empty-plan failure modes:
    //  1. NAVI returned zero pending rewards → claimed[] is empty →
    //     building the PTB would emit a no-op claim. Bail before the
    //     user signs anything.
    //  2. NAVI was degraded at compose time → addHarvestToTx falls
    //     through to the same empty-claim shape. Surface the same 400
    //     so the chat narrates "Nothing to harvest" honestly.
    const preview = composed.perStepPreviews[0];
    if (preview.toolName === 'harvest_rewards') {
      if (preview.claimed.length === 0) {
        return { ok: false, status: 400, error: 'No rewards available to harvest' };
      }
      // Stash the plan to forward back to the client. The plan shape is
      // the SDK's StepPreview for harvest_rewards (claimed / swaps /
      // skipped / expectedUsdcDeposited); the client merges it into the
      // resume tool_result so the LLM can narrate the per-leg breakdown.
      harvestPlan = {
        claimed: preview.claimed,
        swaps: preview.swaps,
        skipped: preview.skipped,
        expectedUsdcDeposited: preview.expectedUsdcDeposited,
      };
    }
  }

  const moveCallTargets = extractMoveCallTargets(composed.tx);
  if (moveCallTargets.length > 0) {
    console.log('[prepare]', String(params.type), 'targets:', moveCallTargets);
  }
  console.log(`[prepare] tx kind built OK, ${composed.txKindBytes.length} bytes`);

  const sponsorHeaders: Record<string, string> = {
    Authorization: `Bearer ${ENOKI_SECRET_KEY!}`,
    'Content-Type': 'application/json',
  };
  if (jwt) {
    sponsorHeaders['zklogin-jwt'] = jwt;
  }

  const sponsorBody: Record<string, unknown> = {
    network: SUI_NETWORK,
    transactionBlockKindBytes: toBase64(composed.txKindBytes),
    sender: params.address,
  };

  if (moveCallTargets.length > 0) {
    sponsorBody.allowedMoveCallTargets = moveCallTargets;
  }

  const allowedAddresses = Array.from(
    new Set([...composed.derivedAllowedAddresses, params.address]),
  );
  sponsorBody.allowedAddresses = allowedAddresses;

  const sponsorRes = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
    method: 'POST',
    headers: sponsorHeaders,
    body: JSON.stringify(sponsorBody),
  });

  if (!sponsorRes.ok) {
    const errorBody = await sponsorRes.text().catch(() => '');
    console.error(`[sponsor] Enoki error (${sponsorRes.status}):`, errorBody);

    const enoki = parseEnokiErrorBody(errorBody);
    const errorMsg = enoki.message ?? `Sponsorship failed (${sponsorRes.status})`;

    // [S18-F7 / vercel-logs L5] Enoki's `code: 'jwt_error'` ("no applicable
    // key found in the JSON Web Key Set") fires when Google rotates a JWK
    // and the user's JWT was signed by the now-removed key. Same recovery
    // path as `code: 'expired'` (S18-F2 in the execute route): sign out +
    // sign back in. Surface as 401 + actionable copy via the shared helper
    // so the chat narrates the recovery flow instead of the cryptic raw
    // Enoki message. The POST handler maps `code: SESSION_EXPIRED_RESPONSE_CODE`
    // → 401 + `{ error, code }` body.
    if (isExpiredSessionError(enoki)) {
      if (isBundle) {
        emitBundleOutcome({
          outcome: 'sponsorship_failed',
          stepCount: steps.length,
          statusCode: 401,
          reason: 'session_expired',
        });
      }
      return {
        ok: false,
        status: 401,
        error: SESSION_EXPIRED_USER_MESSAGE,
        code: SESSION_EXPIRED_RESPONSE_CODE,
      };
    }

    // [SPEC 7 P2.7] Enoki rejected the sponsor request. Most commonly this
    // is a dry-run failure (the assembled Payment Intent would have reverted on-chain
    // — `CommandArgumentError`, missing coin, allowance violation, etc.).
    // Distinct from compose_error (our SDK threw before Enoki was called).
    // Note: this is the same surface that caught Finding F7 during P2.6 —
    // a malformed `to` address (literal "funkii" instead of 0x...) in a
    // bundle reached Enoki and dry-ran with `ArgumentWithoutValue`.
    if (isBundle) {
      emitBundleOutcome({
        outcome: 'sponsorship_failed',
        stepCount: steps.length,
        statusCode: sponsorRes.status,
        reason: errorMsg.slice(0, 80),
      });
    }

    return { ok: false, status: sponsorRes.status, error: errorMsg };
  }

  const { data } = await sponsorRes.json();
  return { ok: true, bytes: data.bytes, digest: data.digest, harvestPlan };
}

function extractMoveCallTargets(tx: import('@mysten/sui/transactions').Transaction): string[] {
  const data = tx.getData();
  const targets = new Set<string>();
  for (const cmd of data.commands) {
    if (cmd.$kind === 'MoveCall') {
      targets.add(`${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`);
    }
  }
  return [...targets];
}
