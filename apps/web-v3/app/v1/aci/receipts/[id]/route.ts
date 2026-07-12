import { getReceiptBody } from "@/lib/api/anchor";
import { openAiError } from "@/lib/api/keys";
import { isConfidentialConfigured } from "@/lib/api/providers";
import { env } from "@/lib/env";

// GET /v1/aci/receipts/{id} — fetch the signed per-response receipt for a
// confidential call (SPEC_CONFIDENTIAL_API v3.0, Phase B). Passthrough to the
// Phala/RedPill ACI gateway, which signs each receipt with a `receipt_signing_keys`
// entry from the attestation (verifiable via GET /v1/aci/attestation). The
// receipt commits the request/response hashes (not bodies) to the attested
// workload. `{id}` is the `x-receipt-id` returned by a confidential completion.
const ACI_BASE = "https://inference.phala.com";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return openAiError(
      400,
      "A receipt id is required.",
      "invalid_request_error",
      "invalid_receipt_id"
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
      `${ACI_BASE}/v1/aci/receipts/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${env.PHALA_API_KEY}` } }
    );
    if (res.ok) {
      return new Response(res.body, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type") ?? "application/json",
        },
      });
    }
    // Gateway TTL expired (or miss) → serve our durably-stored copy if we have
    // one (SPEC_CONFIDENTIAL_UI §3). Still trustless: the receipt is signed +
    // its hash anchored on-chain, so it can't be forged wherever it's served.
    const durable = await getReceiptBody(id);
    if (durable) {
      return new Response(durable, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(res.body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    // Upstream errored — last-chance durable fallback.
    const durable = await getReceiptBody(id);
    if (durable) {
      return new Response(durable, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return openAiError(
      502,
      "Could not fetch the receipt.",
      "api_error",
      "receipt_unavailable"
    );
  }
}
