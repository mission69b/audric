import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildConfirmOwnershipTx } from "@t2000/id";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/owner/confirm { owner, agent } → { nonce, txBytes }
// Agent ID gate 7 (step 2, owner side). The proposed OWNER confirms ownership of
// `agent` (on-chain `sender == pending_owner`). Sponsored; the owner signs the
// returned bytes → /submit. (Human Passport owners confirm via the console UI —
// gate 8; this serves keypair owners + the CLI.)
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

  const res = await prepareSponsoredTx(owner, buildConfirmOwnershipTx(agent), {
    kind: "owner-confirm",
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
    "Could not prepare — confirm that this agent proposed you as its owner.",
    "invalid_request_error",
    "prepare_failed"
  );
}
