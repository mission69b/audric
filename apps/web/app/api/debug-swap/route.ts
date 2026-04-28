import { NextResponse } from 'next/server';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import { getClient } from '@/lib/protocol-registry';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const address = url.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'pass ?address=0x...' }, { status: 400 });

  const steps: Array<{ step: string; ok: boolean; detail: string; ms: number }> = [];
  const t = () => Date.now();

  try {
    // Step 1: Fetch USDC coins
    let start = t();
    const client = getClient();
    const coinsPage = await client.getCoins({ owner: address, coinType: USDC_TYPE });
    const coins = coinsPage.data;
    const totalBalance = coins.reduce((s, c) => s + BigInt(c.balance), BigInt(0));
    steps.push({ step: 'fetch_coins', ok: true, detail: `${coins.length} USDC coins, total=${totalBalance}`, ms: t() - start });

    if (coins.length === 0) return NextResponse.json({ steps, error: 'No USDC coins' });

    // Step 2: Find route
    start = t();
    const aggClient = new AggregatorClient({
      signer: address,
      env: SUI_NETWORK === 'mainnet' ? Env.Mainnet : Env.Testnet,
      pythUrls: ['https://hermes.pyth.network', 'https://hermes-beta.pyth.network'],
    });

    const amount = BigInt(5000000); // 5 USDC
    const routerData = await aggClient.findRouters({
      from: USDC_TYPE,
      target: SUI_TYPE,
      amount: amount.toString(),
      byAmountIn: true,
    });
    steps.push({
      step: 'find_route',
      ok: !!routerData && !routerData.insufficientLiquidity,
      detail: routerData ? `paths=${routerData.paths?.length}, amountOut=${routerData.amountOut}` : 'null',
      ms: t() - start,
    });

    if (!routerData) return NextResponse.json({ steps, error: 'No route found' });

    // Step 3: Build swap transaction
    start = t();
    const swapTx = new Transaction();
    swapTx.setSender(address);

    const coinIds = coins.map(c => c.coinObjectId);
    const primary = swapTx.object(coinIds[0]);
    if (coinIds.length > 1) {
      swapTx.mergeCoins(primary, coinIds.slice(1).map(id => swapTx.object(id)));
    }
    const inputCoin = swapTx.splitCoins(primary, [amount])[0];

    const outputCoin = await aggClient.routerSwap({
      router: routerData,
      inputCoin,
      slippage: 0.01,
      txb: swapTx,
    });
    swapTx.transferObjects([outputCoin], address);
    const cmdCount = swapTx.getData().commands.length;
    steps.push({ step: 'router_swap', ok: true, detail: `${cmdCount} commands`, ms: t() - start });

    // Step 4: Extract move call targets
    const data = swapTx.getData();
    const targets: string[] = [];
    for (const cmd of data.commands) {
      if (cmd.$kind === 'MoveCall') {
        targets.push(`${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`);
      }
    }

    // Step 5: Build as tx kind
    start = t();
    const txKindBytes = await swapTx.build({ client, onlyTransactionKind: true });
    const txKindBase64 = toBase64(txKindBytes);
    steps.push({ step: 'build_tx_kind', ok: true, detail: `${txKindBytes.length} bytes`, ms: t() - start });

    // Step 6: Sponsor via Enoki
    if (!ENOKI_SECRET_KEY) {
      steps.push({ step: 'enoki_sponsor', ok: false, detail: 'No ENOKI_SECRET_KEY', ms: 0 });
      return NextResponse.json({ steps, targets });
    }

    start = t();
    const jwt = request.headers.get('x-zklogin-jwt');
    const sponsorHeaders: Record<string, string> = {
      Authorization: `Bearer ${ENOKI_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
    if (jwt) sponsorHeaders['zklogin-jwt'] = jwt;

    const sponsorBody = {
      network: SUI_NETWORK,
      transactionBlockKindBytes: txKindBase64,
      sender: address,
      allowedMoveCallTargets: targets,
    };

    const sponsorRes = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
      method: 'POST',
      headers: sponsorHeaders,
      body: JSON.stringify(sponsorBody),
    });

    const sponsorText = await sponsorRes.text();
    steps.push({
      step: 'enoki_sponsor',
      ok: sponsorRes.ok,
      detail: sponsorRes.ok ? `status=${sponsorRes.status}` : `status=${sponsorRes.status} body=${sponsorText}`,
      ms: t() - start,
    });

    return NextResponse.json({ steps, targets, sponsor_status: sponsorRes.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : '';
    steps.push({ step: 'EXCEPTION', ok: false, detail: msg, ms: 0 });
    return NextResponse.json({ steps, error: msg, stack });
  }
}
