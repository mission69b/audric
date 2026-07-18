import { listEscrowJobs } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { openAiError } from "@/lib/api/keys";
import { syncEscrowJobsIfStale } from "@/lib/jobs/indexer";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// GET /v1/jobs — the escrow-job read-model (t2 ACP Phase 1 item 4).
// ?seller=0x…   the provider inbox ("jobs where seller = me")
// ?buyer=0x…    the buyer's purchases
// ?state=funded|delivered|released|rejected|refunded
// ?limit / ?offset
// Public, IP-rate-limited — it mirrors public on-chain state (Job objects +
// events), so there's nothing to auth. Freshness: sync-on-read (≤15s stale)
// with the cron as backstop. At least one of seller/buyer is required so the
// endpoint stays an inbox, not a full-table dump (use ?state-only via cron
// tooling if that's ever needed).

const STATES = new Set([
  "funded",
  "delivered",
  "released",
  "rejected",
  "refunded",
]);

function parseAddress(raw: string | null): string | undefined | null {
  if (!raw?.trim()) {
    return;
  }
  try {
    const addr = normalizeSuiAddress(raw.trim());
    return isValidSuiAddress(addr) ? addr : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  const url = new URL(request.url);
  const seller = parseAddress(url.searchParams.get("seller"));
  const buyer = parseAddress(url.searchParams.get("buyer"));
  if (seller === null || buyer === null) {
    return openAiError(
      400,
      "seller/buyer must be valid Sui addresses.",
      "invalid_request_error",
      "invalid_address"
    );
  }
  if (!(seller || buyer)) {
    return openAiError(
      400,
      "Provide ?seller= and/or ?buyer=.",
      "invalid_request_error",
      "missing_filter"
    );
  }
  const state = url.searchParams.get("state")?.trim() || undefined;
  if (state && !STATES.has(state)) {
    return openAiError(
      400,
      `state must be one of: ${[...STATES].join(", ")}.`,
      "invalid_request_error",
      "invalid_state"
    );
  }
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  await syncEscrowJobsIfStale();

  const { jobs, total } = await listEscrowJobs({
    seller,
    buyer,
    state,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return Response.json({
    total,
    jobs: jobs.map((j) => ({
      jobId: j.jobId,
      buyer: j.buyer,
      seller: j.seller,
      amountUsdc: j.amountMicroUsdc / 1_000_000,
      feeBps: j.feeBps,
      rejectSplitBps: j.rejectSplitBps,
      deliverByMs: j.deliverByMs,
      reviewWindowMs: j.reviewWindowMs,
      state: j.state,
      deliveryHash: j.deliveryHash,
      feeAmountUsdc:
        j.feeAmountMicroUsdc == null ? null : j.feeAmountMicroUsdc / 1_000_000,
      byTimeout: j.byTimeout,
      createdTxDigest: j.createdTxDigest,
      createdAtMs: j.createdAtMs,
      updatedAtMs: j.updatedAtMs,
    })),
  });
}
