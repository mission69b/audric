import { queryHistory } from "@t2000/sdk";
import { tool } from "ai";
import { z } from "zod";

/**
 * transaction_history — the user's recent on-chain transactions (sends,
 * receives, payments) via the SDK's canonical history reader. Server-side,
 * keyed by the signed-in user's Sui address.
 */
export const transactionHistory = ({ address }: { address: string }) =>
  tool({
    description:
      "Get the user's recent on-chain transaction history (sends, receives, payments) from their Passport wallet.",
    inputSchema: z.object({
      limit: z
        .number()
        .optional()
        .describe("Max number of transactions to return (default 20)."),
    }),
    execute: async ({ limit }) => {
      const records = await queryHistory(address, limit ?? 20);
      return { count: records.length, transactions: records };
    },
  });
