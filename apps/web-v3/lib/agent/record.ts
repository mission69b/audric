import "server-only";

import { bcs } from "@mysten/sui/bcs";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { deriveDynamicFieldID } from "@mysten/sui/utils";
import { AGENT_ID_REGISTRY_ID } from "@t2000/id";
import { env } from "@/lib/env";

// Single on-chain AgentRecord read (registry Table dynamic field). Needed by
// the `update` path: the registry's `update` is FULL-REPLACE, so a caller
// changing one field (e.g. mcpEndpoint) must supply the record's current
// `did` / `metadataUri` or silently clear them.

const NETWORK = (env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet") as
  | "mainnet"
  | "testnet";

export type OnChainAgentRecord = {
  agent: string;
  mcp_endpoint?: string | null;
  payment_methods?: string[] | null;
  did?: string | null;
  metadata_uri?: string | null;
};

export async function getOnChainAgentRecord(
  address: string
): Promise<OnChainAgentRecord | null> {
  const client = new SuiGrpcClient({
    baseUrl:
      NETWORK === "testnet"
        ? "https://fullnode.testnet.sui.io"
        : "https://fullnode.mainnet.sui.io",
    network: NETWORK,
  });
  const reg = await client.core.getObject({
    objectId: AGENT_ID_REGISTRY_ID,
    include: { json: true },
  });
  const tableId = (reg.object?.json as { agents?: { id?: string } } | undefined)
    ?.agents?.id;
  if (!tableId) {
    return null;
  }
  const fieldId = deriveDynamicFieldID(
    tableId,
    "address",
    bcs.Address.serialize(address).toBytes()
  );
  try {
    const obj = await client.core.getObject({
      objectId: fieldId,
      include: { json: true },
    });
    const rec = (obj.object?.json as { value?: OnChainAgentRecord } | undefined)
      ?.value;
    return rec?.agent ? rec : null;
  } catch {
    // Field object absent → not registered.
    return null;
  }
}
