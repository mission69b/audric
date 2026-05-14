import { NextRequest, NextResponse } from 'next/server';
import { resolveTokenType, getDecimalsForCoinType } from '@/lib/token-registry';
import { authenticateRequest, assertOwnsOrWatched } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/swap/quote?from=USDC&to=SUI&amount=10&address=0x...
 * Header: x-zklogin-jwt (required — SPEC 30 Phase 1A.5)
 *
 * Returns a swap quote from Cetus Aggregator without executing.
 *
 * SPEC 30 Phase 1A.5: caller must hold a valid zkLogin JWT and the
 * `?address=` parameter must either equal the caller's own address or
 * be in their `WatchAddress` watchlist (the wallet address is fed
 * into Cetus route discovery so it's still address-scoped, even
 * though no DB rows are read).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const amount = searchParams.get('amount');
  const address = searchParams.get('address');

  if (!from || !to || !amount || !address) {
    return NextResponse.json(
      { error: 'Missing required params: from, to, amount, address' },
      { status: 400 },
    );
  }

  const auth = await authenticateRequest(req);
  if ('error' in auth) return auth.error;
  const ownership = await assertOwnsOrWatched(auth.verified, address);
  if (ownership) return ownership;

  const fromType = resolveTokenType(from);
  const toType = resolveTokenType(to);
  if (!fromType || !toType) {
    return NextResponse.json(
      { error: `Unknown token: ${!fromType ? from : to}` },
      { status: 400 },
    );
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
  }

  try {
    const { findSwapRoute } = await import('@t2000/sdk');
    const fromDecimals = getDecimalsForCoinType(fromType);
    const toDecimals = getDecimalsForCoinType(toType);
    const amountRaw = BigInt(Math.round(parsedAmount * 10 ** fromDecimals));

    const route = await findSwapRoute({
      walletAddress: address,
      from: fromType,
      to: toType,
      amount: amountRaw,
      byAmountIn: true,
    });

    if (!route || route.insufficientLiquidity) {
      return NextResponse.json(
        { error: 'Insufficient liquidity for this pair' },
        { status: 422 },
      );
    }

    const fromAmount = Number(route.amountIn) / 10 ** fromDecimals;
    const toAmount = Number(route.amountOut) / 10 ** toDecimals;

    const fromName = from.split('::').pop() ?? from;
    const toName = to.split('::').pop() ?? to;

    return NextResponse.json({
      fromToken: fromName,
      toToken: toName,
      fromAmount,
      toAmount,
      priceImpact: Number(route.priceImpact),
      route: 'Cetus Aggregator',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
