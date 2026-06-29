import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { submitSponsoredRegister } from "@/lib/agent/register";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/register/submit { regNonce, address, agentSignature }
//   → { registered, alreadyRegistered, digest }
// Agent ID B.1 gate 5b (step 2). Loads the server-built bytes for regNonce,
// sponsor-co-signs the gas, and executes. Idempotent: a double-register is
// surfaced as `alreadyRegistered: true` (not an error).
export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let regNonce: string;
  let address: string;
  let agentSignature: string;
  try {
    const body = await request.json();
    regNonce = String(body?.regNonce ?? "").trim();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    agentSignature = String(body?.agentSignature ?? "").trim();
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
  if (!(regNonce && agentSignature)) {
    return openAiError(
      400,
      "regNonce and agentSignature are required.",
      "invalid_request_error",
      "bad_request"
    );
  }

  const result = await submitSponsoredRegister({
    regNonce,
    address,
    agentSignature,
  });
  if (!result.ok) {
    if (result.reason === "unconfigured") {
      return openAiError(
        503,
        "Agent registration is temporarily unavailable.",
        "api_error",
        "service_unavailable"
      );
    }
    if (result.reason === "expired") {
      return openAiError(
        409,
        "Registration challenge expired — call /v1/agent/register/prepare again.",
        "invalid_request_error",
        "expired"
      );
    }
    return Response.json(
      {
        error: result.error ?? "Registration failed.",
        code: "register_failed",
      },
      { status: 400 }
    );
  }
  return Response.json({
    registered: true,
    alreadyRegistered: result.alreadyRegistered,
    digest: result.digest,
  });
}
