import {
  finalizeAgentToken,
  getIndexerCursor,
  insertAgentToken,
  recordFeeClaim,
  setIndexerCursor,
} from "@audric/accounts";
import { AGENT_CAPITAL_PACKAGE_ID } from "@t2000/sdk";

// The Agent Capital event indexer (SPEC_ACP_SUI §6 item 4 — Capital tab +
// fee-to-agent ledger). Same shape as lib/jobs/indexer.ts: walk the
// `agent_capital` package's Move events forward from a persisted cursor over
// Sui GraphQL (the blessed historical-query surface), upsert the AgentToken /
// FeeClaim read-model. Every number on a token page derives from these events
// or live chain state — nothing hand-entered (SPEC_ACP_SUI §8 "no fake
// numbers").
//
// Events, by module:
//   registry::AgentTokenBound      → insertAgentToken
//   registry::AgentTokenFinalized  → finalizeAgentToken (pool + lock ids)
//   lp_lock::FeesClaimed           → recordFeeClaim (+ lifetime totals)
//   lp_lock::{LpLocked,RewardClaimed,LpWithdrawn} → not modeled in v1 (lock
//     state renders from the chain object; rewards are a later ledger column)

const GRAPHQL_URL = "https://graphql.mainnet.sui.io/graphql";
const CURSOR_NAME = "agent-capital";
const PAGE_SIZE = 50;
const MAX_PAGES_PER_SYNC = 20;

const CURSOR_ERROR_RE = /cursor/i;
const SUI_TYPE_RE = /::sui::SUI$/;

const EVENTS_QUERY = `query CapitalEvents($type: String!, $after: String, $first: Int!) {
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

async function fetchEventsPage(
  module: string,
  after: string | null
): Promise<EventsPage> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: EVENTS_QUERY,
      variables: {
        type: `${AGENT_CAPITAL_PACKAGE_ID}::${module}`,
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

/** Move `TypeName` values arrive as `{ name: "pkg::module::Otw" }` (or a bare
 *  string, depending on endpoint version) — normalize to the string. */
function typeName(json: Record<string, unknown>, key: string): string {
  const v = json[key];
  if (typeof v === "string") {
    return v;
  }
  if (v && typeof v === "object" && "name" in v) {
    return String((v as { name: unknown }).name ?? "");
  }
  return "";
}

/** `pkg::module::OTW` → `OTW` (the display symbol is the OTW by construction). */
function symbolFromCoinType(coinType: string): string {
  return (coinType.split("::").pop() ?? "").slice(0, 8);
}

async function applyEvent(node: EventNode): Promise<void> {
  const type = node.contents?.type?.repr ?? "";
  const json = node.contents?.json;
  if (!json) {
    return;
  }
  switch (type.split("::").pop()) {
    case "AgentTokenBound": {
      const coinType = typeName(json, "coin_type");
      await insertAgentToken({
        agent: str(json, "agent"),
        coinType,
        symbol: symbolFromCoinType(coinType),
        launcher: str(json, "launcher"),
        boundAtMs: num(json, "timestamp_ms"),
        boundTxDigest: node.transaction?.digest ?? "",
      });
      return;
    }
    case "AgentTokenFinalized":
      await finalizeAgentToken({
        agent: str(json, "agent"),
        poolId: str(json, "pool_id"),
        lockId: str(json, "lock_id"),
        finalizedAtMs: num(json, "timestamp_ms"),
      });
      return;
    case "FeesClaimed": {
      const coinTypeA = typeName(json, "coin_type_a");
      const coinTypeB = typeName(json, "coin_type_b");
      const amountA = num(json, "amount_a");
      const amountB = num(json, "amount_b");
      const lockId = str(json, "lock_id");
      const digest = node.transaction?.digest ?? "";
      // Map (A, B) onto (agent-token side, SUI side) — pair orientation is
      // whatever Cetus canonical ordering produced at pool creation.
      const aIsSui = SUI_TYPE_RE.test(coinTypeA);
      await recordFeeClaim({
        id: `${digest}:${lockId}`,
        lockId,
        agent: str(json, "agent"),
        coinTypeA,
        coinTypeB,
        amountA,
        amountB,
        txDigest: digest,
        timestampMs: num(json, "timestamp_ms"),
        agentSideRaw: aIsSui ? amountB : amountA,
        suiSideRaw: aIsSui ? amountA : amountB,
      });
      return;
    }
    default:
      return; // LpLocked / RewardClaimed / LpWithdrawn — not modeled in v1
  }
}

async function syncModule(module: string): Promise<number> {
  const cursorName = `${CURSOR_NAME}:${module}`;
  let cursor = (await getIndexerCursor(cursorName)) ?? null;
  let applied = 0;
  for (let page = 0; page < MAX_PAGES_PER_SYNC; page++) {
    let res = await fetchEventsPage(module, cursor);
    if (
      cursor &&
      res.errors?.some((e) => CURSOR_ERROR_RE.test(e.message ?? ""))
    ) {
      // Stale persisted cursor (retention window moved) — re-walk from the
      // start; idempotent writes make this cost pages, never correctness.
      cursor = null;
      res = await fetchEventsPage(module, cursor);
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
      await setIndexerCursor(cursorName, cursor);
    }
    if (!events?.pageInfo?.hasNextPage) {
      break;
    }
  }
  return applied;
}

/** Walk new capital events forward. Two module streams (registry + lp_lock),
 *  each with its own cursor — a burst of fee claims can't starve launches. */
export async function syncAgentCapital(): Promise<number> {
  if (!AGENT_CAPITAL_PACKAGE_ID) {
    return 0; // not deployed on this network yet
  }
  const [registry, lpLock] = await Promise.all([
    syncModule("registry"),
    syncModule("lp_lock"),
  ]);
  return registry + lpLock;
}
