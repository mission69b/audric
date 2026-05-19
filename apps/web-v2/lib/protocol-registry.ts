import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { NaviAdapter, ProtocolRegistry } from "@t2000/sdk/adapters";
import { env } from "@/lib/env";

// `getJsonRpcFullnodeUrl` requires the strict 4-value union. web-v2's env
// schema currently types `NEXT_PUBLIC_SUI_NETWORK` as `string` (apps/web
// uses `z.enum(['mainnet', 'testnet'])`); cast at the boundary rather than
// touch the env schema in this session. If a future env-cleanup pass
// tightens the schema, the cast can be removed.
const SUI_NETWORK = env.NEXT_PUBLIC_SUI_NETWORK as
  | "mainnet"
  | "testnet"
  | "devnet"
  | "localnet";

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
    globalForRegistry._suiRpcClient = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(SUI_NETWORK),
      network: SUI_NETWORK,
    });
  }
  return globalForRegistry._suiRpcClient;
}

export function getRegistry(): RegistryInstance {
  if (!globalForRegistry._protocolRegistry) {
    globalForRegistry._protocolRegistry = createRegistry();
  }
  return globalForRegistry._protocolRegistry;
}
