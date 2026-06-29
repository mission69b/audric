import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { openAiError } from "@/lib/api/keys";
import {
  getTreasuryAddress,
  recordStablecoinTopup,
  upsertUser,
} from "@/lib/db/queries";

// GET /v1/agent/topup → { treasury } — the server-authoritative wallet a client
// sends USDC/USDsui to before calling POST (so the CLI/SDK never hardcodes it).
export function GET() {
  return Response.json({ treasury: getTreasuryAddress() });
}

// POST /v1/agent/topup { address, digest }
// Agent ID Phase A — fund a keypair agent's account headlessly. NO signature
// needed: the on-chain deposit is self-authenticating — recordStablecoinTopup
// only credits `address` if the chain shows `address` sent USDC/USDsui to the
// treasury, so a bad submitter can at worst credit the rightful sender. This
// also CREATES the agent account (upsert) on first fund — an account is born
// from a real payment (no free farming).
export async function POST(request: Request) {
  let address: string;
  let digest: string;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    digest = String(body?.digest ?? "").trim();
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
  if (!digest) {
    return openAiError(
      400,
      "A transaction digest is required.",
      "invalid_request_error",
      "bad_request"
    );
  }

  // Create the agent account (idempotent) so the credit ledger FK resolves,
  // then verify + credit the on-chain deposit.
  await upsertUser(address, null);
  const result = await recordStablecoinTopup({ userId: address, digest });
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: result.code === "not_found" ? 409 : 400 }
    );
  }
  return Response.json({
    credited: result.applied,
    amountUsd: result.amountUsd,
    asset: result.asset,
    balanceUsd: result.balanceMicros / 1_000_000,
  });
}
