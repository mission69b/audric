import { createApiKey } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  agentKeyChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { canUseApi, generateApiKey, openAiError } from "@/lib/api/keys";
import { getCreditBalanceMicros, getUserById } from "@/lib/db/queries";

// POST /v1/agent/keys { address, nonce, signature } → { key, prefix }
// Agent ID Phase A — mint an API key for a keypair agent, headless. Proves
// address ownership via a single-use signed challenge, then mints against the
// SAME credit gate as the console (must be funded first via /v1/agent/topup).
// The secret is returned ONCE.
export async function POST(request: Request) {
  let address: string;
  let nonce: string;
  let signature: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
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
  // Verify the signature proves ownership of `address` (message action-bound).
  const valid = await verifyAgentSignature({
    address,
    message: agentKeyChallengeMessage(nonce),
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

  // The account must exist + be funded (fund via /v1/agent/topup first). Same
  // gate the console key-issuance uses (canUseApi = credit OR a paid plan).
  const account = await getUserById(address);
  if (!account) {
    return openAiError(
      402,
      "Fund this address first via /v1/agent/topup.",
      "insufficient_quota",
      "account_unfunded"
    );
  }
  const balance = await getCreditBalanceMicros(address);
  if (!canUseApi(account.subscriptionTier, balance)) {
    return openAiError(
      402,
      "Add credit via /v1/agent/topup before minting a key.",
      "insufficient_quota",
      "insufficient_credit"
    );
  }

  const { secret, hashedKey, keyPrefix } = generateApiKey();
  await createApiKey({
    userId: address,
    hashedKey,
    keyPrefix,
    name: "Agent key",
  });
  return Response.json({ key: secret, prefix: keyPrefix });
}
