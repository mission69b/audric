import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { AggregatorClient, Env, getProvidersExcluding } from '@cetusprotocol/aggregator-sdk';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress, validateAmount } from '@/lib/auth';
import { getRegistry, getClient } from '@/lib/protocol-registry';
import { getPortfolio } from '@/lib/portfolio';
import { assertAllowedAddressesCoverTransfers } from '@/lib/sponsor-allowed-addresses';
import {
  resolveTokenType,
  getDecimalsForCoinType,
  USDC_TYPE,
  SUI_TYPE,
  assertAllowedAsset,
  addFeeTransfer,
  SAVE_FEE_BPS,
  BORROW_FEE_BPS,
  T2000_OVERLAY_FEE_WALLET,
} from '@t2000/sdk';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;

// [SIMPLIFICATION DAYS 5+8] On-chain allowance billing is fully retired:
// the Move package, /setup wizard, allowance-status hook, sponsor route,
// and SDK helpers (buildCreateAllowanceTx / addDepositAllowanceTx /
// buildDeductAllowanceTx / etc.) are all gone as of @t2000/sdk@0.39.0.
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
 * Server-side balance validation — prevents building transactions that will fail on-chain.
 * Uses canonical `getPortfolio()` for USDC validation (the common path), and a
 * direct `getBalance` only when we need precision against an exact `coinType`
 * that `getPortfolio`'s symbol-aggregated allocations can't disambiguate.
 * Returns an error message string if validation fails, or null if OK.
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
        // CANONICAL-BYPASS: tradeable balance check against an arbitrary
        // coin type. `getPortfolio` aggregates by symbol, but tx-build
        // validation needs precision against the EXACT `coinType`
        // requested (some legacy tokens collide on symbol). Direct
        // RPC call is the right call here.
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
        // CANONICAL-BYPASS: see note above — coin-type-precise balance check.
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

  // Server-side balance validation for write operations (after basic param checks)
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

  // [B5 v2 / 2026-04-30] Treasury wallet must always be in allowedAddresses
  // because save/borrow inline-transfer the protocol fee there via
  // addFeeTransfer (a top-level PTB transferObjects command). Enoki rejects
  // any transferObjects to a recipient not in allowedAddresses, even though
  // the global allow-list config may include other addresses. Swap is
  // unaffected because Cetus's overlay routing happens inside Move calls,
  // which Enoki can't statically inspect.
  const allowedAddresses = [T2000_OVERLAY_FEE_WALLET];
  if (params.recipient) allowedAddresses.push(params.recipient);
  sponsorBody.allowedAddresses = allowedAddresses;

  // [PR-H5] Belt-and-braces: walk the built PTB ourselves and assert every
  // top-level transferObjects recipient appears in `allowedAddresses`. If
  // someone adds a new write path that injects a transfer without updating
  // the allow-list, this throws here (clear stack trace) instead of letting
  // Enoki reject with its terse "Address is not allow-listed" 400.
  assertAllowedAddressesCoverTransfers(tx, allowedAddresses);

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
      const coinType = resolveTokenType(assetKey) ?? USDC_TYPE;
      const decimals = getDecimalsForCoinType(coinType);
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
      // [v0.51.0] Honor the asset param — pre-v0.51 we hardcoded 'USDC' here
      // even after the assertAllowedAsset check, which silently rewrote a
      // USDsui save into a USDC save (broken end-to-end). The SDK allow-list
      // is the gate; this route just plumbs the chosen asset through.
      assertAllowedAsset('save', asset);
      const saveAsset = asset ?? 'USDC';
      const adapter = getLendingAdapter(params.protocol);

      // [B5 v2 / 2026-04-30] Inline fee collection for USDC saves. SDK is
      // fee-free; Audric is the only fee owner. Build the tx manually here so
      // we can wedge `addFeeTransfer` between the splitCoins and the NAVI
      // deposit — order matters because the deposit consumes the coin.
      // USDsui saves are fee-free at this layer (the indexer only watches
      // USDC inflows to the treasury wallet anyway).
      if (saveAsset !== 'USDC' || !adapter.addSaveToTx) {
        const result = await adapter.buildSaveTx(address, amount, saveAsset);
        return result.tx;
      }

      const coinType = resolveTokenType(saveAsset) ?? USDC_TYPE;
      const decimals = getDecimalsForCoinType(coinType);
      const { ids: saveCoinIds, totalBalance: saveTotal } = await fetchCoinsForSwap(client, address, coinType);
      if (saveCoinIds.length === 0) throw new Error(`No ${saveAsset} coins found`);

      const savePrimary = tx.object(saveCoinIds[0]);
      if (saveCoinIds.length > 1) {
        tx.mergeCoins(savePrimary, saveCoinIds.slice(1).map(id => tx.object(id)));
      }

      const requestedRaw = BigInt(Math.floor(amount * 10 ** decimals));
      const cappedRaw = requestedRaw > saveTotal ? saveTotal : requestedRaw;
      const [depositCoin] = tx.splitCoins(savePrimary, [cappedRaw]);

      addFeeTransfer(tx, depositCoin, SAVE_FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount);

      await adapter.addSaveToTx(tx, address, depositCoin, saveAsset);
      return tx;
    }

    case 'withdraw': {
      const adapter = getLendingAdapter(params.protocol);
      const withdrawAsset = params.fromAsset ?? asset ?? 'USDC';
      // skipPythUpdate=true is REQUIRED for Enoki sponsored builds. Pyth's
      // SuiPythClient.updatePriceFeeds (called by NAVI when oracle feeds
      // are stale) does tx.splitCoins(tx.gas, ...) for the oracle fee.
      // tx.gas can't be referenced as an argument under sponsorship —
      // Sui rejects with "Cannot use GasCoin as a transaction argument".
      // The on-chain `update_single_price_v2` moveCalls still run and
      // read Pyth's on-chain state, kept fresh by Pyth keepers (~5s
      // for major assets). See @t2000/sdk navi.ts buildWithdrawTx.
      const result = await adapter.buildWithdrawTx(address, amount, withdrawAsset, {
        skipPythUpdate: true,
      });
      return result.tx;
    }

    case 'borrow': {
      // [v0.51.0] Same fix as save above — honor the asset param so USDsui
      // borrows actually flow through to NAVI's USDsui pool instead of
      // silently routing to USDC.
      assertAllowedAsset('borrow', asset);
      const borrowAsset = asset ?? 'USDC';
      const adapter = getLendingAdapter(params.protocol);

      // [B5 v2 / 2026-04-30] Inline fee collection for USDC borrows. Use the
      // lower-level `addBorrowToTx` adapter method (returns the borrowed coin
      // without transferring) so we can split the fee BEFORE the user gets
      // the remainder. USDsui borrows skip the fee at this layer (matches
      // the save path's USDC-only fee policy). See note on `withdraw` for
      // skipPythUpdate semantics.
      if (borrowAsset !== 'USDC' || !adapter.addBorrowToTx) {
        const result = await adapter.buildBorrowTx(address, amount, borrowAsset, {
          skipPythUpdate: true,
        });
        return result.tx;
      }

      const borrowedCoin = await adapter.addBorrowToTx(tx, address, amount, borrowAsset, {
        skipPythUpdate: true,
      });
      addFeeTransfer(tx, borrowedCoin, BORROW_FEE_BPS, T2000_OVERLAY_FEE_WALLET, amount);
      tx.transferObjects([borrowedCoin], address);
      return tx;
    }

    case 'repay': {
      const adapter = getLendingAdapter(params.protocol);
      // skipOracle bypasses oracle entirely — safe for repay since debt
      // reduction has no health-factor risk and prices aren't checked.
      const result = await adapter.buildRepayTx(address, amount, asset ?? 'USDC', {
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

      const fromType = resolveTokenType(fromToken);
      const toType = resolveTokenType(toToken);
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

const swapDecimalsCache = new Map<string, number>();

async function getSwapDecimals(coinType: string): Promise<number> {
  const cached = swapDecimalsCache.get(coinType);
  if (cached !== undefined) return cached;
  const known = getDecimalsForCoinType(coinType);
  if (known !== 9) { swapDecimalsCache.set(coinType, known); return known; }
  try {
    const meta = await getClient().getCoinMetadata({ coinType });
    if (meta && typeof meta.decimals === 'number') {
      swapDecimalsCache.set(coinType, meta.decimals);
      return meta.decimals;
    }
  } catch (err) {
    console.warn('[swap] getCoinMetadata failed for %s:', coinType, err);
  }
  return 9;
}

const CETUS_ENV = SUI_NETWORK === 'mainnet' ? Env.Mainnet : Env.Testnet;

// Pyth-dependent providers use tx.gas for oracle fee payments which Enoki
// rejects in sponsored transactions. Excluding them ensures zero GasCoin
// references — true gasless operation. 23 DEXes remain for routing.
const SPONSORED_TX_PROVIDERS = getProvidersExcluding([
  'HAEDALPMM', 'METASTABLE', 'OBRIC',
  'STEAMM_OMM', 'STEAMM_OMM_V2', 'SEVENK', 'HAEDALHMMV2',
]);

// [B5 v2 / 2026-04-30] Pre-B5 v2 the overlay receiver was hardcoded to the
// Move object ID `0x3bb501…ec91` (the bug — USDC sent there became inaccessible).
// Now sourced from the canonical SDK constant `T2000_OVERLAY_FEE_WALLET`,
// which IS a regular Sui wallet address. The indexer detects USDC inflows to
// this wallet and writes them to `ProtocolFeeLedger`.
const OVERLAY_FEE_RATE = 0.001; // 0.1% swap fee

function getCetusAggregator(signer: string): AggregatorClient {
  return new AggregatorClient({
    signer,
    env: CETUS_ENV,
    overlayFeeRate: OVERLAY_FEE_RATE,
    overlayFeeReceiver: T2000_OVERLAY_FEE_WALLET,
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
          providers: SPONSORED_TX_PROVIDERS,
        }),
        15_000,
        'Swap route lookup',
      );

      if (!routerData) throw new Error(`No swap route found for ${fromToken} → ${toToken}`);
      if (routerData.insufficientLiquidity) throw new Error(`Insufficient liquidity for ${fromToken} → ${toToken}`);
      console.log(`[swap] route found: paths=${routerData.paths?.length}, amountOut=${routerData.amountOut}`);

      const swapTx = new Transaction();
      swapTx.setSender(address);

      const swapPrimary = swapTx.object(swapCoinIds[0]);
      if (swapCoinIds.length > 1) {
        swapTx.mergeCoins(swapPrimary, swapCoinIds.slice(1).map(id => swapTx.object(id)));
      }
      const inputCoin = swapAll ? swapPrimary : swapTx.splitCoins(swapPrimary, [effectiveAmount])[0];

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

      swapTx.transferObjects([outputCoin], address);
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
