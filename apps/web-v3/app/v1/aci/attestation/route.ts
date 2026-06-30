import { randomBytes } from "node:crypto";
import {
  fetchRawReport,
  isAttestationEnforced,
  verifyConfidentialUpstream,
} from "@/lib/api/attestation";
import { openAiError } from "@/lib/api/keys";
import { getApiModel } from "@/lib/api/models";
import {
  isConfidentialConfigured,
  isConfidentialModel,
} from "@/lib/api/providers";

// GET /v1/aci/attestation?model=<phala/*> — confidential-upstream attestation
// status for a model (SPEC_CONFIDENTIAL_API v3.0; RedPill-shaped `/v1/aci/*`
// route). Public transparency endpoint: reports whether a genuine, freshly-
// attested Phala GPU-TEE backs the model (verified via DCAP), plus the
// channel-binding (`tlsSpkiSha256`) + receipt-signing key for client-side
// verification. Cached (verify 10m / fail 60s) — no key required.
// (No `export const dynamic` — web-v3 uses Next `cacheComponents`, which
// rejects it; reading searchParams + fetching makes the route dynamic anyway.)
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const model = params.get("model");
  // Caller-supplied nonce → the full report's quote binds it (client freshness).
  // 32–64 hex bytes; reject anything else. When present (or ?full=true), we also
  // return the raw report so a client can DCAP-verify the quote itself.
  const rawNonce = params.get("nonce");
  const wantsFull = rawNonce !== null || params.get("full") === "true";
  if (rawNonce !== null && !/^[0-9a-fA-F]{32,128}$/.test(rawNonce)) {
    return openAiError(
      400,
      "`nonce` must be 16–64 bytes of hex.",
      "invalid_request_error",
      "invalid_nonce"
    );
  }
  if (!(model && isConfidentialModel(model))) {
    return openAiError(
      400,
      "`model` must be a confidential (phala/*) model — see GET /v1/models.",
      "invalid_request_error",
      "invalid_model"
    );
  }
  if (!isConfidentialConfigured()) {
    return openAiError(
      503,
      "The confidential tier is not configured.",
      "api_error",
      "model_unavailable"
    );
  }

  const upstream = getApiModel(model)?.upstream ?? model;
  const att = await verifyConfidentialUpstream(model, upstream);

  // The verifiable artifact: the full ACI report bound to the caller's nonce
  // (quote + keyset + endorsement + provenance + freshness). Workload keys are
  // nonce-stable, so the summary fields above stay consistent with it.
  let nonce: string | undefined;
  let report: Record<string, unknown> | null = null;
  if (wantsFull) {
    nonce = rawNonce ?? randomBytes(32).toString("hex");
    report = await fetchRawReport(upstream, nonce);
  }

  return Response.json({
    model: att.model,
    verified: att.verified,
    // Is a verification miss currently fail-closed (true) or observe-only (false)?
    enforced: isAttestationEnforced(),
    teeType: att.verified ? "tdx" : undefined,
    workloadId: att.workloadId,
    tlsSpkiSha256: att.tlsSpkiSha256,
    signingKey: att.signingKey,
    tcbStatus: att.tcbStatus,
    ...(att.reason ? { reason: att.reason } : {}),
    attestedAt: new Date(att.attestedAtMs).toISOString(),
    // Full client-verifiable report (only when ?nonce / ?full requested).
    ...(nonce ? { nonce } : {}),
    ...(report ? { report } : {}),
  });
}
