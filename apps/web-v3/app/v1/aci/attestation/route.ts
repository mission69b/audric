import {
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
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const model = new URL(request.url).searchParams.get("model");
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
  });
}
