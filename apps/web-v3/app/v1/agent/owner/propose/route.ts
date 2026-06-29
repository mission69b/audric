import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildSetPendingOwnerTx } from "@t2000/id";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/owner/propose { address, owner } → { nonce, txBytes }
// Agent ID gate 7 (step 1, agent side). The AGENT proposes a Passport owner —
// two-sided: nothing binds until the owner confirms (prevents false claims).
// Sponsored (0-SUI agent ok); the agent signs the returned bytes → /submit.
export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  if (!isSponsorConfigured()) {
    return openAiError(
      503,
      "Agent ownership linking is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }

  let address: string;
  let owner: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    owner = normalizeSuiAddress(String(body?.owner ?? "").trim());
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!(isValidSuiAddress(address) && isValidSuiAddress(owner))) {
    return openAiError(
      400,
      "Valid agent + owner Sui addresses are required.",
      "invalid_request_error",
      "invalid_address"
    );
  }

  const res = await prepareSponsoredTx(address, buildSetPendingOwnerTx(owner));
  if (res.ok) {
    return Response.json({ nonce: res.nonce, txBytes: res.txBytes });
  }
  if (res.reason === "unconfigured") {
    return openAiError(
      503,
      "Agent ownership linking is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }
  return openAiError(
    400,
    "Could not prepare — is this agent registered? Run `t2 agent register` first.",
    "invalid_request_error",
    "prepare_failed"
  );
}
