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
import {
  emitExecuteDuration,
  emitEnokiExecuteDuration,
  emitSuiWaitDuration,
} from '@/lib/engine/txn-metrics';

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
  // [S.126 Tier 1] Stamp request entry timestamp BEFORE any work — full
  // route handler latency. Together with `enoki_execute_ms` and `sui_wait_ms`
  // we can attribute the perceived "execute black box" to one of:
  //   1. Enoki round-trip (sponsor co-sign + chain submit on their side)
  //   2. waitForTransaction (Sui checkpoint settlement on RPC poll)
  //   3. our route overhead (validation + JSON serialization)
  const startedAt = Date.now();
  const finish = (outcome: Parameters<typeof emitExecuteDuration>[0]['outcome']) => {
    emitExecuteDuration({ durationMs: Date.now() - startedAt, outcome });
  };

  if (!ENOKI_SECRET_KEY) {
    finish('execute_error');
    return NextResponse.json({ error: 'Sponsorship service not configured' }, { status: 500 });
  }

  let body: { digest?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    finish('execute_error');
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { digest, signature } = body;

  if (!digest || typeof digest !== 'string') {
    finish('execute_error');
    return NextResponse.json({ error: 'Missing digest' }, { status: 400 });
  }
  if (!signature || typeof signature !== 'string') {
    finish('execute_error');
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  // 10 executions per minute per digest prefix (approximates per-user)
  const rl = rateLimit(`exec:${digest.slice(0, 16)}`, 10, 60_000);
  if (!rl.success) {
    finish('execute_error');
    return rateLimitResponse(rl.retryAfterMs!);
  }

  try {
    // [S.126 Tier 1] Just the Enoki execute round-trip. This is co-sign +
    // submit-to-chain on Enoki's side — distinct from our subsequent
    // `waitForTransaction` poll which waits for the digest to land in a
    // confirmed Sui checkpoint.
    const enokiStartedAt = Date.now();
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
    emitEnokiExecuteDuration({
      durationMs: Date.now() - enokiStartedAt,
      ok: res.ok,
    });

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
        finish('session_expired');
        return NextResponse.json(
          {
            error: SESSION_EXPIRED_USER_MESSAGE,
            code: SESSION_EXPIRED_RESPONSE_CODE,
          },
          { status: 401 },
        );
      }

      if (res.status === 404) {
        finish('execute_error');
        return NextResponse.json(
          { error: 'Sponsored transaction expired or not found' },
          { status: 404 },
        );
      }

      finish('execute_error');
      return NextResponse.json(
        { error: enoki.message ?? `Execution failed (${res.status})` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const { data } = await res.json();
    const confirmedDigest = data.digest;

    // [S.126 Tier 1] `waitForTransaction` is the prime suspect for the
    // 60-80s "execute black box" we saw in the manual smoke. Polls Sui RPC
    // until the digest appears in a confirmed checkpoint. Under network
    // or RPC slowness can hang significantly past typical 0.5-2s
    // checkpoint cadence. If `sui_wait_ms` p95 dominates `execute_duration_ms`
    // in the next smoke, that's the optimization target (RPC failover or
    // dropping `objectChanges` from the options).
    const waitStartedAt = Date.now();
    let txResult: Awaited<ReturnType<typeof suiClient.waitForTransaction>>;
    try {
      txResult = await suiClient.waitForTransaction({
        digest: confirmedDigest,
        options: { showEffects: true, showBalanceChanges: true, showObjectChanges: true },
      });
      emitSuiWaitDuration({ durationMs: Date.now() - waitStartedAt, ok: true });
    } catch (waitErr) {
      emitSuiWaitDuration({ durationMs: Date.now() - waitStartedAt, ok: false });
      throw waitErr;
    }

    finish('success');
    return NextResponse.json({
      digest: confirmedDigest,
      balanceChanges: txResult.balanceChanges ?? [],
      objectChanges: txResult.objectChanges ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction execution failed';
    console.error('[execute] Error:', message);
    finish('execute_error');
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
