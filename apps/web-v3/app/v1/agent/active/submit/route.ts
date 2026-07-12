import { upsertAgentProfile } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { submitSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/active/submit { nonce, address, signature } → { ok, digest }
// Executes the prepared `set_active` tx, then write-throughs the flag into
// the directory cache (the cron also reconciles it from chain).
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
    if (res.meta?.kind === "active") {
      // Owner-side toggles (S.700) carry the TARGET agent in meta — the
      // signer (`address`) may be the owner, not the record being flipped.
      const target =
        typeof res.meta.agent === "string" && res.meta.agent
          ? res.meta.agent
          : address;
      await upsertAgentProfile({
        address: target,
        active: Boolean(res.meta.active),
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
