import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  agentHandleChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import {
  agentDisplayHandle,
  agentHandle,
  isAgentIdentityConfigured,
  mintAgentHandle,
} from "@/lib/identity/agent-custody";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/handle { address, label, nonce, signature } → { handle, display, address, digest }
// Agent ID Phase B (gate 5a) — claim `<label>.agent-id.sui` → the agent's
// address. The agent proves it owns `address` via a single-use signed challenge
// (message bound to BOTH nonce + label); the custody key mints the leaf (the
// agent never needs SUI). Public machine endpoint (no session) on api.t2000.ai.
export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  if (!isAgentIdentityConfigured()) {
    return openAiError(
      503,
      "Agent handle minting is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }

  let address: string;
  let rawLabel: string;
  let nonce: string;
  let signature: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    rawLabel = String(body?.label ?? "");
    nonce = String(body?.nonce ?? "").trim();
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
  const check = validateAudricLabel(rawLabel);
  if (!check.valid) {
    return openAiError(
      400,
      "Invalid handle — 3–20 chars, lowercase letters/digits/hyphens (no leading/trailing/double hyphen).",
      "invalid_request_error",
      `invalid_label_${check.reason}`
    );
  }
  const label = check.label;
  if (isReserved(label)) {
    return openAiError(
      400,
      "That handle is reserved.",
      "invalid_request_error",
      "reserved_label"
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

  // Atomic single-use consume (replay/race-safe), bound to the address.
  const consumed = await consumeNonce(nonce, address);
  if (!consumed) {
    return openAiError(
      401,
      "Invalid or expired challenge — request a fresh nonce from /v1/agent/challenge.",
      "invalid_request_error",
      "invalid_nonce"
    );
  }
  // The signature proves ownership of `address` AND binds to this exact label.
  const valid = await verifyAgentSignature({
    address,
    message: agentHandleChallengeMessage(nonce, label),
    signature,
  });
  if (!valid) {
    return openAiError(
      401,
      "Signature does not match the address.",
      "invalid_request_error",
      "invalid_signature"
    );
  }

  try {
    const digest = await mintAgentHandle({ label, targetAddress: address });
    return Response.json({
      handle: agentHandle(label),
      display: agentDisplayHandle(label),
      address,
      digest,
    });
  } catch (e) {
    // The most common revert is the name already being taken (createLeafSubName
    // aborts). Log the raw cause server-side; don't leak Move internals.
    console.error("[agent-id] handle mint failed", e);
    return openAiError(
      409,
      "That handle is unavailable — it may already be taken.",
      "invalid_request_error",
      "handle_taken"
    );
  }
}
