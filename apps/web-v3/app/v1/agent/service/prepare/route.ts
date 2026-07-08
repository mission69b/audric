import { AGENT_CATEGORIES, getAgentProfile } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { buildUpdateTx } from "@t2000/id";
import { isSponsorConfigured, prepareSponsoredTx } from "@/lib/agent/sponsored";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/service/prepare { address, mcpEndpoint?, paymentMethods?,
//   priceUsdc?, category? } → { nonce, txBytes }
// Agent Commerce C.0 — declare this agent's paid service: an MCP endpoint +
// the payment methods it accepts (e.g. ["x402"]). On-chain `update` is
// full-replace, so we MERGE with the agent's current record (preserve the
// unspecified field + metadataUri) before building. Sponsored (0-SUI ok); the
// agent signs the returned bytes → /service/submit.

const MAX_ENDPOINT_LEN = 512;
const MAX_METHODS = 8;
const MAX_METHOD_LEN = 32;

function validEndpoint(url: string): boolean {
  if (url.length > MAX_ENDPOINT_LEN) {
    return false;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeMethods(input: unknown): string[] | null {
  if (!Array.isArray(input)) {
    return null;
  }
  const out: string[] = [];
  for (const raw of input.slice(0, MAX_METHODS)) {
    const m = String(raw).trim().toLowerCase();
    if (m && m.length <= MAX_METHOD_LEN) {
      out.push(m);
    }
  }
  return out;
}

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
      "Agent service declaration is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }

  let address: string;
  let endpointProvided = false;
  let methodsProvided = false;
  let priceProvided = false;
  let categoryProvided = false;
  let mcpEndpoint: string | null = null;
  let paymentMethods: string[] = [];
  let priceUsdc: string | null = null;
  let category: string | null = null;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());

    if (body?.mcpEndpoint !== undefined && body?.mcpEndpoint !== null) {
      endpointProvided = true;
      mcpEndpoint = String(body.mcpEndpoint).trim();
    }
    if (body?.paymentMethods !== undefined) {
      const m = normalizeMethods(body.paymentMethods);
      if (m === null) {
        return openAiError(
          400,
          "paymentMethods must be an array of strings.",
          "invalid_request_error",
          "bad_request"
        );
      }
      methodsProvided = true;
      paymentMethods = m;
    }
    if (body?.priceUsdc !== undefined && body?.priceUsdc !== null) {
      priceProvided = true;
      const n = Number(body.priceUsdc);
      if (!Number.isFinite(n) || n <= 0 || n > 1000) {
        return openAiError(
          400,
          "priceUsdc must be a positive USDC amount (≤ 1000).",
          "invalid_request_error",
          "invalid_price"
        );
      }
      // Settle floor (S.676, mirrors catalog validation): the net after the
      // 2.5% fee must clear the $0.01 gasless-transfer minimum, or every buy
      // of this listing 400s at settlement.
      const grossMicros = Math.floor(n * 1_000_000);
      const netMicros = grossMicros - Math.floor((grossMicros * 250) / 10_000);
      if (netMicros < 10_000) {
        return openAiError(
          400,
          "priceUsdc too low to settle — net after the 2.5% fee must be ≥ $0.01 (list at $0.011 or higher).",
          "invalid_request_error",
          "invalid_price"
        );
      }
      priceUsdc = String(body.priceUsdc).trim();
    }
    if (body?.category !== undefined && body?.category !== null) {
      categoryProvided = true;
      const c = String(body.category).trim().toLowerCase();
      if (!(AGENT_CATEGORIES as readonly string[]).includes(c)) {
        return openAiError(
          400,
          `category must be one of: ${AGENT_CATEGORIES.join(", ")}.`,
          "invalid_request_error",
          "invalid_category"
        );
      }
      category = c;
    }
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
  if (
    !(endpointProvided || methodsProvided || priceProvided || categoryProvided)
  ) {
    return openAiError(
      400,
      "Provide at least one of mcpEndpoint, paymentMethods, priceUsdc, or category.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (endpointProvided && mcpEndpoint && !validEndpoint(mcpEndpoint)) {
    return openAiError(
      400,
      "mcpEndpoint must be a valid https URL.",
      "invalid_request_error",
      "invalid_endpoint"
    );
  }

  // Merge with the current record so a partial update doesn't clear the other
  // field. metadataUri is preserved from the directory cache (the on-chain
  // `update` is full-replace). did is not indexed → resets to null (unused).
  const current = await getAgentProfile(address);
  const finalEndpoint = endpointProvided
    ? mcpEndpoint || null
    : (current?.mcpEndpoint ?? null);
  const finalMethods = methodsProvided
    ? paymentMethods
    : (current?.paymentMethods ?? []);

  const tx = buildUpdateTx({
    mcpEndpoint: finalEndpoint,
    paymentMethods: finalMethods,
    did: null,
    metadataUri: current?.metadataUri ?? null,
  });

  const res = await prepareSponsoredTx(address, tx, {
    kind: "service",
    mcpEndpoint: finalEndpoint,
    paymentMethods: finalMethods,
    // Off-chain fields: write-through only when provided (preserve otherwise).
    // null in meta = "no change".
    priceUsdc: priceProvided ? priceUsdc : null,
    category: categoryProvided ? category : null,
  });
  if (res.ok) {
    return Response.json({ nonce: res.nonce, txBytes: res.txBytes });
  }
  if (res.reason === "unconfigured") {
    return openAiError(
      503,
      "Agent service declaration is temporarily unavailable.",
      "api_error",
      "service_unavailable"
    );
  }
  return openAiError(
    400,
    "Could not prepare — is this agent registered? Run `t2 agent register` first.",
    "invalid_request_error",
    "prepare_failed"
  );
}
