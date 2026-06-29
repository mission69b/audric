import "server-only";

import { upsertAgentProfile } from "@audric/accounts";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { AGENT_ID_REGISTRY_ID } from "@t2000/id";
import { env } from "@/lib/env";

// Agent ID directory reconcile (gate 6 — the lightweight poll-cron). Walks the
// on-chain registry Table and upserts every AgentRecord into AgentProfile:
// backfills numericId, syncs owner/active/metadataUri, and CATCHES third-party
// registrations the write-through never saw. gRPC + parsed JSON (getObject) —
// no events, no BCS, no JSON-RPC (which sunsets 2026-07-31).
//
// v1 = full-scan each run (the registry is small). At scale, switch to an
// incremental cursor (persist last-seen) — noted, not needed yet.

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";
// Safety cap so a runaway can't scan forever (pageSize ~50 → ~5k agents/run).
const MAX_PAGES = 100;

type AgentRecordJson = {
  agent?: string;
  numeric_id?: string | number | null;
  owner?: string | null;
  active?: boolean;
  metadata_uri?: string | null;
};

function grpcClient(): SuiGrpcClient {
  const baseUrl =
    NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network: NETWORK });
}

export async function reconcileAgentDirectory(): Promise<{ synced: number }> {
  const client = grpcClient();
  const reg = await client.core.getObject({
    objectId: AGENT_ID_REGISTRY_ID,
    include: { json: true },
  });
  const tableId = (reg.object?.json as { agents?: { id?: string } } | undefined)
    ?.agents?.id;
  if (!tableId) {
    return { synced: 0 };
  }

  let cursor: string | null | undefined;
  let synced = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.core.listDynamicFields({
      parentId: tableId,
      cursor: cursor ?? undefined,
    });
    for (const entry of res.dynamicFields ?? []) {
      try {
        const obj = await client.core.getObject({
          objectId: entry.fieldId,
          include: { json: true },
        });
        const rec = (
          obj.object?.json as { value?: AgentRecordJson } | undefined
        )?.value;
        if (!rec?.agent) {
          continue;
        }
        await upsertAgentProfile({
          address: rec.agent,
          numericId: rec.numeric_id == null ? null : Number(rec.numeric_id),
          owner: rec.owner ?? null,
          active: rec.active !== false,
          metadataUri: rec.metadata_uri ?? null,
        });
        synced++;
      } catch {
        // Skip a single bad entry; keep reconciling the rest.
      }
    }
    if (!res.hasNextPage) {
      break;
    }
    cursor = res.cursor;
  }
  return { synced };
}
