import { tool } from "ai";
import { z } from "zod";

/**
 * send_transfer — P2P USDC transfer from the user's Passport.
 *
 * USDC is Audric's single settlement asset (v3 has no DeFi, so USDsui/SUI carry
 * no special role — one asset = zero "which asset?" friction).
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
    "Send USDC from the user's Passport wallet to another address. The user ALWAYS taps to confirm — you never move money on your own. Pass a 0x recipient address (resolve SuiNS names / @audric handles with resolve_suins first). USDC transfers are gasless. On success you get an on-chain digest.",
  inputSchema: z.object({
    to: z
      .string()
      .describe("Recipient 0x Sui address (resolve SuiNS names beforehand)."),
    amount: z
      .number()
      .describe("Amount of USDC to send, in human units (e.g. 5 = 5 USDC)."),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
