/**
 * POST /api/transactions/execute — Phase 3 Day 3b
 *
 * Submits a user-signed sponsored transaction to Enoki for co-sign +
 * execution. Counterpart to `/api/transactions/prepare`.
 *
 * Flow per write tool:
 *   1. Client calls `/api/transactions/prepare` with the write input
 *      → receives `{ bytes, digest }`.
 *   2. Client signs `bytes` locally with the zkLogin ephemeral key
 *      (non-custodial — Audric Passport pillar).
 *   3. Client posts `{ digest, signature }` here.
 *   4. Server forwards to Enoki's
 *      `transaction-blocks/sponsor/${digest}` execute endpoint.
 *      Enoki co-signs with the gas sponsor + submits to Sui.
 *   5. Server waits for the digest to settle in a confirmed Sui
 *      checkpoint, then returns `{ digest, balanceChanges,
 *      objectChanges }`.
 *
 * --- PORT NOTES (legacy → web-v2) ---
 *
 * Near-verbatim port from `apps/web/app/api/transactions/execute/route.ts`
 * (170 LoC). Day 3b drops the metrics dependencies
 * (`emitExecuteDuration`, `emitEnokiExecuteDuration`,
 * `emitSuiWaitDuration`) and rate-limit infra — both come back in
 * Phase 4 with the broader telemetry pass-through. The actual Enoki
 * + Sui round-trip logic is preserved verbatim.
 *
 * The `S18-F2 + S18-F7` expired-session error class (Enoki returns
 * `code: 'expired'` or `code: 'jwt_error'` when Google rotates JWKS
 * keys mid-session) currently surfaces as a generic 401/502 — Phase 4
 * ports `lib/enoki-error.ts` for actionable copy. Production smoke
 * has never hit this path in the legacy route (the legacy chat surface
 * shows a "session expired" toast on 401 already).
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 3 Day 3b" + S.175.
 */

import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { redactAddressesInText, redactPII } from "@/lib/audric/log-redact";
import { env } from "@/lib/env";

export const maxDuration = 60;

const ENOKI_BASE = "https://api.enoki.mystenlabs.com/v1";

const executeBodySchema = z.object({
  digest: z.string().min(1, "digest must be a non-empty string"),
  signature: z.string().min(1, "signature must be a non-empty string"),
});

export async function POST(request: NextRequest) {
  if (!env.ENOKI_SECRET_KEY) {
    return NextResponse.json(
      { error: "Sponsorship service not configured" },
      { status: 500 }
    );
  }

  let body: z.infer<typeof executeBodySchema>;
  try {
    const json = await request.json();
    body = executeBodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  const { digest, signature } = body;
  const network = env.NEXT_PUBLIC_SUI_NETWORK as
    | "mainnet"
    | "testnet"
    | "devnet"
    | "localnet";
  const suiClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(network),
    network,
  });

  // 1. Forward to Enoki's execute endpoint. Enoki co-signs with the
  // gas sponsor and submits the joined signature to Sui. The response
  // carries the confirmed digest (same as the input digest when the
  // sponsor sig was correctly stored at prepare time).
  const enokiRes = await fetch(
    `${ENOKI_BASE}/transaction-blocks/sponsor/${encodeURIComponent(digest)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.ENOKI_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signature }),
    }
  );

  if (!enokiRes.ok) {
    const errorBody = await enokiRes.text().catch(() => "");
    // [Phase 5.5 / D-17] Scrub embedded addresses from Enoki error
    // bodies. Enoki's failure responses commonly echo the sender or
    // sponsor addresses in plain text.
    console.error(
      `[execute] Enoki execute error (${enokiRes.status}):`,
      redactAddressesInText(errorBody)
    );

    if (enokiRes.status === 404) {
      return NextResponse.json(
        { error: "Sponsored transaction expired or not found" },
        { status: 404 }
      );
    }

    let parsed: { message?: string } = {};
    try {
      parsed = JSON.parse(errorBody) as { message?: string };
    } catch {
      // ignore — parsed stays empty
    }
    return NextResponse.json(
      { error: parsed.message ?? `Execution failed (${enokiRes.status})` },
      { status: enokiRes.status >= 500 ? 502 : enokiRes.status }
    );
  }

  const enokiPayload = (await enokiRes.json()) as { data: { digest: string } };
  const confirmedDigest = enokiPayload.data.digest;

  // 2. Wait for Sui to settle the digest in a confirmed checkpoint.
  // Returns balance/object changes for the LLM tool-result narration
  // (e.g. "Saved 0.01 USDC at 4.62% APY" derives from the savings-
  // position object change).
  let txResult: Awaited<ReturnType<typeof suiClient.waitForTransaction>>;
  try {
    txResult = await suiClient.waitForTransaction({
      digest: confirmedDigest,
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });
  } catch (err) {
    // [Phase 5.5 / D-17] waitForTransaction errors can carry the
    // submitter or recipient address inside the JSON-RPC error envelope.
    console.error("[execute] waitForTransaction failed:", redactPII(err));
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Transaction submitted but settlement timed out",
        // Surface the digest so the client can poll independently or
        // pass it back to the LLM ("your tx is pending, digest: X").
        digest: confirmedDigest,
      },
      { status: 504 }
    );
  }

  return NextResponse.json({
    digest: confirmedDigest,
    balanceChanges: txResult.balanceChanges ?? [],
    objectChanges: txResult.objectChanges ?? [],
  });
}
