import type { Transaction } from '@mysten/sui/transactions';
import { fromBase64, toHex, normalizeSuiAddress } from '@mysten/sui/utils';

/**
 * Walk a built (or building) PTB and return every recipient address used in
 * a top-level `tx.transferObjects([...], <recipient>)` command, where the
 * recipient was passed as a literal `tx.pure.address(...)` (the only kind
 * Enoki's static analyzer can resolve).
 *
 * Recipients passed as `Result` / `NestedResult` (computed from a prior
 * Move-call output) are skipped — they're opaque to Enoki too, so they
 * don't trigger the "Address is not allow-listed for receiving transfers"
 * rejection. Same for `GasCoin` (not a valid recipient anyway).
 *
 * Used by:
 *   - `assertAllowedAddressesCoverTransfers` (runtime safety net in
 *     prepare/route.ts before the Enoki sponsor call)
 *   - `lib/__tests__/sponsor-allowed-addresses.test.ts` (PR-H5 regression
 *     suite)
 *
 * See `.cursor/rules/audric-transaction-flow.mdc` (Enoki allowedAddresses
 * rule) for why this matters.
 */
export function extractTopLevelTransferObjectRecipients(tx: Transaction): string[] {
  const data = tx.getData();
  const recipients: string[] = [];

  for (const cmd of data.commands) {
    if (cmd.$kind !== 'TransferObjects') continue;

    const addrArg = cmd.TransferObjects.address;
    if (addrArg.$kind !== 'Input') continue;

    const input = data.inputs[addrArg.Input];
    if (!input || input.$kind !== 'Pure') continue;

    const bytes = fromBase64(input.Pure.bytes);
    if (bytes.length !== 32) continue;

    recipients.push(normalizeSuiAddress('0x' + toHex(bytes)));
  }

  return recipients;
}

/**
 * Throws if any top-level `transferObjects` recipient in the PTB is missing
 * from `allowedAddresses`. Mirror of Enoki's static analysis — fails fast
 * in our process so we surface the bug as a stack trace in dev / a 500 in
 * prod, instead of letting Enoki return its terse "Address is not
 * allow-listed for receiving transfers" 400.
 *
 * Address comparison is normalized (Sui addresses are case-insensitive and
 * may be padded short-form) — `0xabc` and the 32-byte equivalent compare
 * equal.
 */
export function assertAllowedAddressesCoverTransfers(
  tx: Transaction,
  allowedAddresses: string[],
): void {
  const recipients = extractTopLevelTransferObjectRecipients(tx);
  const allowSet = new Set(allowedAddresses.map((a) => normalizeSuiAddress(a)));

  const missing = recipients.filter((r) => !allowSet.has(r));
  if (missing.length === 0) return;

  throw new Error(
    `[sponsor] Top-level transferObjects to non-allow-listed recipient(s): ${missing.join(', ')}. ` +
      `allowedAddresses passed to Enoki: ${allowedAddresses.join(', ') || '(empty)'}. ` +
      `Enoki would reject this with "Address is not allow-listed for receiving transfers". ` +
      `Add the missing address(es) to allowedAddresses in prepare/route.ts before sponsoring. ` +
      `See .cursor/rules/audric-transaction-flow.mdc for the full rule.`,
  );
}
