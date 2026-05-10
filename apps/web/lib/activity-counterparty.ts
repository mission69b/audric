/**
 * Activity-feed counterparty display resolver.
 *
 * Maps raw on-chain addresses (`0x6789...abcd`) to human-readable
 * labels for the activity feed. Two layered NeonDB lookups, no RPC:
 *
 *   1. **User's saved contact** ("Mom", "Alice", "Coffee shop") —
 *      from `UserPreferences.contacts`. Highest signal — the user
 *      named this address themselves.
 *   2. **Audric username** (`alice.audric.sui`) — from `User.username`.
 *      Public, durable, recoverable across devices.
 *
 * Reverse SuiNS (`0xabc... → alex.sui`) is intentionally NOT resolved
 * here. It would require an extra RPC per uncached address, the BV
 * Sui RPC budget is shared with the rest of the app, and the value is
 * marginal (an Audric user typing `alex.sui` already gets a saved
 * contact through the normal send-flow). Revisit if the reverse-SuiNS
 * MCP / cache hits ship a sub-100ms p95.
 *
 * Returned shape: `Record<lcAddr, displayLabel>` — the route looks up
 * each counterparty by lowercased address, falls back to truncated
 * 0x when not in the map.
 */

import { prisma } from '@/lib/prisma';
import { parseContactList } from '@/lib/identity/contact-schema';

export type CounterpartyDisplayMap = Record<string, string>;

/**
 * Resolve a set of counterparty addresses to display labels for the
 * given user. Single round-trip per lookup type:
 *
 *   - 1× `UserPreferences.findUnique({ select: { contacts: true } })`
 *   - 1× `User.findMany({ where: { suiAddress: { in: [...] } } })`
 *
 * Both queries skip when the input is empty. Failures degrade
 * silently — a missing contact lookup just means the address falls
 * through to the truncated-0x fallback.
 *
 * Merge order: contacts WIN over usernames. The user's own labelling
 * is the highest-trust signal — if they named someone "Mom" we don't
 * override with the Audric handle.
 */
export async function resolveCounterpartyDisplayMap(
  counterpartyAddresses: string[],
  userAddress: string,
): Promise<CounterpartyDisplayMap> {
  const map: CounterpartyDisplayMap = {};
  if (counterpartyAddresses.length === 0) return map;

  const lcAddrs = Array.from(
    new Set(counterpartyAddresses.map((a) => a.toLowerCase())),
  );

  const [contactList, audricUsers] = await Promise.all([
    prisma.userPreferences
      .findUnique({ where: { address: userAddress }, select: { contacts: true } })
      .then((p) => parseContactList(p?.contacts))
      .catch((err) => {
        console.warn('[activity-counterparty] contacts fetch failed:', err);
        return [];
      }),
    prisma.user
      .findMany({
        where: { suiAddress: { in: lcAddrs }, username: { not: null } },
        select: { suiAddress: true, username: true },
      })
      .catch((err) => {
        console.warn('[activity-counterparty] user fetch failed:', err);
        return [] as Array<{ suiAddress: string; username: string | null }>;
      }),
  ]);

  for (const u of audricUsers) {
    if (!u.username) continue;
    map[u.suiAddress.toLowerCase()] = `${u.username}.audric.sui`;
  }

  for (const c of contactList) {
    map[c.resolvedAddress.toLowerCase()] = c.name;
  }

  return map;
}
