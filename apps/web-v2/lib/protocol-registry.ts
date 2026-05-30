import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { NaviAdapter, ProtocolRegistry } from "@t2000/sdk/adapters";
import { createSuiRpcClient } from "@/lib/sui-rpc";

type RegistryInstance = InstanceType<typeof ProtocolRegistry>;
type ClientInstance = InstanceType<typeof SuiJsonRpcClient>;

const globalForRegistry = globalThis as unknown as {
  _protocolRegistry: RegistryInstance | undefined;
  _suiRpcClient: ClientInstance | undefined;
};

function createRegistry(): RegistryInstance {
  const client = getClient();
  const registry = new ProtocolRegistry();

  const navi = new NaviAdapter();
  navi.initSync(client);
  registry.registerLending(navi);

  return registry;
}

export function getClient(): ClientInstance {
  if (!globalForRegistry._suiRpcClient) {
    // Was the public fullnode (heavy rate limits → NAVI getPositions 429s
    // under load). Canonical client routes through BlockVision + 429 retry.
    globalForRegistry._suiRpcClient = createSuiRpcClient();
  }
  return globalForRegistry._suiRpcClient;
}

export function getRegistry(): RegistryInstance {
  if (!globalForRegistry._protocolRegistry) {
    globalForRegistry._protocolRegistry = createRegistry();
  }
  return globalForRegistry._protocolRegistry;
}
