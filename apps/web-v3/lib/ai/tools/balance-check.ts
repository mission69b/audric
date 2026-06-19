import { SuiGrpcClient } from "@mysten/sui/grpc";
import { queryBalance } from "@t2000/sdk";
import { tool } from "ai";
import { z } from "zod";
import { env } from "@/lib/env";

/**
 * balance_check — read the user's Passport wallet balance (USDC + holdings with
 * USD values) via the SDK's canonical priced reader. Server-side, keyed by the
 * signed-in user's Sui address. Lets the agent answer "what's my balance" and be
 * funding-aware before proposing a send/payment.
 */

let cachedClient: SuiGrpcClient | null = null;
function readClient(): SuiGrpcClient {
  if (!cachedClient) {
    const network =
      env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
    const baseUrl =
      network === "testnet"
        ? "https://fullnode.testnet.sui.io"
        : "https://fullnode.mainnet.sui.io";
    cachedClient = new SuiGrpcClient({ baseUrl, network });
  }
  return cachedClient;
}

export const balanceCheck = ({ address }: { address: string }) =>
  tool({
    description:
      "Check the user's Passport wallet balance — USDC plus other token holdings with USD values. Use for 'what's my balance' and to check whether they can afford a payment before proposing a send.",
    inputSchema: z.object({}),
    execute: async () => await queryBalance(readClient(), address),
  });
