import { upsertAgentProfile } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { prepareSponsoredRegister } from "@/lib/agent/register";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/register/prepare { address, mcpEndpoint?, paymentMethods?, did? }
//   → { regNonce, txBytes }
// Agent ID B.1 gate 5b (step 1). Server builds the sponsored register tx
// (sender = agent, gas owner = the t2000 sponsor) and stashes the exact bytes
// under a single-use regNonce; the agent signs `txBytes` then calls /submit.
// Public machine endpoint (the agent's signature over the tx IS the auth).
export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let address: string;
  let mcpEndpoint: string | null;
  let paymentMethods: string[];
  let did: string | null;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    mcpEndpoint =
      typeof body?.mcpEndpoint === "string" && body.mcpEndpoint.length > 0
        ? body.mcpEndpoint
        : null;
    paymentMethods = Array.isArray(body?.paymentMethods)
      ? body.paymentMethods.filter((m: unknown) => typeof m === "string")
      : [];
    did =
      typeof body?.did === "string" && body.did.length > 0 ? body.did : null;
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

  const prepared = await prepareSponsoredRegister({
    address,
    mcpEndpoint,
    paymentMethods,
    did,
  });
  if (!prepared.ok) {
    if (prepared.reason === "unconfigured") {
      return openAiError(
        503,
        "Agent registration is temporarily unavailable.",
        "api_error",
        "service_unavailable"
      );
    }
    return openAiError(
      502,
      "Could not prepare the registration transaction.",
      "api_error",
      "build_failed"
    );
  }
  // Idempotent: already on-chain → nothing to sign. Backfill the directory
  // index (covers agents registered before the index existed / via 3rd parties).
  if (prepared.alreadyRegistered) {
    await upsertAgentProfile({ address }).catch(() => undefined);
    return Response.json({ alreadyRegistered: true });
  }
  return Response.json({
    alreadyRegistered: false,
    regNonce: prepared.regNonce,
    txBytes: prepared.txBytes,
  });
}
