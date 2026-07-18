import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { probe } from "@suimpp/discovery";
import { buildUpdateTx } from "@t2000/id";
import { getOnChainAgentRecord } from "@/lib/agent/record";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/service/prepare { address, endpoint } → { nonce, txBytes, probe }
// The machine-path per-call listing (`t2 agent sell`, SPEC_INFERENCE_DEMAND
// item 13; the human seller path is ACP offerings — SPEC_ACP_SUI): set the
// agent's x402 service endpoint on-chain via registry `update`. The endpoint is
// LIVE-PROBED first (@suimpp/discovery) — it must answer 402 with a valid Sui
// payment challenge, or prepare fails with the precise failing checks. No
// human review in the loop. `endpoint: ""` clears the listing (no probe).
//
// Registry `update` is signer==agent + FULL-REPLACE, so the current on-chain
// record is read and its did/metadataUri carried through — only the service
// fields change. Pairs with /service/submit.

const MAX_ENDPOINT = 512;

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
  let endpoint: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    endpoint = String(body?.endpoint ?? "").trim();
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
      "A valid agent Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }

  const clearing = endpoint === "";
  if (!clearing) {
    if (endpoint.length > MAX_ENDPOINT) {
      return openAiError(
        400,
        `Endpoint must be at most ${MAX_ENDPOINT} characters.`,
        "invalid_request_error",
        "invalid_endpoint"
      );
    }
    try {
      if (new URL(endpoint).protocol !== "https:") {
        throw new Error("not https");
      }
    } catch {
      return openAiError(
        400,
        "Endpoint must be a valid https URL.",
        "invalid_request_error",
        "invalid_endpoint"
      );
    }
  }

  // The record must exist on-chain (create an Agent ID first) — and `update`
  // is full-replace, so carry the fields we aren't changing.
  const record = await getOnChainAgentRecord(address).catch(() => null);
  if (!record) {
    return openAiError(
      400,
      "This address has no Agent ID yet — register first.",
      "invalid_request_error",
      "not_registered"
    );
  }

  // Live probe: the endpoint must answer 402 with a valid Sui challenge.
  let probeResult: Awaited<ReturnType<typeof probe>> | null = null;
  if (!clearing) {
    probeResult = await probe(endpoint, new URL(endpoint).origin);
    if (!probeResult.ok) {
      return Response.json(
        {
          error: {
            message:
              "Endpoint probe failed — fix the checks below and try again.",
            type: "invalid_request_error",
            code: "probe_failed",
          },
          probe: {
            ok: false,
            statusCode: probeResult.statusCode,
            issues: probeResult.issues,
          },
        },
        { status: 400 }
      );
    }
  }

  const methods = Array.isArray(record.payment_methods)
    ? record.payment_methods
    : [];
  const paymentMethods = clearing
    ? methods.filter((m) => m !== "x402")
    : [...new Set([...methods, "x402"])];

  const tx = buildUpdateTx({
    mcpEndpoint: clearing ? null : endpoint,
    paymentMethods,
    did: record.did ?? null,
    metadataUri: record.metadata_uri ?? null,
  });
  const res = await prepareSponsoredTx(address, tx, {
    kind: "service",
    mcpEndpoint: clearing ? null : endpoint,
    paymentMethods,
  });
  if (res.ok) {
    return Response.json({
      nonce: res.nonce,
      txBytes: res.txBytes,
      probe: probeResult
        ? {
            ok: true,
            recipient: probeResult.recipient ?? null,
            amount: probeResult.amount ?? null,
            currency: probeResult.currency ?? null,
          }
        : null,
    });
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
    "Could not prepare the update — is this agent registered?",
    "invalid_request_error",
    "prepare_failed"
  );
}
