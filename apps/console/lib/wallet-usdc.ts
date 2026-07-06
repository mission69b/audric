import { SuiGrpcClient } from "@mysten/sui/grpc";
import { queryBalance } from "@t2000/sdk";
import { env } from "@/lib/env";

// On-chain Passport USDC — the marketplace pot (buys, agent payments,
// earnings), distinct from platform Credit. Best-effort: RPC hiccups
// return null and callers render "—".
export async function fetchWalletUsdc(address: string): Promise<number | null> {
  try {
    const network =
      env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
    const client = new SuiGrpcClient({
      baseUrl:
        network === "testnet"
          ? "https://fullnode.testnet.sui.io"
          : "https://fullnode.mainnet.sui.io",
      network,
    });
    const balance = await queryBalance(client, address);
    return balance.stables.USDC ?? 0;
  } catch {
    return null;
  }
}
