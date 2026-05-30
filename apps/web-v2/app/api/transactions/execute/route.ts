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

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { redactPII } from "@/lib/audric/log-redact";
import {
  EnokiSponsorError,
  getSponsor,
  SponsorSettlementError,
} from "@/lib/audric/sponsor";
import { env } from "@/lib/env";
import { createSuiRpcClient } from "@/lib/sui-rpc";

export const maxDuration = 60;

const executeBodySchema = z.object({
  digest: z.string().min(1, "digest must be a non-empty string"),
  signature: z.string().min(1, "signature must be a non-empty string"),
  // Which sponsorship strategy `/prepare` used. Defaults to `enoki` for
  // backward compatibility with any in-flight client that predates the
  // self-sponsor router.
  mode: z.enum(["enoki", "self"]).default("enoki"),
  // Self mode only — the full tx bytes + sponsor's gas signature that
  // `/prepare` returned. Round-tripped through the client (neither is
  // secret) so this route stays stateless.
  bytes: z.string().optional(),
  sponsorSignature: z.string().optional(),
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

  // Retrying BlockVision-routed client — the previous public-fullnode
  // client 429'd under load on settlement + self-sponsor submit.
  const suiClient = createSuiRpcClient();

  // Dispatch to the strategy `/prepare` selected. `enoki` co-signs +
  // submits via Enoki's REST endpoint; `self` submits both signatures
  // (user + our gas sponsor) straight to the fullnode. Both settle the
  // digest and return balance/object changes for the LLM narration.
  const sponsor = getSponsor(body.mode);
  try {
    const result = await sponsor.execute({
      client: suiClient,
      digest: body.digest,
      signature: body.signature,
      bytes: body.bytes,
      sponsorSignature: body.sponsorSignature,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof EnokiSponsorError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SponsorSettlementError) {
      // [Phase 5.5 / D-17] settlement errors can carry the submitter or
      // recipient address inside the JSON-RPC error envelope.
      console.error("[execute] settlement failed:", redactPII(err));
      // Surface the digest so the client can poll independently or pass
      // it back to the LLM ("your tx is pending, digest: X").
      return NextResponse.json(
        { error: err.message, digest: err.digest },
        { status: 504 }
      );
    }
    console.error(`[execute] ${body.mode} execute failed:`, redactPII(err));
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Execution failed" },
      { status: 502 }
    );
  }
}
