import { tool } from "ai";
import { z } from "zod";

/**
 * send_transfer — P2P USDC/USDsui/SUI transfer from the user's Passport.
 *
 * CLIENT-EXECUTED: no server `execute` (the zkLogin key lives in the browser).
 * On the user's tap-to-confirm the CLIENT signs + submits via `sendTransfer`
 * (lib/wallet/send.ts → buildSendTx + executeTx, gasless for stables) and
 * returns the digest with `addToolResult`. The server never moves money. See
 * `components/chat/send-transfer-tool.tsx`.
 *
 * Resolve SuiNS names with resolve_suins FIRST — pass a 0x address here.
 */
export const sendTransfer = tool({
  description:
    "Send USDC (or USDsui/SUI) from the user's Passport wallet to another address. The user ALWAYS taps to confirm — you never move money on your own. Pass a 0x recipient address (resolve SuiNS names with resolve_suins first). USDC/USDsui are gasless. On success you get an on-chain digest.",
  inputSchema: z.object({
    to: z
      .string()
      .describe("Recipient 0x Sui address (resolve SuiNS names beforehand)."),
    amount: z
      .number()
      .describe("Amount to send, in human units (e.g. 5 = 5 USDC)."),
    asset: z
      .enum(["USDC", "USDsui", "SUI"])
      .default("USDC")
      .describe("Asset to send (default USDC)."),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
