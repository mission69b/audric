import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { toBase64 } from '@mysten/sui/utils';
import { Challenge } from 'mppx';
import {
  getGatewayMapping,
  createRawGatewayMapping,
  getInternalApiKey,
} from '@/lib/service-gateway';
import type { GatewayMapping } from '@/lib/service-gateway';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { validateJwt, isValidSuiAddress } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { composeTx, USDC_TYPE } from '@t2000/sdk';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const USDC_DECIMALS = 6;
const DAILY_PURCHASE_LIMIT_USD = 50;
const MONTHLY_PURCHASE_LIMIT_USD = 500;

const client = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(SUI_NETWORK),
  network: SUI_NETWORK,
});

/**
 * POST /api/services/prepare
 *
 * Two flows depending on the service mapping:
 *
 * **Deliver-first** (merch orders, etc.):
 *   1. Check USDC balance + spending limits
 *   2. Call gateway's internal endpoint — upstream service runs FIRST
 *   3. If upstream fails → return error, user is NEVER charged
 *   4. If upstream succeeds → compose payment tx via composeTx, sponsor
 *
 * **Standard** (cheap, idempotent services):
 *   1. Pre-flight the gateway to get a 402 challenge
 *   2. Compose payment tx from the challenge via composeTx
 *   3. Sponsor + return { bytes, digest, meta } for client-side signing
 *
 * [SPEC 7 P2.2c, 2026-05-02] Both paths now route the on-chain leg through
 * `@t2000/sdk` `composeTx`, dropping the hand-rolled merge/split/transfer
 * pattern + hand-maintained `allowedAddresses` array. Three latent bugs
 * fixed for free:
 *   - `Math.round` violation on the rawAmount conversion (could round UP
 *     above wallet balance — composeTx uses `Math.floor` per
 *     financial-amounts.mdc)
 *   - duplicate `client.getCoins` between balance check and PTB build
 *     (composeTx fetches once via `selectAndSplitCoin`)
 *   - hand-maintained `allowedAddresses` (composeTx auto-derives —
 *     PR-H1/H4 bug class permanently eliminated)
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  const jwt = request.headers.get('x-zklogin-jwt');
  const jwtResult = validateJwt(jwt);
  if ('error' in jwtResult) return jwtResult.error;

  let body: {
    serviceId?: string;
    fields?: Record<string, string>;
    url?: string;
    rawBody?: Record<string, unknown>;
    address: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { address } = body;

  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const rl = rateLimit(`svc:${address}`, 5, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  const mapping = body.serviceId
    ? getGatewayMapping(body.serviceId)
    : body.url
      ? createRawGatewayMapping(body.url, body.rawBody ?? {})
      : null;

  const serviceId = body.serviceId ?? body.url ?? 'unknown';

  if (!mapping) {
    return NextResponse.json({ error: `Unknown or disallowed service: ${serviceId}` }, { status: 400 });
  }

  try {
    let serviceBody: Record<string, unknown>;
    try {
      serviceBody = mapping.transformBody(body.fields ?? {});
    } catch (validationErr) {
      const msg = validationErr instanceof Error ? validationErr.message : 'Invalid service parameters';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (mapping.deliverFirst) {
      return await handleDeliverFirst(mapping, serviceBody, serviceId, address, jwt);
    }

    return await handleStandardMpp(mapping, serviceBody, serviceId, address, jwt);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service preparation failed';
    console.error('[services/prepare] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Compose + sponsor a payment USDC send. Shared between deliver-first and
 * standard MPP paths. Returns the Enoki sponsor response unwrapped.
 */
async function composeAndSponsor(
  address: string,
  recipient: string,
  amountUsdc: number,
  jwt: string | null,
): Promise<{ ok: true; bytes: string; digest: string } | { ok: false; status: number; error: string }> {
  const composed = await composeTx({
    sender: address,
    client,
    sponsoredContext: true,
    steps: [
      {
        toolName: 'send_transfer',
        input: { to: recipient, amount: amountUsdc, asset: 'USDC' },
      },
    ],
  });

  const sponsorHeaders: Record<string, string> = {
    Authorization: `Bearer ${ENOKI_SECRET_KEY!}`,
    'Content-Type': 'application/json',
  };
  if (jwt) {
    sponsorHeaders['zklogin-jwt'] = jwt;
  }

  const allowedAddresses = Array.from(
    new Set([...composed.derivedAllowedAddresses, address]),
  );

  const sponsorRes = await fetch(`${ENOKI_BASE}/transaction-blocks/sponsor`, {
    method: 'POST',
    headers: sponsorHeaders,
    body: JSON.stringify({
      network: SUI_NETWORK,
      transactionBlockKindBytes: toBase64(composed.txKindBytes),
      sender: address,
      allowedAddresses,
    }),
  });

  if (!sponsorRes.ok) {
    const errorBody = await sponsorRes.text().catch(() => '');
    console.error(`[services/prepare] Sponsor error (${sponsorRes.status}):`, errorBody);
    let parsed: { message?: string } = {};
    try {
      parsed = JSON.parse(errorBody);
    } catch {}
    return {
      ok: false,
      status: sponsorRes.status,
      error: parsed.message ?? `Sponsorship failed (${sponsorRes.status})`,
    };
  }

  const { data } = await sponsorRes.json();
  return { ok: true, bytes: data.bytes, digest: data.digest };
}

/**
 * Deliver-first: call upstream BEFORE building any payment.
 * If upstream fails, user is never charged.
 *
 * Safety order:
 * 1. Check USDC balance (prevent $0 users from getting free services)
 * 2. Check daily/monthly spending limits
 * 3. Call upstream service
 * 4. Compose payment tx via composeTx + sponsor
 */
async function handleDeliverFirst(
  mapping: GatewayMapping,
  serviceBody: Record<string, unknown>,
  serviceId: string,
  address: string,
  jwt: string | null,
): Promise<NextResponse> {
  const internalUrl = mapping.deliverFirst!.internalUrl;
  const internalKey = getInternalApiKey();

  if (!internalKey) {
    console.error('[services/prepare] INTERNAL_API_KEY not configured');
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  const parsedPrice = parseFloat(mapping.price);
  const estimatedCostUsd = (serviceBody as { unitPrice?: number }).unitPrice
    ? parseFloat(String((serviceBody as { unitPrice?: number }).unitPrice))
    : isNaN(parsedPrice) ? 1.0 : parsedPrice;

  const coins = await client.getCoins({ owner: address, coinType: USDC_TYPE });
  const totalBalance = coins.data.reduce(
    (sum, c) => sum + BigInt(c.balance),
    BigInt(0),
  );
  const requiredRaw = BigInt(Math.ceil(estimatedCostUsd * 10 ** USDC_DECIMALS));
  if (totalBalance < requiredRaw) {
    const balanceUsd = Number(totalBalance) / 10 ** USDC_DECIMALS;
    return NextResponse.json(
      { error: `Insufficient USDC balance ($${balanceUsd.toFixed(2)}) for $${estimatedCostUsd.toFixed(2)} purchase` },
      { status: 400 },
    );
  }

  const limitCheck = await checkSpendingLimits(address, estimatedCostUsd);
  if (limitCheck) {
    return NextResponse.json({ error: limitCheck }, { status: 429 });
  }

  console.log(`[services/prepare] Deliver-first: balance OK ($${(Number(totalBalance) / 10 ** USDC_DECIMALS).toFixed(2)}), calling ${internalUrl}`);

  const deliverRes = await fetch(internalUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': internalKey,
    },
    body: JSON.stringify(serviceBody),
  });

  if (!deliverRes.ok) {
    const errData = await deliverRes.json().catch(() => ({ error: 'Service delivery failed' }));
    const msg = (errData as { error?: string }).error ?? `Service failed (${deliverRes.status})`;
    console.error(`[services/prepare] Deliver-first failed (${deliverRes.status}):`, msg);
    return NextResponse.json({ error: msg }, { status: deliverRes.status >= 500 ? 502 : deliverRes.status });
  }

  const deliverData = (await deliverRes.json()) as {
    success: boolean;
    result: unknown;
    payment: { recipient: string; currency: string; amount: string };
  };

  if (!deliverData.success || !deliverData.payment) {
    return NextResponse.json({ error: 'Internal endpoint returned unexpected format' }, { status: 502 });
  }

  const { recipient, currency, amount: chargeAmount } = deliverData.payment;

  if (currency !== USDC_TYPE) {
    console.error(`[services/prepare] Unsupported payment currency: ${currency} (only USDC supported)`);
    return NextResponse.json(
      { error: 'Unsupported payment currency from upstream service' },
      { status: 502 },
    );
  }

  console.log(`[services/prepare] Deliver-first succeeded, composing payment tx: $${chargeAmount} → ${recipient}`);

  recordPurchase(address, serviceId, parseFloat(chargeAmount), String(serviceBody.productId ?? '')).catch(() => {});

  const sponsor = await composeAndSponsor(address, recipient, parseFloat(chargeAmount), jwt);
  if (!sponsor.ok) {
    return NextResponse.json(
      { error: sponsor.error },
      { status: sponsor.status >= 500 ? 502 : sponsor.status },
    );
  }

  return NextResponse.json({
    bytes: sponsor.bytes,
    digest: sponsor.digest,
    meta: {
      serviceId,
      gatewayUrl: mapping.url,
      serviceBody: JSON.stringify(serviceBody),
      price: chargeAmount,
      address,
      preDeliveredResult: deliverData.result,
    },
  });
}

/**
 * Standard MPP: pre-flight → 402 challenge → build payment tx via composeTx.
 * Service is called AFTER payment in the complete route.
 */
async function handleStandardMpp(
  mapping: GatewayMapping,
  serviceBody: Record<string, unknown>,
  serviceId: string,
  address: string,
  jwt: string | null,
): Promise<NextResponse> {
  const challengeRes = await fetch(mapping.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceBody),
  });

  if (challengeRes.status !== 402) {
    if (challengeRes.ok) {
      console.log(`[services/prepare] ${serviceId} returned ${challengeRes.status} (free path) — no payment required`);
      const result = await challengeRes.json().catch(() => challengeRes.text());
      return NextResponse.json({
        success: true,
        paymentDigest: 'free',
        price: '0',
        serviceId,
        result,
      });
    }
    const errText = await challengeRes.text().catch(() => '');
    console.error(`[services/prepare] Gateway returned ${challengeRes.status}:`, errText);
    return NextResponse.json(
      { error: `Gateway error (${challengeRes.status})` },
      { status: challengeRes.status },
    );
  }

  let challenge: Challenge.Challenge;
  try {
    challenge = Challenge.fromResponse(challengeRes);
  } catch (err) {
    console.error('[services/prepare] Failed to parse 402 challenge:', err);
    return NextResponse.json(
      { error: 'Gateway returned 402 but challenge could not be parsed' },
      { status: 502 },
    );
  }

  const { amount: chargeAmount, currency, recipient: gatewayRecipient } = challenge.request as {
    amount: string;
    currency: string;
    recipient: string;
  };

  if (!gatewayRecipient || !chargeAmount || !currency) {
    console.error('[services/prepare] Challenge missing payment details:', challenge.request);
    return NextResponse.json(
      { error: 'Gateway challenge missing payment details' },
      { status: 502 },
    );
  }

  if (currency !== USDC_TYPE) {
    console.error(`[services/prepare] Unsupported payment currency: ${currency} (only USDC supported)`);
    return NextResponse.json(
      { error: 'Unsupported payment currency from gateway' },
      { status: 502 },
    );
  }

  const sponsor = await composeAndSponsor(address, gatewayRecipient, parseFloat(chargeAmount), jwt);
  if (!sponsor.ok) {
    return NextResponse.json(
      { error: sponsor.error },
      { status: sponsor.status >= 500 ? 502 : sponsor.status },
    );
  }

  return NextResponse.json({
    bytes: sponsor.bytes,
    digest: sponsor.digest,
    meta: {
      serviceId,
      gatewayUrl: mapping.url,
      serviceBody: JSON.stringify(serviceBody),
      price: chargeAmount,
      address,
    },
  });
}

/**
 * Check if a user has exceeded daily or monthly spending limits.
 * Returns an error message if exceeded, null if within limits.
 */
async function checkSpendingLimits(address: string, amountUsd: number): Promise<string | null> {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dailySpend, monthlySpend] = await Promise.all([
      prisma.servicePurchase.aggregate({
        where: { address, createdAt: { gte: dayAgo } },
        _sum: { amountUsd: true },
      }),
      prisma.servicePurchase.aggregate({
        where: { address, createdAt: { gte: monthAgo } },
        _sum: { amountUsd: true },
      }),
    ]);

    const dailyTotal = (dailySpend._sum.amountUsd ?? 0) + amountUsd;
    const monthlyTotal = (monthlySpend._sum.amountUsd ?? 0) + amountUsd;

    if (dailyTotal > DAILY_PURCHASE_LIMIT_USD) {
      return `Daily purchase limit reached ($${DAILY_PURCHASE_LIMIT_USD}/day). You've spent $${(dailyTotal - amountUsd).toFixed(2)} today. Try again tomorrow.`;
    }

    if (monthlyTotal > MONTHLY_PURCHASE_LIMIT_USD) {
      return `Monthly purchase limit reached ($${MONTHLY_PURCHASE_LIMIT_USD}/month). You've spent $${(monthlyTotal - amountUsd).toFixed(2)} this month.`;
    }

    return null;
  } catch (err) {
    console.error('[services/prepare] Spending limit check failed:', err);
    return null;
  }
}

async function recordPurchase(
  address: string,
  serviceId: string,
  amountUsd: number,
  productId?: string,
): Promise<void> {
  const label = serviceId.replace(/[-_]/g, ' ');
  await prisma.$transaction([
    prisma.servicePurchase.create({
      data: { address, serviceId, amountUsd, productId: productId || null },
    }),
    prisma.appEvent.create({
      data: {
        address,
        type: 'pay',
        title: `Paid $${amountUsd.toFixed(3)} for ${label}`,
        details: { service: serviceId, amount: amountUsd, productId: productId || undefined },
      },
    }),
  ]);
}
