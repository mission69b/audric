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
  T2000_OVERLAY_FEE_WALLET,
  type WriteStep,
  type SupportedAsset,
} from '@t2000/sdk';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const OVERLAY_FEE_RATE = 0.001;

// [SIMPLIFICATION DAYS 5+8] On-chain allowance billing is fully retired.
// [SPEC 7 P2.2c, 2026-05-02] Migrated from a fat ~600-line route to a thin
// dispatcher built on @t2000/sdk's `composeTx`. The SDK auto-derives the
// `allowedAddresses` array from the assembled PTB's top-level
// `transferObjects` commands, eliminating the PR-H1/H4 hand-maintained-
// array bug class permanently. Fees stay an Audric concern (CLAUDE.md
// rule #9): we pass `feeHooks` to inline `addFeeTransfer` for USDC saves
// and borrows mid-PTB without leaking fee policy into the SDK.
type TxType =
  | 'send'
  | 'save'
  | 'withdraw'
  | 'borrow'
  | 'repay'
  | 'claim-rewards'
  | 'swap'
  | 'volo-stake'
  | 'volo-unstake';

interface BuildRequest {
  type: TxType;
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
}

/**
 * Map a host-shaped {@link BuildRequest} to the SDK's typed `WriteStep`.
 * Throws on missing required fields (recipient for send, from/to for swap)
 * — symmetric with the pre-migration switch statement's behavior.
 *
 * `pay_api` and `save_contact` are not `composeTx` tools (see WriteToolName
 * JSDoc) and are routed through `services/prepare` / Prisma respectively;
 * they never reach this route.
 */
function buildStepFromRequest(body: BuildRequest): WriteStep {
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
  type: TxType,
  address: string,
  amount: number,
  body: BuildRequest,
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

  const { type, address, amount, recipient } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const rl = rateLimit(`tx:${address}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const skipAmountCheck = type === 'claim-rewards' || type === 'volo-unstake';
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

  try {
    const result = await buildAndSponsor(body, jwt);

    if (!result.ok) {
      if (result.status === 429) {
        return NextResponse.json(
          { error: 'Too many transactions. Please try again shortly.' },
          { status: 429 },
        );
      }
      return NextResponse.json(
        { error: result.error },
        { status: result.status >= 500 ? 502 : result.status },
      );
    }

    return NextResponse.json({ bytes: result.bytes, digest: result.digest });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction build failed';
    const stack = err instanceof Error ? err.stack : '';
    console.error('[prepare] Error:', message, stack);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type SponsorResult =
  | { ok: true; bytes: string; digest: string }
  | { ok: false; status: number; error: string };

async function buildAndSponsor(params: BuildRequest, jwt: string | null): Promise<SponsorResult> {
  console.log(`[prepare] composing ${params.type}...`);

  const step = buildStepFromRequest(params);

  const composed = await composeTx({
    sender: params.address,
    client: getClient(),
    sponsoredContext: true,
    steps: [step],
    overlayFee:
      params.type === 'swap'
        ? { rate: OVERLAY_FEE_RATE, receiver: T2000_OVERLAY_FEE_WALLET }
        : undefined,
    feeHooks: {
      save_deposit: ({ tx, coin, input }) => {
        if (input.asset === 'USDC' || input.asset === undefined) {
          addFeeTransfer(tx, coin, SAVE_FEE_BPS, T2000_OVERLAY_FEE_WALLET, input.amount);
        }
      },
      borrow: ({ tx, coin, input }) => {
        if (input.asset === 'USDC' || input.asset === undefined) {
          addFeeTransfer(tx, coin, BORROW_FEE_BPS, T2000_OVERLAY_FEE_WALLET, input.amount);
        }
      },
    },
  });

  if (params.type === 'claim-rewards') {
    const preview = composed.perStepPreviews[0];
    if (preview.toolName === 'claim_rewards' && preview.rewards.length === 0) {
      return { ok: false, status: 400, error: 'No rewards available to claim' };
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

    let errorMsg = `Sponsorship failed (${sponsorRes.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      const enokiMsg = parsed?.errors?.[0]?.message ?? parsed?.message;
      if (enokiMsg) errorMsg = enokiMsg;
    } catch {}

    return { ok: false, status: sponsorRes.status, error: errorMsg };
  }

  const { data } = await sponsorRes.json();
  return { ok: true, bytes: data.bytes, digest: data.digest };
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
