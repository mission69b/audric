import { openAiError } from "@/lib/api/keys";
import { isConfidentialConfigured } from "@/lib/api/providers";
import { env } from "@/lib/env";

// GET /v1/aci/sessions/{id} — fetch the attested-session record a confidential
// receipt references (SPEC_CONFIDENTIAL_API v3.0). Passthrough to the
// Phala/RedPill ACI gateway. A receipt's `upstream.verified.session_id` (`as_…`)
// resolves here to the verified upstream channel: its identity + endpoint, the
// enforced channel binding (TLS SPKI or E2EE key), the typed TCB claims (each
// with an honest source), and the byte-preserving evidence — the deep-audit
// record behind a confidential response. Content-addressed + immutable.
const ACI_BASE = "https://inference.phala.com";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return openAiError(
      400,
      "A session id is required.",
      "invalid_request_error",
      "invalid_session_id"
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
  try {
    const res = await fetch(
      `${ACI_BASE}/v1/aci/sessions/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` } }
    );
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return openAiError(
      502,
      "Could not fetch the session.",
      "api_error",
      "session_unavailable"
    );
  }
}
