import { SuiGrpcClient } from "@mysten/sui/grpc";
import { queryBalance } from "@t2000/sdk";
import { tool } from "ai";
import { z } from "zod";

// balance_check — reads the SIGNED-IN user's real Sui wallet balance. Native
// analogue of web-v3's `balance_check` tool, and the same canonical reader the
// `/api/balance` route uses (`queryBalance` from `@t2000/sdk` over `SuiGrpcClient`),
// so chat, the wallet tab, and web-v3 all quote byte-identical numbers.
//
// WHY THIS EXISTS: wallet/balance questions used to be intercepted client-side and
// answered with a hardcoded figure ("124.50 USDC") rendered indistinguishably from a
// real turn — a fabricated financial claim. This tool makes the honest answer
// possible, so the fake path could be deleted. See AUDIT-2026-07-20.md #1.
//
// SECURITY: the address is BOUND at construction from the verified `audric_session`
// (`auth.userId`) and is deliberately NOT a tool input — the model can neither pass
// nor influence whose balance is read. `inputSchema` is empty for exactly that reason.
// SERVER-ONLY: import from `+api` routes only.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export function balanceCheck(address: string | null) {
  return tool({
    description:
      "Read the signed-in user's own Sui wallet balance (USDC and SUI). Use it " +
      "whenever they ask what they hold, what they can spend, or what their " +
      "balance is. Takes no arguments — it always reads the authenticated " +
      "user's own wallet. Never state a balance without calling this first.",
    inputSchema: z.object({}),
    execute: async () => {
      const addr = (address ?? "").toLowerCase();
      if (!SUI_ADDRESS.test(addr)) {
        // Guest / untokened turn — say so plainly rather than guessing a number.
        return {
          connected: false as const,
          message:
            "No wallet is connected — the user is not signed in, so no balance can be read.",
        };
      }

      const network =
        process.env.EXPO_PUBLIC_SUI_NETWORK === "testnet"
          ? "testnet"
          : "mainnet";
      const baseUrl =
        network === "testnet"
          ? "https://fullnode.testnet.sui.io"
          : "https://fullnode.mainnet.sui.io";

      try {
        const client = new SuiGrpcClient({ baseUrl, network });
        const balance = await queryBalance(client, addr);
        return {
          connected: true as const,
          address: addr,
          network,
          usdc: balance.stables.USDC ?? 0,
          sui: balance.sui.amount,
          totalUsd: balance.totalUsd,
        };
      } catch {
        // Hard-fail rather than soft-null: the wallet TAB can render "—" for an
        // unknown balance, but a chat answer cannot — a model handed a null would
        // be free to fill the gap with a plausible number. Tell it the read failed.
        return {
          connected: true as const,
          error:
            "The balance lookup failed (RPC unavailable). Tell the user you could not read their balance right now — do not estimate or guess a figure.",
        };
      }
    },
  });
}
