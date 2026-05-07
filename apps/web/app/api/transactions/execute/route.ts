import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { env } from '@/lib/env';

const ENOKI_SECRET_KEY = env.ENOKI_SECRET_KEY;
const ENOKI_BASE = 'https://api.enoki.mystenlabs.com/v1';
const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK;
const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(SUI_NETWORK), network: SUI_NETWORK });

/**
 * POST /api/transactions/execute
 *
 * Submits a user-signed sponsored transaction to Enoki for execution.
 *
 * The client signs the sponsored tx bytes locally (non-custodial),
 * then sends { digest, signature } here. The server forwards to
 * Enoki which co-signs with the gas sponsor and submits to Sui.
 */
export async function POST(request: NextRequest) {
  if (!ENOKI_SECRET_KEY) {
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  let body: { digest?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { digest, signature } = body;

  if (!digest || typeof digest !== 'string') {
    return NextResponse.json({ error: 'Missing digest' }, { status: 400 });
  }
  if (!signature || typeof signature !== 'string') {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // 10 executions per minute per digest prefix (approximates per-user)
  const rl = rateLimit(`exec:${digest.slice(0, 16)}`, 10, 60_000);
  if (!rl.success) return rateLimitResponse(rl.retryAfterMs!);

  try {
    const res = await fetch(
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

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      console.error(`[execute] Enoki error (${res.status}):`, errorBody);

      // Enoki error envelope is `{ errors: [{ code, message }] }`. The
      // pre-S18-F2 code parsed `parsed.message` (always undefined) and fell
      // back to a generic "Execution failed (400)" — the engine had nothing
      // useful to narrate, so the agent confabulated "NAVI returned a 400".
      let enokiCode: string | undefined;
      let enokiMessage: string | undefined;
      try {
        const parsed = JSON.parse(errorBody) as {
          errors?: Array<{ code?: string; message?: string }>;
          message?: string;
        };
        enokiCode = parsed.errors?.[0]?.code;
        enokiMessage = parsed.errors?.[0]?.message ?? parsed.message;
      } catch {}

      // [S18-F2] Enoki's `code: 'expired'` is misleading — the message reads
      // "Sponsored transaction has expired", but in practice it fires when
      // the `zklogin-jwt` header on the prior `/sponsor` request was stale.
      // Time between prepare + execute is < 2s in our flow (well under any
      // reasonable sponsorship-blob TTL), and a fresh sign-in immediately
      // succeeds with the same code. Return 401 + actionable copy so the
      // chat surface narrates the recovery path instead of "NAVI 400".
      if (enokiCode === 'expired') {
        return NextResponse.json(
          {
            error: 'Your sign-in session has expired. Please sign out and sign back in to continue.',
            code: 'session_expired',
          },
          { status: 401 },
        );
      }

      if (res.status === 404) {
        return NextResponse.json(
          { error: 'Sponsored transaction expired or not found' },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: enokiMessage ?? `Execution failed (${res.status})` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const { data } = await res.json();
    const confirmedDigest = data.digest;

    const txResult = await suiClient.waitForTransaction({
      digest: confirmedDigest,
      options: { showEffects: true, showBalanceChanges: true, showObjectChanges: true },
    });

    return NextResponse.json({
      digest: confirmedDigest,
      balanceChanges: txResult.balanceChanges ?? [],
      objectChanges: txResult.objectChanges ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction execution failed';
    console.error('[execute] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
