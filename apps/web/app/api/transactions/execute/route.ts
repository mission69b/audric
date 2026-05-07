import { NextRequest, NextResponse } from 'next/server';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { env } from '@/lib/env';
import {
  parseEnokiErrorBody,
  isExpiredSessionError,
  SESSION_EXPIRED_USER_MESSAGE,
  SESSION_EXPIRED_RESPONSE_CODE,
} from '@/lib/enoki-error';

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

      // [S18-F2 + S18-F7] Enoki's `code: 'expired'` and `code: 'jwt_error'`
      // both indicate a dead zkLogin session — surface as 401 + actionable
      // copy so the chat surface narrates the recovery path instead of
      // "NAVI 400" or "no applicable key found in the JSON Web Key Set".
      // Detection logic + copy live in `lib/enoki-error.ts` (shared with
      // the prepare route — single source of truth for both surfaces).
      const enoki = parseEnokiErrorBody(errorBody);

      if (isExpiredSessionError(enoki)) {
        return NextResponse.json(
          {
            error: SESSION_EXPIRED_USER_MESSAGE,
            code: SESSION_EXPIRED_RESPONSE_CODE,
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
        { error: enoki.message ?? `Execution failed (${res.status})` },
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
