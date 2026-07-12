import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildRenounceOwnershipTx } from "@t2000/id";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/owner/renounce { owner, agent } → { nonce, txBytes }
// The confirmed OWNER walks away (registry v2 `renounce_ownership`, S.691) —
// the record returns to autonomous. Owner-signed + sponsored; the reverse of
// confirm. Re-linking is the normal two-sided flow (agent proposes again).
// The owner signs the returned bytes → /v1/agent/owner/submit.
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

  let owner: string;
  let agent: string;
  try {
    const body = await request.json();
    owner = normalizeSuiAddress(String(body?.owner ?? "").trim());
    agent = normalizeSuiAddress(String(body?.agent ?? "").trim());
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!(isValidSuiAddress(owner) && isValidSuiAddress(agent))) {
    return openAiError(
      400,
      "Valid owner + agent Sui addresses are required.",
      "invalid_request_error",
      "invalid_address"
    );
  }

  const res = await prepareSponsoredTx(owner, buildRenounceOwnershipTx(agent), {
    kind: "owner-renounce",
    agent,
    owner,
  });
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
    "Could not prepare — are you this agent's confirmed owner?",
    "invalid_request_error",
    "prepare_failed"
  );
}
