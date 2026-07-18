import {
  getIndexerCursor,
  insertEscrowJob,
  setIndexerCursor,
  updateEscrowJobState,
} from "@audric/accounts";
import { A2A_ESCROW_PACKAGE_ID } from "@t2000/sdk";

// The escrow-job event indexer (t2 ACP Phase 1 item 4 — provider inbox).
//
// Walks the a2a_escrow contract's own Move events (JobCreated / JobDelivered /
// JobReleased / JobRejected / JobRefunded) forward from a persisted cursor and
// upserts the EscrowJob read-model. Event-derived — captures EVERY job
// regardless of entry path (sponsored routes, CLI, direct contract calls) and
// every settlement path (including permissionless timeout cranks).
//
// Transport: Sui GraphQL (`events(filter: { type })` with cursor pagination).
// gRPC has no event query (SDK Stage 0 finding A) and JSON-RPC retires
// 2026-07-31 — GraphQL is the blessed historical-query surface, same as the
// SDK's transaction history. Idempotent by construction: creates are
// insert-on-conflict-do-nothing, transitions are rank-guarded.

const GRAPHQL_URL = "https://graphql.mainnet.sui.io/graphql";
const CURSOR_NAME = "escrow-jobs";
const PAGE_SIZE = 50;
const MAX_PAGES_PER_SYNC = 20;

const CURSOR_ERROR_RE = /cursor/i;

const EVENTS_QUERY = `query EscrowEvents($type: String!, $after: String, $first: Int!) {
  events(first: $first, after: $after, filter: { type: $type }) {
    pageInfo { hasNextPage endCursor }
    nodes {
      transaction { digest }
      contents { type { repr } json }
    }
  }
}`;

type EventNode = {
  transaction?: { digest?: string } | null;
  contents?: { type?: { repr?: string }; json?: Record<string, unknown> };
};

type EventsPage = {
  data?: {
    events?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      nodes?: EventNode[];
    };
  };
  errors?: { message?: string }[];
};

async function fetchEventsPage(after: string | null): Promise<EventsPage> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: EVENTS_QUERY,
      variables: {
        type: `${A2A_ESCROW_PACKAGE_ID}::escrow`,
        after,
        first: PAGE_SIZE,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Sui GraphQL ${res.status}`);
  }
  return (await res.json()) as EventsPage;
}

function str(json: Record<string, unknown>, key: string): string {
  return String(json[key] ?? "");
}

function num(json: Record<string, unknown>, key: string): number {
  return Number(json[key] ?? 0);
}

async function applyEvent(node: EventNode): Promise<void> {
  const type = node.contents?.type?.repr ?? "";
  const json = node.contents?.json;
  if (!json) {
    return;
  }
  const eventName = type.split("::").pop();
  const jobId = str(json, "job_id");
  if (!jobId) {
    return;
  }
  switch (eventName) {
    case "JobCreated":
      await insertEscrowJob({
        jobId,
        buyer: str(json, "buyer"),
        seller: str(json, "seller"),
        amountMicroUsdc: num(json, "amount"),
        feeBps: num(json, "fee_bps"),
        rejectSplitBps: num(json, "reject_split_bps"),
        deliverByMs: num(json, "deliver_by_ms"),
        reviewWindowMs: num(json, "review_window_ms"),
        createdTxDigest: node.transaction?.digest ?? "",
        createdAtMs: num(json, "timestamp_ms"),
      });
      return;
    case "JobDelivered":
      await updateEscrowJobState(jobId, "delivered", {
        timestampMs: num(json, "timestamp_ms"),
        deliveryHash: str(json, "delivery_hash"),
      });
      return;
    case "JobReleased":
      await updateEscrowJobState(jobId, "released", {
        timestampMs: num(json, "timestamp_ms"),
        feeAmountMicroUsdc: num(json, "fee_amount"),
        byTimeout: json.by_timeout === true,
      });
      return;
    case "JobRejected":
      await updateEscrowJobState(jobId, "rejected", {
        timestampMs: num(json, "timestamp_ms"),
        feeAmountMicroUsdc: num(json, "fee_amount"),
      });
      return;
    case "JobRefunded":
      await updateEscrowJobState(jobId, "refunded", {
        timestampMs: num(json, "timestamp_ms"),
      });
      return;
    default:
      return; // unknown event added by a future package upgrade — skip
  }
}

/** Walk new events forward from the persisted cursor. Returns the number of
 *  events applied. Safe to run concurrently (idempotent writes; a racing
 *  cursor save just re-reads a page next run). */
export async function syncEscrowJobs(): Promise<number> {
  let cursor = (await getIndexerCursor(CURSOR_NAME)) ?? null;
  let applied = 0;
  for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
    let res = await fetchEventsPage(cursor);
    if (
      cursor &&
      res.errors?.some((e) => CURSOR_ERROR_RE.test(e.message ?? ""))
    ) {
      // Endpoint rejected a stale persisted cursor (retention window moved).
      // Re-walk from the start — every write is idempotent, so this only
      // costs pages, never correctness.
      cursor = null;
      res = await fetchEventsPage(cursor);
    }
    if (res.errors?.length) {
      throw new Error(
        `Sui GraphQL events query failed: ${res.errors
          .map((e) => e.message ?? "unknown")
          .join("; ")}`
      );
    }
    const events = res.data?.events;
    const nodes = events?.nodes ?? [];
    for (const node of nodes) {
      await applyEvent(node);
      applied++;
    }
    const endCursor = events?.pageInfo?.endCursor ?? null;
    if (endCursor && endCursor !== cursor) {
      cursor = endCursor;
      await setIndexerCursor(CURSOR_NAME, cursor);
    }
    if (!events?.pageInfo?.hasNextPage) {
      break;
    }
  }
  return applied;
}

// Sync-on-read gate: /v1/jobs freshens the index inline at most once per
// STALE_AFTER_MS per lambda instance, so watchers see near-real-time state
// without waiting for the cron backstop.
const STALE_AFTER_MS = 15_000;
let lastSyncMs = 0;
let inflight: Promise<number> | null = null;

export async function syncEscrowJobsIfStale(): Promise<void> {
  if (Date.now() - lastSyncMs < STALE_AFTER_MS) {
    return;
  }
  if (!inflight) {
    inflight = syncEscrowJobs().finally(() => {
      lastSyncMs = Date.now();
      inflight = null;
    });
  }
  try {
    await inflight;
  } catch (e) {
    // A degraded GraphQL endpoint must not fail the read — serve the
    // (possibly stale) index and let the cron backstop catch up.
    console.error("[escrow-jobs] sync failed", e);
  }
}
