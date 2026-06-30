import { setAgentOwnership } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { submitSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/owner/submit { nonce, address, signature } → { ok, digest }
// Agent ID gate 7 — shared submit for propose + confirm. Loads the server-built
// bytes for `nonce`, sponsor-co-signs, executes. (owner/active sync into the
// directory happens via the gate-6 reconcile cron.)
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
    // Write-through the directory index so the link reflects instantly (the
    // hourly reconcile cron is the backstop). Best-effort — the on-chain tx
    // already succeeded; a DB hiccup must not fail the response.
    const meta = res.meta;
    if (meta?.kind === "owner-propose") {
      await setAgentOwnership(meta.agent as string, {
        pendingOwner: meta.pendingOwner as string,
      }).catch(() => undefined);
    } else if (meta?.kind === "owner-confirm") {
      await setAgentOwnership(meta.agent as string, {
        owner: meta.owner as string,
        pendingOwner: null,
      }).catch(() => undefined);
    }
    return Response.json({ ok: true, digest: res.digest });
  }
  if (res.reason === "unconfigured") {
    return openAiError(
      503,
      "Agent ownership linking is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }
  if (res.reason === "expired") {
    return openAiError(
      409,
      "Challenge expired — start the link again.",
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
