import { tool } from "ai";
import { z } from "zod";

/**
 * pay_service — pay a cataloged external API per call from the user's wallet.
 *
 * CLIENT-EXECUTED: no server `execute` (the zkLogin key lives in the browser).
 * The call renders a tap-to-confirm card; on Allow the CLIENT re-resolves the
 * service from the live mpp.t2000.ai catalog (the model never controls the
 * URL or the charge — serviceId + path are looked up, the CATALOG price is
 * the maxPrice), runs the x402 pay loop via the SDK, and returns the
 * delivered response + settlement digest with `addToolResult`. The server
 * never moves money. See `components/chat/pay-service-tool.tsx`.
 *
 * Fires only after find_paid_services + a priced offer the user agreed to.
 */
export const payService = tool({
  description:
    "Pay a cataloged service endpoint per call with the user's wallet USDC (x402, gasless). ONLY after find_paid_services showed the endpoint AND the user explicitly agreed to the stated price. The user ALWAYS taps to confirm — you never spend on your own. Build `body` from the endpoint's requestSchema. On success you get the delivered API response + an on-chain digest: answer the user's question through that data.",
  inputSchema: z.object({
    serviceId: z
      .string()
      .describe(
        "The catalog service id, exactly as find_paid_services returned it."
      ),
    path: z
      .string()
      .describe(
        "The endpoint path exactly as listed (e.g. /v1/hotels/search). For templated paths fill the parameter (e.g. /v1/bookings/abc123)."
      ),
    method: z
      .string()
      .optional()
      .describe("HTTP method as listed. Defaults to the catalog's method."),
    body: z
      .string()
      .optional()
      .describe(
        "JSON request body built from the endpoint's requestSchema. Omit for GET/no-body endpoints."
      ),
    priceUsdc: z
      .number()
      .describe("The listed per-call price the user agreed to (e.g. 0.02)."),
    purpose: z
      .string()
      .describe(
        "One short line for the confirm card: what this call fetches for the user."
      ),
  }),
  // NO execute — client-executed via the zkLogin session key (see file header).
});
