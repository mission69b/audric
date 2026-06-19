import { resolveSuinsViaRpc } from "@t2000/sdk";
import { tool } from "ai";
import { z } from "zod";

/**
 * resolve_suins — resolve a SuiNS name (e.g. "alice.sui") to its Sui address.
 * Self-contained (GraphQL via the SDK). Use before sending to a named recipient.
 */
export const resolveSuins = tool({
  description:
    "Resolve a SuiNS name (e.g. 'alice.sui') to its on-chain Sui wallet address. Use this to look up a recipient before a send_transfer when the user gives a name instead of a 0x address.",
  inputSchema: z.object({
    name: z.string().describe("The SuiNS name to resolve, e.g. 'alice.sui'."),
  }),
  execute: async ({ name }) => {
    const address = await resolveSuinsViaRpc(name);
    return address
      ? { name, address, resolved: true }
      : { name, address: null, resolved: false };
  },
});
