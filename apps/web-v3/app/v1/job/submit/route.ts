import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { submitSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/job/submit { nonce, address, signature } → { digest }
//
// A2A escrow step 2: loads the server-built bytes for `nonce` (single-use,
// bound to the address that prepared them), sponsor-co-signs the gas, and
// executes. Move aborts surface as 400s with the node's message — the job
// object's own rules (state machine, clocks, caller auth) are the validation.
export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let nonce: string;
  let address: string;
  let signature: string;
  try {
    const body = await request.json();
    nonce = String(body?.nonce ?? "").trim();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    signature = String(body?.signature ?? "").trim();
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!isValidSuiAddress(address)) {
    return openAiError(
      400,
      "A valid Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }
  if (!(nonce && signature)) {
    return openAiError(
      400,
      "nonce and signature are required.",
      "invalid_request_error",
      "bad_request"
    );
  }

  const result = await submitSponsoredTx({
    nonce,
    actor: address,
    actorSignature: signature,
  });
  if (!result.ok) {
    if (result.reason === "unconfigured") {
      return openAiError(
        503,
        "Job transactions are temporarily unavailable.",
        "api_error",
        "service_unavailable"
      );
    }
    if (result.reason === "expired") {
      return openAiError(
        409,
        "Challenge expired — call /v1/job/prepare again.",
        "invalid_request_error",
        "expired"
      );
    }
    return openAiError(
      400,
      result.message,
      "invalid_request_error",
      result.reason === "aborted" ? "move_abort" : "execute_failed"
    );
  }

  return Response.json({ digest: result.digest });
}
