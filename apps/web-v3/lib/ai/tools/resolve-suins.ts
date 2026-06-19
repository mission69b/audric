import { resolveSuinsViaRpc } from "@t2000/sdk";
import { tool } from "ai";
import { z } from "zod";

/**
 * Normalize a recipient name to a resolvable SuiNS name.
 *  - "alice@audric"      → "alice.audric.sui"  (Audric handle = a leaf subname)
 *  - "alice.sui"         → unchanged
 *  - "alice.audric.sui"  → unchanged
 */
function toSuinsName(raw: string): string {
  const n = raw.trim().toLowerCase();
  const handle = n.match(/^([a-z0-9-]+)@audric$/);
  if (handle) {
    return `${handle[1]}.audric.sui`;
  }
  return n;
}

/**
 * resolve_suins — resolve a SuiNS name or an Audric handle to its Sui address.
 * Self-contained (via the SDK). Use before sending to a named recipient.
 * Audric handles look like "alice@audric" and map to the leaf subname
 * "alice.audric.sui".
 */
export const resolveSuins = tool({
  description:
    "Resolve a SuiNS name ('alice.sui') OR an Audric handle ('alice@audric') to its on-chain Sui wallet address. Use this to look up a recipient before send_transfer when the user gives a name or @audric handle instead of a 0x address.",
  inputSchema: z.object({
    name: z
      .string()
      .describe(
        "The recipient name to resolve — a SuiNS name ('alice.sui') or an Audric handle ('alice@audric')."
      ),
  }),
  execute: async ({ name }) => {
    const suinsName = toSuinsName(name);
    const address = await resolveSuinsViaRpc(suinsName);
    return address
      ? { name, resolvedName: suinsName, address, resolved: true }
      : { name, resolvedName: suinsName, address: null, resolved: false };
  },
});
