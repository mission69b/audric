import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildSetActiveTx } from "@t2000/id";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/active/prepare { address, active } → { nonce, txBytes }
// Registry `set_active` (agent-signed, sponsored — 0-SUI agents included).
// The signer must be the agent itself or its confirmed owner (enforced
// on-chain); we build with sender = the provided address, so the caller signs
// as that identity. Pairs with /active/submit.
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
      "Agent updates are temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }

  let address: string;
  let active: boolean;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    active = Boolean(body?.active);
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
      "A valid agent Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }

  const tx = buildSetActiveTx(address, active);
  const res = await prepareSponsoredTx(address, tx, {
    kind: "active",
    active,
  });
  if (res.ok) {
    return Response.json({ nonce: res.nonce, txBytes: res.txBytes });
  }
  if (res.reason === "unconfigured") {
    return openAiError(
      503,
      "Agent updates are temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }
  return openAiError(
    400,
    "Could not prepare — is this agent registered?",
    "invalid_request_error",
    "prepare_failed"
  );
}
