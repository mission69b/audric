import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Credential, Method } from 'mppx';
import { suiCharge } from '@suimpp/mpp/client';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { GATEWAY_BASE } from '@/lib/service-gateway';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';

export const runtime = 'nodejs';

const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const INTERNAL_API_KEY = env.INTERNAL_API_KEY ?? '';

const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/services/complete
 *
 * 1. Submits the signed payment tx via Enoki
 * 2. Waits for on-chain confirmation
 * 3. Calls the MPP gateway with the payment credential
 * 4. Returns the service result
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 500 });
  }

  let body: {
    signature: string;
    digest: string;
    meta: {
      serviceId: string;
      gatewayUrl: string;
      serviceBody: string;
      price: string;
      address?: string;
      preDeliveredResult?: unknown;
    };
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { signature, digest, meta } = body;

  if (!signature || !digest || !meta?.gatewayUrl) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 5 completions per minute per digest prefix
  const rl = rateLimit(`svc-complete:${digest.slice(0, 16)}`, 5, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  let confirmedPaymentDigest: string | null = null;

  try {
    const executeRes = await fetch(
      `${ENOKI_BASE}/transaction-blocks/sponsor/${encodeURIComponent(digest)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ENOKI_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ signature }),
      },
    );

    if (!executeRes.ok) {
      const errorBody = await executeRes.text().catch(() => '');
      console.error(`[services/complete] Payment execution error (${executeRes.status}):`, errorBody);
      let parsed: { message?: string } = {};
      try { parsed = JSON.parse(errorBody); } catch {}
      return NextResponse.json(
        { error: parsed.message ?? 'Payment execution failed' },
        { status: executeRes.status >= 500 ? 502 : executeRes.status },
      );
    }

    const paymentResult = await executeRes.json();
    confirmedPaymentDigest = paymentResult.data?.digest ?? digest;

    console.log(`[services/complete] Payment executed: ${confirmedPaymentDigest}, waiting for confirmation...`);

    await client.waitForTransaction({
      digest: confirmedPaymentDigest!,
      options: { showEffects: true },
    });

    if (meta.preDeliveredResult) {
      console.log(`[services/complete] Payment confirmed — returning pre-delivered result (deliver-first flow)`);

      logToGateway(meta.serviceId, meta.price, confirmedPaymentDigest!).catch(() => {});

      if (meta.address) {
        backfillDigest(meta.address, confirmedPaymentDigest!).catch((err) =>
          console.error('[services/complete] backfillDigest failed:', err),
        );
      }

      return NextResponse.json({
        success: true,
        paymentDigest: confirmedPaymentDigest,
        price: meta.price,
        serviceId: meta.serviceId,
        result: meta.preDeliveredResult,
      });
    }

    console.log(`[services/complete] Payment confirmed on-chain, calling gateway...`);

    const gatewayResult = await callGateway(confirmedPaymentDigest!, meta);

    if (gatewayResult.status === 200 && meta.address) {
      recordPurchase(meta.address, meta.serviceId, parseFloat(meta.price), confirmedPaymentDigest!).catch((err) =>
        console.error('[services/complete] recordPurchase failed:', err),
      );
    }

    return gatewayResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Service execution failed';
    console.error('[services/complete] Error:', message);

    if (confirmedPaymentDigest) {
      return NextResponse.json(
        {
          error: message,
          paymentConfirmed: true,
          paymentDigest: confirmedPaymentDigest,
          meta,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function callGateway(
  paymentDigest: string,
  meta: { serviceId: string; gatewayUrl: string; serviceBody: string; price: string },
): Promise<NextResponse> {
  const mppClient = Method.toClient(suiCharge, {
    async createCredential({ challenge }) {
      return Credential.serialize({
        challenge,
        payload: { digest: paymentDigest },
      });
    },
  });

  const { Mppx } = await import('mppx/client');
  const mppx = Mppx.create({ methods: [mppClient] });

  const serviceResponse = await mppx.fetch(meta.gatewayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: meta.serviceBody,
  });

  const contentType = serviceResponse.headers.get('content-type') ?? '';
  let result: unknown;

  if (contentType.startsWith('image/') || contentType.startsWith('audio/')) {
    const buffer = await serviceResponse.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = contentType.split(';')[0].trim();
    const mediaType = contentType.startsWith('image/') ? 'image' : 'audio';
    result = { type: mediaType, dataUri: `data:${mimeType};base64,${base64}` };
    // [UX polish followup #2 diagnostic / 2026-05-12] Founder smoke
    // surfaced "Audio format not supported" in the browser even
    // though we built a dataUri. Log the raw bytes length + MIME so
    // we can see if the gateway is returning empty / undersized
    // audio bodies. Vercel function logs surface this for diagnosis.
    if (mediaType === 'audio') {
      console.log(
        `[services/complete] audio response: mime=${mimeType} bytes=${buffer.byteLength} base64Len=${base64.length} status=${serviceResponse.status}`,
      );
    }
  } else if (contentType.includes('application/json')) {
    result = await serviceResponse.json();
    // [UX polish followup #2 diagnostic / 2026-05-12] If a TTS endpoint
    // is being proxied through a JSON envelope (e.g. some gateways do
    // this for binary services) we'd see `result.audio` /
    // `result.data` / similar — not the dataUri shape the renderer
    // expects. Log the top-level keys so we can diagnose this case
    // without another smoke round-trip.
    if (meta.serviceId?.includes('audio/speech') || meta.serviceId?.includes('audio/transcriptions')) {
      const keys = result && typeof result === 'object' ? Object.keys(result as object) : null;
      console.log(
        `[services/complete] audio service returned JSON envelope: serviceId=${meta.serviceId} keys=${JSON.stringify(keys)} status=${serviceResponse.status}`,
      );
    }
  } else {
    result = await serviceResponse.text();
    // [UX polish followup #2 diagnostic / 2026-05-12] Same as above —
    // log if an audio-expecting endpoint returned plain text so we
    // know whether the gateway misset the content-type vs returned
    // an actual error string.
    if (meta.serviceId?.includes('audio/speech') || meta.serviceId?.includes('audio/transcriptions')) {
      const preview = typeof result === 'string' ? result.slice(0, 200) : '(non-string)';
      console.log(
        `[services/complete] audio service returned non-JSON text: serviceId=${meta.serviceId} contentType="${contentType}" preview=${JSON.stringify(preview)} status=${serviceResponse.status}`,
      );
    }
  }

  if (!serviceResponse.ok && serviceResponse.status !== 402) {
    const errMsg = typeof result === 'object' && result && 'error' in result
      ? (result as { error: string }).error
      : typeof result === 'object' && result && 'message' in result
        ? (result as { message: string }).message
        : 'Service request failed';
    console.error(
      `[services/complete] Gateway error (${serviceResponse.status}):`,
      errMsg,
    );
    return NextResponse.json(
      {
        error: errMsg,
        serviceStatus: serviceResponse.status,
        paymentConfirmed: true,
        paymentDigest,
        meta,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    paymentDigest,
    price: meta.price,
    serviceId: meta.serviceId,
    result,
  });
}

async function backfillDigest(address: string, digest: string): Promise<void> {
  const recent = await prisma.appEvent.findFirst({
    where: { address, type: 'pay', digest: null },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) {
    await prisma.appEvent.update({ where: { id: recent.id }, data: { digest } });
  }
}

async function recordPurchase(
  address: string,
  serviceId: string,
  amountUsd: number,
  paymentDigest: string,
): Promise<void> {
  const label = serviceId.replace(/[-_]/g, ' ');
  await prisma.$transaction([
    prisma.servicePurchase.create({
      data: { address, serviceId, amountUsd },
    }),
    prisma.appEvent.create({
      data: {
        address,
        type: 'pay',
        title: `Paid $${amountUsd.toFixed(3)} for ${label}`,
        details: { service: serviceId, amount: amountUsd },
        digest: paymentDigest,
      },
    }),
  ]);
}

async function logToGateway(serviceId: string, amount: string, digest: string): Promise<void> {
  const serviceMap: Record<string, { service: string; endpoint: string }> = {
    'lob-postcard': { service: 'lob', endpoint: '/v1/postcards' },
    'lob-letter': { service: 'lob', endpoint: '/v1/letters' },
    'printful-order': { service: 'printful', endpoint: '/v1/order' },
  };

  let info = serviceMap[serviceId];

  if (!info) {
    try {
      const url = new URL(serviceId);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        info = { service: parts[0], endpoint: '/' + parts.slice(1).join('/') };
      }
    } catch {
      const stripped = serviceId.replace(/^\/+/, '');
      const parts = stripped.split('/');
      if (parts.length >= 2) {
        info = { service: parts[0], endpoint: '/' + parts.slice(1).join('/') };
      }
    }
  }

  if (!info) return;

  await fetch(`${GATEWAY_BASE}/api/internal/log-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_API_KEY,
    },
    body: JSON.stringify({ ...info, amount, digest }),
  });
}
