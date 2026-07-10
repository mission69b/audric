import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildSetActiveTx } from "@t2000/id";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/active/prepare { address, active, agent? } → { nonce, txBytes }
// Registry `set_active` (sponsored — 0-SUI agents included). The signer must
// be the agent itself or its confirmed owner (enforced on-chain). `address`
// is always the SIGNER; the optional `agent` targets an OWNED agent's record
// (owner-side kill switch, S.700) — omitted, the signer toggles itself.
// Pairs with /active/submit.
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
  let agent: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    active = Boolean(body?.active);
    // Owner-side toggle (S.700): `agent` = the OWNED record to flip; the
    // registry enforces signer == agent || signer == confirmed owner.
    agent = body?.agent
      ? normalizeSuiAddress(String(body.agent).trim())
      : address;
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!(isValidSuiAddress(address) && isValidSuiAddress(agent))) {
    return openAiError(
      400,
      "A valid agent Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }

  const tx = buildSetActiveTx(agent, active);
  const res = await prepareSponsoredTx(address, tx, {
    kind: "active",
    active,
    agent,
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
