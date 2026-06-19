// ⚠️ SHELVED (S.478, 2026-06-17) — NOT wired into the agent. Generic in-chat
// x402 was cut from MVP (it lost to native Gateway capabilities). This tool def
// is kept as reference for Phase 4b (Recipes), where x402 returns as curated
// multi-service outcome flows — not a free-form in-chat tool.
import { tool } from "ai";
import { z } from "zod";

/**
 * mpp_call — pay for + call an x402 Service from the user's Passport wallet.
 *
 * CLIENT-EXECUTED: this tool has NO server `execute`. The zkLogin signing key
 * lives in the browser, so on the user's tap-to-confirm the CLIENT runs
 * `payService` (gasless USDC, the gateway settles) and returns the result via
 * `addToolResult`. The server never moves money. See `components/chat/
 * mpp-call-tool.tsx` for the client half and `lib/wallet/pay.ts` for the loop.
 *
 * The user ALWAYS confirms before any spend (Passport "you decide"). On failure
 * the rail auto-refunds — never blind-retry; surface the error and re-ask.
 */
export const mppCall = tool({
  description:
    "Pay for and call an x402 Service in USDC from the user's Passport wallet. " +
    "The user taps to confirm every payment — you never move money on your own. " +
    "Call mpp_services FIRST to get the exact url, price, and body schema. You " +
    "receive the Service's response plus an on-chain receipt on success. If it " +
    "fails, DO NOT retry blindly (the rail auto-refunds a failed call) — explain " +
    "what went wrong and ask the user how to proceed.",
  inputSchema: z.object({
    url: z
      .string()
      .describe(
        "Full endpoint URL from mpp_services, e.g. https://mpp.t2000.ai/alphavantage/v1/quote"
      ),
    method: z
      .enum(["GET", "POST"])
      .default("POST")
      .describe("HTTP method for the endpoint (most are POST)"),
    body: z
      .string()
      .optional()
      .describe(
        'JSON-string request body matching the endpoint\'s schema (e.g. \'{"symbol":"AAPL"}\')'
      ),
    label: z
      .string()
      .describe(
        "Short human label for the confirm card, e.g. 'Stock quote: AAPL' or 'Image: a red fox'"
      ),
    priceUsd: z
      .number()
      .optional()
      .describe(
        "The endpoint's per-call price in USD (from mpp_services), shown on the confirm card"
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
