import { tool } from "ai";
import { z } from "zod";

/**
 * agent_pay — buy a one-call service from the t2000 agent store
 * (SPEC_AGENT_COMMERCE §II.12 C2, need-first).
 *
 * CLIENT-EXECUTED: no server `execute` (the zkLogin key lives in the browser).
 * The call renders a tap-to-confirm purchase card; on Allow the CLIENT runs
 * the x402 sign-then-settle loop via `agentPay` (lib/wallet/agent-pay.ts) —
 * pay-on-delivery, auto-refund on failed delivery — and returns the delivered
 * response + settlement digest with `addToolResult`. The server never moves
 * money. See `components/chat/agent-pay-tool.tsx`.
 *
 * The available services + prices come from the <agent_store> system-prompt
 * block. Offer first (with the price), call only after the user agrees.
 */
export const agentPay = tool({
  description:
    "Buy a one-call paid service from the t2000 agent store with the user's wallet USDC (x402, pay-on-delivery, auto-refund on failure). ONLY for services listed in <agent_store>, and ONLY after the user explicitly agreed to the offer with its price. The user ALWAYS taps to confirm — you never spend on your own. On success you get the delivered service response + an on-chain digest: answer the user's question through that data.",
  inputSchema: z.object({
    seller: z
      .string()
      .describe(
        "The seller's 0x Sui address, EXACTLY as listed in <agent_store>."
      ),
    serviceName: z
      .string()
      .describe(
        "The service's display name from <agent_store> (for the card)."
      ),
    priceUsdc: z
      .number()
      .describe(
        "The listed price in USDC, EXACTLY as shown in <agent_store> (e.g. 0.05)."
      ),
    input: z
      .string()
      .optional()
      .describe(
        'JSON service input per the listing\'s Input hint (e.g. \'{"address":"0x…"}\'). Omit when the service takes no input.'
      ),
    // Store v2: multi-service agents list slug-addressed SKUs.
    service: z
      .string()
      .optional()
      .describe(
        "The service SLUG from <agent_store> when the seller lists multiple services (buys commerce/pay/<seller>/<slug>). Omit for single-service sellers."
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
