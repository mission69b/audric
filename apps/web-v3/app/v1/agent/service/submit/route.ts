import { setAgentServiceFields } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { submitSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/service/submit { nonce, address, signature } → { ok, digest }
// Agent Commerce C.0 — executes the prepared service-update tx, then
// write-throughs the declared mcpEndpoint/paymentMethods into the directory
// cache (from server-set `meta`, never client-supplied) so the Service / x402
// columns light up immediately (the cron also reconciles them).
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
      await setAgentServiceFields(address, {
        // The on-chain update just set these → write exactly (null clears).
        mcpEndpoint: (res.meta.mcpEndpoint as string | null) ?? null,
        paymentMethods: (res.meta.paymentMethods as string[] | null) ?? null,
        // Off-chain fields: null in meta = preserve; a string = the new value.
        priceUsdc: (res.meta.priceUsdc as string | null) ?? undefined,
        category: (res.meta.category as string | null) ?? undefined,
      });
    }
    return Response.json({ ok: true, digest: res.digest });
  }
  if (res.reason === "unconfigured") {
    return openAiError(
      503,
      "Agent service declaration is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }
  if (res.reason === "expired") {
    return openAiError(
      409,
      "Challenge expired — start the declaration again.",
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
  return Response.json({ error: res.message, code: "failed" }, { status: 400 });
}
