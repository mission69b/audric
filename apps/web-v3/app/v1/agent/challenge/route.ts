import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { issueNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";

// POST /v1/agent/challenge { address } → { nonce, expiresAt }
// Agent ID Phase A — step 1 of headless key minting. Issues a single-use,
// 5-min challenge the keypair signs to prove it owns `address`. Public (no
// auth) — a nonce is worthless without the matching signature.
export async function POST(request: Request) {
  let address: string;
  try {
    const body = await request.json();
    address = String(body?.address ?? "").trim();
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

  const issued = await issueNonce(normalizeSuiAddress(address));
  if (!issued) {
    return openAiError(
      503,
      "Agent auth is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }
  return Response.json(issued);
}
