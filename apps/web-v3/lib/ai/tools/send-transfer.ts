import { tool } from "ai";
import { z } from "zod";

/**
 * send_transfer — P2P stablecoin transfer from the user's Passport.
 *
 * Sends USDC or USDsui — both gasless Sui-native stables (the SDK's
 * `SENDABLE_ASSETS`; `balance::send_funds`). Defaults to USDC when the asset is
 * unspecified.
 *
 * CLIENT-EXECUTED: no server `execute` (the zkLogin key lives in the browser).
 * On the user's tap-to-confirm the CLIENT signs + submits via `sendTransfer`
 * (lib/wallet/send.ts → buildSendTx + executeTx, gasless) and returns the digest
 * with `addToolResult`. The server never moves money. See
 * `components/chat/send-transfer-tool.tsx`.
 *
 * Resolve SuiNS names / @audric handles with resolve_suins FIRST — pass a 0x
 * address here.
 */
export const sendTransfer = tool({
  description:
    "Send USDC or USDsui from the user's Passport wallet to another address. Both are gasless. The user ALWAYS taps to confirm — you never move money on your own. Pass a 0x recipient address (resolve SuiNS names / @audric handles with resolve_suins first). Set `asset` to match what the user asked to send (default USDC); never silently substitute one stable for the other. On success you get an on-chain digest.",
  inputSchema: z.object({
    to: z
      .string()
      .describe("Recipient 0x Sui address (resolve SuiNS names beforehand)."),
    amount: z
      .number()
      .describe("Amount to send, in human units (e.g. 5 = 5 tokens)."),
    asset: z
      .enum(["USDC", "USDsui"])
      .optional()
      .describe(
        "Which stable to send — 'USDC' or 'USDsui'. Defaults to USDC. Match the user's request exactly; do not substitute."
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
