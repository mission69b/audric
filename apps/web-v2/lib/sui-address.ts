/**
 * Slim subset of Sui address helpers ported from
 * `apps/web/lib/sui-address.ts` for the Phase 5a.4 renderer migration.
 *
 * Only `isSuiAddress` + `chunkAddress` are needed by web-v2's ported
 * cards (TransactionReceiptCard + ChunkedAddress). The fuller helper
 * surface (`levenshtein`, `findNearContact`, `findContactByAddress`)
 * stays in legacy `apps/web/lib/sui-address.ts` until contact flows
 * (Phase 5d shell + send_transfer client wiring) port across.
 */

const SUI_ADDRESS_REGEX = /^0x[a-fA-F0-9]{64}$/;

export function isSuiAddress(s: string): boolean {
  return SUI_ADDRESS_REGEX.test(s);
}

/**
 * Split a Sui address into chunks for visual rendering. Returns the
 * raw groups (no spaces, no 0x). Returns `null` when not a valid
 * 0x...64-hex string.
 */
export function chunkAddress(addr: string, groupSize = 4): string[] | null {
  if (!isSuiAddress(addr)) {
    return null;
  }
  const hex = addr.slice(2);
  const groups: string[] = [];
  for (let i = 0; i < hex.length; i += groupSize) {
    groups.push(hex.slice(i, i + groupSize));
  }
  return groups;
}
