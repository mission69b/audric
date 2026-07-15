import { setAgentProfileFields } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { submitSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/service/submit { nonce, address, signature } → { ok, digest }
// Executes the prepared registry `update` (service endpoint), then
// write-throughs the listing into the directory cache (the cron also
// reconciles it from chain). Pairs with /service/prepare.
export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let nonce: string;
  let address: string;
  let signature: string;
  try {
    const body = await request.json();
    nonce = String(body?.nonce ?? "").trim();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
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

  const res = await submitSponsoredTx({
    nonce,
    actor: address,
    actorSignature: signature,
  });
  if (res.ok) {
    if (res.meta?.kind === "service") {
      // Server-set meta from prepare (never client-supplied at submit).
      await setAgentProfileFields(address, {
        mcpEndpoint:
          typeof res.meta.mcpEndpoint === "string" ? res.meta.mcpEndpoint : null,
        paymentMethods: Array.isArray(res.meta.paymentMethods)
          ? (res.meta.paymentMethods as string[])
          : [],
      }).catch(() => undefined);
    }
    return Response.json({ ok: true, digest: res.digest });
  }
  if (res.reason === "expired") {
    return openAiError(
      409,
      "Challenge expired — try again.",
      "invalid_request_error",
      "expired"
    );
  }
  if (res.reason === "aborted") {
    return Response.json(
      { error: `On-chain rejected: ${res.message}`, code: "aborted" },
      { status: 400 }
    );
  }
  return Response.json(
    { error: "reason" in res ? res.reason : "failed", code: "failed" },
    { status: res.reason === "unconfigured" ? 503 : 400 }
  );
}
