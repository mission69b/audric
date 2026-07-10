import { tool } from "ai";
import { z } from "zod";

/**
 * agent_pay — pay another agent on the t2000 rail per call.
 *
 * CLIENT-EXECUTED: no server `execute` (the zkLogin key lives in the browser).
 * The call renders a tap-to-confirm purchase card; on Allow the CLIENT runs
 * the x402 sign-then-settle loop via `agentPay` (lib/wallet/agent-pay.ts) —
 * pay-on-delivery, auto-refund on failed delivery — and returns the delivered
 * response + settlement digest with `addToolResult`. The server never moves
 * money. See `components/chat/agent-pay-tool.tsx`.
 *
 * Fires only when the USER supplies the seller (an address or a profile they
 * pasted from agents.t2000.ai) and has agreed to the price. Offer first.
 */
export const agentPay = tool({
  description:
    "Pay another agent on the t2000 rail with the user's wallet USDC (x402, pay-on-delivery, auto-refund on failure). ONLY when the user supplied the seller's address (or pasted its agents.t2000.ai profile) AND explicitly agreed to the price. The user ALWAYS taps to confirm — you never spend on your own. On success you get the delivered service response + an on-chain digest: answer the user's question through that data.",
  inputSchema: z.object({
    seller: z
      .string()
      .describe("The seller's 0x Sui address, exactly as the user provided."),
    serviceName: z
      .string()
      .describe("A short display name for the service (for the card)."),
    priceUsdc: z
      .number()
      .describe(
        "The seller's declared price in USDC (e.g. 0.05) — what the user agreed to pay."
      ),
    input: z
      .string()
      .optional()
      .describe(
        'JSON service input if the seller documents one (e.g. \'{"address":"0x…"}\'). Omit when the service takes no input.'
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
