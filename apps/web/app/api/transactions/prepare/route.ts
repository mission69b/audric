import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { AggregatorClient, Env } from '@cetusprotocol/aggregator-sdk';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress, validateAmount } from '@/lib/auth';
import { getRegistry, getClient } from '@/lib/protocol-registry';

export const runtime = 'nodejs';

const ENOKI_SECRET_KEY = process.env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const SUI_NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';

type TxType = 'send' | 'save' | 'withdraw' | 'borrow' | 'repay' | 'claim-rewards' | 'swap' | 'volo-stake' | 'volo-unstake';

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

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

function getLendingAdapter(protocolId?: string) {
  const registry = getRegistry();
  const adapters = registry.listLending();
  if (protocolId) {
    const match = adapters.find((a) => a.id === protocolId);
    if (!match) throw new Error(`Unknown lending protocol: ${protocolId}`);
    return match;
  }
  return adapters[0];
}

function extractMoveCallTargets(tx: Transaction): string[] {
  const data = tx.getData();
  const targets = new Set<string>();
  for (const cmd of data.commands) {
    if (cmd.$kind === 'MoveCall') {
      targets.add(`${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`);
    }
  }
  return [...targets];
}

/**
 * POST /api/transactions/prepare
 *
 * 1. Builds a Sui transaction kind server-side
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

  const { type, address, amount, recipient, asset } = body;

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

  try {
    const params: BuildRequest = {
      type, address, amount, recipient, asset,
      fromAsset: body.fromAsset, toAsset: body.toAsset,
      protocol: body.protocol,
      from: body.from, to: body.to,
      slippage: body.slippage, byAmountIn: body.byAmountIn,
    };
    const result = await buildAndSponsor(params, jwt);

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

async function buildAndSponsor(
  params: BuildRequest,
  jwt: string | null,
): Promise<SponsorResult> {
  console.log(`[prepare] building ${params.type}...`);
  const tx = await buildTransaction(params);
  console.log(`[prepare] buildTransaction OK`);

  const moveCallTargets = extractMoveCallTargets(tx);
  if (moveCallTargets.length > 0) {
    console.log('[prepare]', String(params.type), 'targets:', moveCallTargets);
  }

  console.log(`[prepare] building tx kind bytes...`);
  const txKindBytes = await tx.build({ client: getClient(), onlyTransactionKind: true });
  const txKindBase64 = toBase64(txKindBytes);
  console.log(`[prepare] tx kind built OK, ${txKindBytes.length} bytes`);

  const sponsorHeaders: Record<string, string> = {
    Authorization: `Bearer ${ENOKI_SECRET_KEY!}`,
    'Content-Type': 'application/json',
  };
  if (jwt) {
    sponsorHeaders['zklogin-jwt'] = jwt;
  }

  const sponsorBody: Record<string, unknown> = {
    network: SUI_NETWORK,
    transactionBlockKindBytes: txKindBase64,
    sender: params.address,
  };

  if (moveCallTargets.length > 0) {
    sponsorBody.allowedMoveCallTargets = moveCallTargets;
  }

  if (params.recipient) {
    sponsorBody.allowedAddresses = [params.recipient];
  }

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

async function buildTransaction(params: BuildRequest): Promise<Transaction> {
  const { type, address, amount, recipient, asset } = params;
  const client = getClient();
  const tx = new Transaction();
  tx.setSender(address);

  switch (type) {
    case 'send': {
      if (!recipient || !recipient.startsWith('0x')) {
        throw new Error('Invalid recipient');
      }

      const assetKey = asset ?? 'USDC';
      const coinType = assetKey === 'SUI' ? '0x2::sui::SUI' : USDC_TYPE;
      const decimals = assetKey === 'SUI' ? 9 : 6;
      let sendRawAmount = BigInt(Math.round(amount * 10 ** decimals));

      const sendCoins = [];
      let sendCursor: string | null | undefined = undefined;
      do {
        const page = await client.getCoins({ owner: address, coinType, cursor: sendCursor });
        sendCoins.push(...page.data);
        sendCursor = page.hasNextPage ? page.nextCursor : null;
      } while (sendCursor);
      if (!sendCoins.length) throw new Error(`No ${assetKey} coins found`);

      const sendTotal = sendCoins.reduce((sum, c) => sum + BigInt(c.balance), BigInt(0));
      if (sendRawAmount > sendTotal) sendRawAmount = sendTotal;

      const coinIds = sendCoins.map(c => c.coinObjectId);
      if (coinIds.length > 1) {
        tx.mergeCoins(tx.object(coinIds[0]), coinIds.slice(1).map(id => tx.object(id)));
      }
      const [split] = tx.splitCoins(tx.object(coinIds[0]), [sendRawAmount]);
      tx.transferObjects([split], recipient);
      break;
    }

    case 'save': {
      const adapter = getLendingAdapter(params.protocol);
      const result = await adapter.buildSaveTx(address, amount, asset ?? 'USDC', { sponsored: true });
      return result.tx;
    }

    case 'withdraw': {
      const adapter = getLendingAdapter(params.protocol);
      const withdrawAsset = params.fromAsset ?? asset ?? 'USDC';
      const result = await adapter.buildWithdrawTx(address, amount, withdrawAsset, { sponsored: true });
      return result.tx;
    }

    case 'borrow': {
      const adapter = getLendingAdapter(params.protocol);
      const result = await adapter.buildBorrowTx(address, amount, asset ?? 'USDC', { sponsored: true });
      return result.tx;
    }

    case 'repay': {
      const adapter = getLendingAdapter(params.protocol);
      const result = await adapter.buildRepayTx(address, amount, asset ?? 'USDC', {
        sponsored: true,
        skipOracle: true,
      });
      return result.tx;
    }

    case 'claim-rewards': {
      const registry = getRegistry();
      let totalClaimed = 0;
      for (const adapter of registry.listLending()) {
        if (!adapter.addClaimRewardsToTx) continue;
        try {
          const claimed = await adapter.addClaimRewardsToTx(tx, address);
          totalClaimed += claimed.length;
        } catch {
          // Skip protocols with no claimable rewards
        }
      }
      if (totalClaimed === 0) {
        throw new Error('No rewards available to claim');
      }
      break;
    }

    case 'swap': {
      const fromToken = params.from;
      const toToken = params.to;
      if (!fromToken || !toToken) throw new Error('from and to tokens are required');

      const fromType = resolveSwapToken(fromToken);
      const toType = resolveSwapToken(toToken);
      if (!fromType) {
        throw new Error(
          `Unknown token "${fromToken}". Use a common name (SUI, USDC, CETUS, DEEP, etc.) or the full Sui coin type (e.g. 0x...::module::TOKEN).`,
        );
      }
      if (!toType) {
        throw new Error(
          `Unknown token "${toToken}". Use a common name (SUI, USDC, CETUS, DEEP, etc.) or the full Sui coin type (e.g. 0x...::module::TOKEN).`,
        );
      }
      if (fromType === toType) throw new Error('Cannot swap a token to itself');

      const fromDecimals = await getSwapDecimals(fromType);
      const rawAmount = BigInt(Math.floor(amount * 10 ** fromDecimals));

      const rawSlippage = Number(params.slippage);
      const slippage = Number.isFinite(rawSlippage)
        ? Math.max(0.001, Math.min(rawSlippage, 0.05))
        : 0.01;

      const { ids: swapCoinIds, totalBalance: swapTotal } = await fetchCoinsForSwap(client, address, fromType);
      if (swapCoinIds.length === 0) throw new Error(`No ${fromToken} coins found`);

      const swapAll = rawAmount >= swapTotal;
      const effectiveAmount = swapAll ? swapTotal : rawAmount;

      return buildSwapTx(address, fromType, toType, fromToken, toToken, effectiveAmount, swapAll, slippage, swapCoinIds, params.byAmountIn);
    }

    case 'volo-stake': {
      const VOLO_PKG = '0x68d22cf8bdbcd11ecba1e094922873e4080d4d11133e2443fddda0bfd11dae20';
      const VOLO_POOL = '0x2d914e23d82fedef1b5f56a32d5c64bdcc3087ccfea2b4d6ea51a71f587840e5';
      const VOLO_METADATA = '0x680cd26af32b2bde8d3361e804c53ec1d1cfe24c7f039eb7f549e8dfde389a60';
      const SUI_SYS = '0x05';

      const amountMist = BigInt(Math.floor(amount * 1e9));
      if (amountMist < BigInt(1_000_000_000)) throw new Error('Minimum stake is 1 SUI');

      const stakeTx = new Transaction();
      stakeTx.setSender(address);
      // For Enoki-sponsored txs, fetch actual SUI coins (tx.gas belongs to the sponsor)
      const { ids: stakeCoinIds } = await fetchCoinsForSwap(client, address, SUI_TYPE);
      if (stakeCoinIds.length === 0) throw new Error('No SUI coins found');
      const stakePrimary = stakeTx.object(stakeCoinIds[0]);
      if (stakeCoinIds.length > 1) {
        stakeTx.mergeCoins(stakePrimary, stakeCoinIds.slice(1).map(id => stakeTx.object(id)));
      }
      const [suiCoin] = stakeTx.splitCoins(stakePrimary, [amountMist]);
      const [vSuiCoin] = stakeTx.moveCall({
        target: `${VOLO_PKG}::stake_pool::stake`,
        arguments: [
          stakeTx.object(VOLO_POOL),
          stakeTx.object(VOLO_METADATA),
          stakeTx.object(SUI_SYS),
          suiCoin,
        ],
      });
      stakeTx.transferObjects([vSuiCoin], address);
      return stakeTx;
    }

    case 'volo-unstake': {
      const VOLO_PKG = '0x68d22cf8bdbcd11ecba1e094922873e4080d4d11133e2443fddda0bfd11dae20';
      const VOLO_POOL = '0x2d914e23d82fedef1b5f56a32d5c64bdcc3087ccfea2b4d6ea51a71f587840e5';
      const VOLO_METADATA = '0x680cd26af32b2bde8d3361e804c53ec1d1cfe24c7f039eb7f549e8dfde389a60';
      const SUI_SYS = '0x05';
      const VSUI_TYPE = '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT';

      const { ids: vSuiCoinIds } = await fetchCoinsForSwap(client, address, VSUI_TYPE);
      if (vSuiCoinIds.length === 0) throw new Error('No vSUI found in wallet');

      const unstakeTx = new Transaction();
      unstakeTx.setSender(address);
      const primary = unstakeTx.object(vSuiCoinIds[0]);
      if (vSuiCoinIds.length > 1) {
        unstakeTx.mergeCoins(primary, vSuiCoinIds.slice(1).map(id => unstakeTx.object(id)));
      }

      let vSuiCoin;
      if (amount <= 0) {
        vSuiCoin = primary;
      } else {
        const amountMist = BigInt(Math.floor(amount * 1e9));
        [vSuiCoin] = unstakeTx.splitCoins(primary, [amountMist]);
      }

      const [suiCoin] = unstakeTx.moveCall({
        target: `${VOLO_PKG}::stake_pool::unstake`,
        arguments: [
          unstakeTx.object(VOLO_POOL),
          unstakeTx.object(VOLO_METADATA),
          unstakeTx.object(SUI_SYS),
          vSuiCoin,
        ],
      });
      unstakeTx.transferObjects([suiCoin], address);
      return unstakeTx;
    }

    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }

  return tx;
}

// Unified token config — single source of truth for type resolution and decimal scaling.
const SWAP_TOKENS: Record<string, { type: string; decimals: number }> = {
  SUI:   { type: '0x2::sui::SUI', decimals: 9 },
  USDC:  { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
  USDT:  { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6 },
  CETUS: { type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS', decimals: 9 },
  DEEP:  { type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', decimals: 6 },
  NAVX:  { type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX', decimals: 9 },
  vSUI:  { type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT', decimals: 9 },
  WAL:   { type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL', decimals: 9 },
  ETH:   { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8 },
};

const SWAP_TYPE_TO_DECIMALS = new Map(
  Object.values(SWAP_TOKENS).map((t) => [t.type, t.decimals]),
);

function resolveSwapToken(nameOrType: string): string | null {
  if (nameOrType.includes('::')) return nameOrType;
  const known = SWAP_TOKENS[nameOrType.toUpperCase()]?.type;
  if (known) return known;
  return null;
}

function getSwapDecimalsSync(coinType: string): number | null {
  return SWAP_TYPE_TO_DECIMALS.get(coinType) ?? null;
}

async function getSwapDecimals(coinType: string): Promise<number> {
  const known = getSwapDecimalsSync(coinType);
  if (known !== null) return known;
  try {
    const meta = await getClient().getCoinMetadata({ coinType });
    if (meta && typeof meta.decimals === 'number') {
      SWAP_TYPE_TO_DECIMALS.set(coinType, meta.decimals);
      return meta.decimals;
    }
  } catch (err) {
    console.warn(`[swap] getCoinMetadata failed for ${coinType}:`, err);
  }
  return 9;
}

const CETUS_ENV = SUI_NETWORK === 'mainnet' ? Env.Mainnet : Env.Testnet;

const PYTH_HERMES_URLS = [
  'https://hermes.pyth.network',
  'https://hermes-beta.pyth.network',
];

function getCetusAggregator(signer: string): AggregatorClient {
  return new AggregatorClient({
    signer,
    env: CETUS_ENV,
    pythUrls: PYTH_HERMES_URLS,
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

async function fetchCoinsForSwap(
  client: ReturnType<typeof getClient>,
  owner: string,
  coinType: string,
): Promise<{ ids: string[]; totalBalance: bigint }> {
  const ids: string[] = [];
  let totalBalance = BigInt(0);
  let cursor: string | null | undefined;
  do {
    const page = await client.getCoins({ owner, coinType, cursor: cursor ?? undefined });
    for (const c of page.data) {
      ids.push(c.coinObjectId);
      totalBalance += BigInt(c.balance);
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return { ids, totalBalance };
}

/**
 * Recursively replace { $kind: 'GasCoin' } references in transaction commands
 * with a user-owned SUI coin. Needed because Enoki sponsored transactions
 * reject GasCoin references, but the Cetus aggregator uses tx.gas for Pyth
 * oracle fee payments on certain routes (Turbos, Haedal, etc.).
 */
function replaceGasCoins(obj: unknown, replacement: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(item => replaceGasCoins(item, replacement));
  const record = obj as Record<string, unknown>;
  if (record.$kind === 'GasCoin') return replacement;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    result[key] = replaceGasCoins(val, replacement);
  }
  return result;
}

function patchGasCoinRefs(tx: Transaction, suiCoinArg: unknown): number {
  const data = tx.getData();
  let count = 0;
  for (let i = 0; i < data.commands.length; i++) {
    const before = JSON.stringify(data.commands[i]);
    if (!before.includes('"GasCoin"')) continue;
    const patched = replaceGasCoins(data.commands[i], suiCoinArg);
    data.commands[i] = patched as (typeof data.commands)[number];
    count++;
  }
  console.log(`[swap] patched ${count} commands with GasCoin references`);
  return count;
}

async function buildSwapTx(
  address: string,
  fromType: string,
  toType: string,
  fromToken: string,
  toToken: string,
  effectiveAmount: bigint,
  swapAll: boolean,
  slippage: number,
  swapCoinIds: string[],
  byAmountIn?: boolean,
): Promise<Transaction> {
  const client = getClient();
  const MAX_ATTEMPTS = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const aggClient = getCetusAggregator(address);

      console.log(`[swap] attempt ${attempt}: findRouters ${fromToken}→${toToken} amount=${effectiveAmount}`);
      const routerData = await withTimeout(
        aggClient.findRouters({
          from: fromType,
          target: toType,
          amount: effectiveAmount.toString(),
          byAmountIn: byAmountIn ?? true,
        }),
        15_000,
        'Swap route lookup',
      );

      if (!routerData) throw new Error(`No swap route found for ${fromToken} → ${toToken}`);
      if (routerData.insufficientLiquidity) throw new Error(`Insufficient liquidity for ${fromToken} → ${toToken}`);
      console.log(`[swap] route found: paths=${routerData.paths?.length}, amountOut=${routerData.amountOut}`);

      const swapTx = new Transaction();
      swapTx.setSender(address);

      // Set up input coin (the "from" token)
      const swapPrimary = swapTx.object(swapCoinIds[0]);
      if (swapCoinIds.length > 1) {
        swapTx.mergeCoins(swapPrimary, swapCoinIds.slice(1).map(id => swapTx.object(id)));
      }
      const inputCoin = swapAll ? swapPrimary : swapTx.splitCoins(swapPrimary, [effectiveAmount])[0];

      // Pre-load user's SUI coins for GasCoin replacement.
      // Some Cetus routes use tx.gas for Pyth oracle fees; Enoki rejects GasCoin
      // in sponsored tx kind bytes. We provide the user's SUI as a substitute.
      let suiFeeCoinArg: unknown = null;
      if (fromType !== SUI_TYPE) {
        const suiCoins = await fetchCoinsForSwap(client, address, SUI_TYPE);
        if (suiCoins.ids.length > 0) {
          const suiPrimary = swapTx.object(suiCoins.ids[0]);
          if (suiCoins.ids.length > 1) {
            swapTx.mergeCoins(suiPrimary, suiCoins.ids.slice(1).map(id => swapTx.object(id)));
          }
          suiFeeCoinArg = suiPrimary;
          console.log(`[swap] loaded ${suiCoins.ids.length} SUI coin(s) for potential GasCoin replacement`);
        }
      }

      console.log(`[swap] calling routerSwap...`);
      const outputCoin = await withTimeout(
        aggClient.routerSwap({
          router: routerData,
          inputCoin,
          slippage,
          txb: swapTx,
        }),
        15_000,
        'Swap transaction build',
      );

      // Patch GasCoin references with user's SUI coin
      const hasGasCoin = JSON.stringify(swapTx.getData().commands).includes('"GasCoin"');
      if (hasGasCoin) {
        if (!suiFeeCoinArg) {
          throw new Error(
            'This swap route requires a small SUI balance for oracle fees. Add some SUI to your wallet first.',
          );
        }
        patchGasCoinRefs(swapTx, suiFeeCoinArg);
      }

      swapTx.transferObjects([outputCoin], address);
      // Return remaining SUI from fee coin back to user
      if (hasGasCoin && suiFeeCoinArg) {
        swapTx.transferObjects([suiFeeCoinArg as Parameters<Transaction['transferObjects']>[0][0]], address);
      }

      console.log(`[swap] tx built OK, commands=${swapTx.getData().commands.length}`);
      return swapTx;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[swap] attempt ${attempt}/${MAX_ATTEMPTS} failed:`, lastError.message, lastError.stack?.split('\n').slice(0,3).join('\n'));
      if (attempt < MAX_ATTEMPTS) continue;
    }
  }

  throw new Error(`Swap ${fromToken} → ${toToken} failed: ${lastError?.message ?? 'unknown error'}`);
}
