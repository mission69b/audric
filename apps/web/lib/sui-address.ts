/**
 * Helpers for rendering and verifying Sui addresses in user-facing UI.
 *
 * Goals:
 *   - Chunked-hex display so single-character typos are glanceable.
 *     Truncated forms ("0x2314...feb8") hide the dangerous middle.
 *   - Cheap Levenshtein for "near a saved contact" warnings — bounds the
 *     "you typed almost the right address" failure mode a UI can reason
 *     about without needing to know about cryptographic equality.
 */

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function isSuiAddress(s: string): boolean {
  return SUI_ADDRESS_REGEX.test(s);
}

/**
 * Format a Sui address as 16 groups of 4 hex characters, with the 0x
 * prefix preserved. Example:
 *   `0x2314 55f0 e980 5bdd 0945 9814 63da f034 6310 a7b3 b04a 733b 011c c791 feb8 96cd`
 *
 * Falls back to the input unchanged when not a valid 0x...64-hex string.
 */
export function formatChunkedAddress(addr: string, groupSize = 4): string {
  if (!isSuiAddress(addr)) return addr;
  const hex = addr.slice(2);
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += groupSize) {
    groups.push(hex.slice(i, i + groupSize));
  }
  return `0x${groups.join(' ')}`;
}

/**
 * Iterative Levenshtein with O(min(a, b)) memory. We bail at `cap` so
 * we never burn cycles when the strings are wildly different — the
 * caller only cares about "is the distance small enough to warrant a
 * 'did you mean?' nudge".
 */
export function levenshtein(a: string, b: string, cap = Infinity): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Find the closest saved contact to `to` by Levenshtein distance on the
 * normalized 0x...64-hex string. Returns the match only when the
 * distance is non-zero (an exact match is "this IS the contact", not a
 * near miss) and below `maxDistance` (default 4 — empirically good for
 * catching single-character typos and adjacent-key errors without
 * flagging legitimately different addresses).
 */
export function findNearContact<T extends { name: string; address: string }>(
  to: string,
  contacts: ReadonlyArray<T>,
  maxDistance = 4,
): T | null {
  if (!isSuiAddress(to)) return null;
  const normalized = to.toLowerCase();

  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of contacts) {
    const candidate = c.address.toLowerCase();
    if (candidate === normalized) return null;
    const dist = levenshtein(normalized, candidate, maxDistance);
    if (dist > 0 && dist <= maxDistance && dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

export function findContactByAddress<T extends { name: string; address: string }>(
  to: string,
  contacts: ReadonlyArray<T>,
): T | null {
  if (!to) return null;
  const normalized = to.trim().toLowerCase();
  return contacts.find((c) => c.address.trim().toLowerCase() === normalized) ?? null;
}

/**
 * Suggests an auto-name for an unnamed wallet (Wallet 1, Wallet 2, ...).
 * Counts existing contacts that match `Wallet N` and returns the next
 * integer. Used as the placeholder + fallback for the
 * "save as contact" inline field on the permission card.
 */
export function nextAutoWalletName(
  contacts: ReadonlyArray<{ name: string }>,
): string {
  const taken = new Set<number>();
  for (const c of contacts) {
    const m = /^Wallet\s+(\d+)$/i.exec(c.name);
    if (m) taken.add(Number(m[1]));
  }
  let i = 1;
  while (taken.has(i)) i++;
  return `Wallet ${i}`;
}
