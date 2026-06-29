import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  agentHandleReleaseChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import {
  agentHandle,
  isAgentIdentityConfigured,
  resolveAgentHandle,
  revokeAgentHandle,
} from "@/lib/identity/agent-custody";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/handle/release { address, label, nonce, signature } → { released, handle, digest }
// Agent ID item 2 — release (revoke) a handle you own. The agent proves it owns
// `address` (signed challenge, bound to nonce + label), AND the leaf must
// currently resolve to `address` (you can't release someone else's handle).
// Custody-signed revoke. To CHANGE a handle: release, then claim a new one.
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
  let label: string;
  let nonce: string;
  let signature: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    label = String(body?.label ?? "")
      .trim()
      .toLowerCase();
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
  if (!(label && nonce && signature)) {
    return openAiError(
      400,
      "label, nonce and signature are required.",
      "invalid_request_error",
      "bad_request"
    );
  }

  const consumed = await consumeNonce(nonce, address);
  if (!consumed) {
    return openAiError(
      401,
      "Invalid or expired challenge — request a fresh nonce from /v1/agent/challenge.",
      "invalid_request_error",
      "invalid_nonce"
    );
  }
  const valid = await verifyAgentSignature({
    address,
    message: agentHandleReleaseChallengeMessage(nonce, label),
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

  // Only the leaf's current target may release it.
  const target = await resolveAgentHandle(label);
  if (!target || normalizeSuiAddress(target) !== address) {
    return openAiError(
      403,
      "That handle does not resolve to your address.",
      "invalid_request_error",
      "not_owner"
    );
  }

  try {
    const digest = await revokeAgentHandle(label);
    return Response.json({
      released: true,
      handle: agentHandle(label),
      digest,
    });
  } catch (e) {
    console.error("[agent-id] handle release failed", e);
    return openAiError(
      502,
      "Could not release the handle — try again.",
      "api_error",
      "release_failed"
    );
  }
}
