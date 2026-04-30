import { describe, it, expect } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  extractTopLevelTransferObjectRecipients,
  assertAllowedAddressesCoverTransfers,
} from '../sponsor-allowed-addresses';

const SENDER = '0x' + '1'.repeat(64);
const TREASURY = '0x5366efbf2b4fe5767fe2e78eb197aa5f5d138d88ac3333fbf3f80a1927da473a';
const RECIPIENT_A = '0x' + 'a'.repeat(64);
const RECIPIENT_B = '0x' + 'b'.repeat(64);

function newTx(): Transaction {
  const tx = new Transaction();
  tx.setSender(SENDER);
  return tx;
}

describe('extractTopLevelTransferObjectRecipients', () => {
  it('returns [] for a tx with no transferObjects', () => {
    const tx = newTx();
    expect(extractTopLevelTransferObjectRecipients(tx)).toEqual([]);
  });

  it('extracts the recipient of a single transferObjects', () => {
    const tx = newTx();
    tx.transferObjects([tx.gas], tx.pure.address(RECIPIENT_A));

    const recipients = extractTopLevelTransferObjectRecipients(tx);
    expect(recipients).toEqual([normalizeSuiAddress(RECIPIENT_A)]);
  });

  it('extracts recipients from multiple transferObjects (treasury + recipient)', () => {
    // Mirrors what addFeeTransfer + a send do together: split a fee, transfer
    // it to the treasury, then transfer the remaining payment to the user.
    const tx = newTx();
    const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(1000))]);
    tx.transferObjects([feeCoin], tx.pure.address(TREASURY));
    tx.transferObjects([tx.gas], tx.pure.address(RECIPIENT_A));

    const recipients = extractTopLevelTransferObjectRecipients(tx);
    expect(recipients).toEqual([
      normalizeSuiAddress(TREASURY),
      normalizeSuiAddress(RECIPIENT_A),
    ]);
  });

  it('skips transferObjects whose recipient is a Result (computed)', () => {
    // If the recipient comes from a Move call result, it's opaque to Enoki
    // (and to us). We skip it — same behavior as Enoki's static analysis.
    const tx = newTx();
    const [moveResult] = tx.moveCall({
      target: '0x2::address::from_bytes',
      arguments: [tx.pure.vector('u8', [1, 2, 3])],
    });
    tx.transferObjects([tx.gas], moveResult);

    expect(extractTopLevelTransferObjectRecipients(tx)).toEqual([]);
  });
});

describe('assertAllowedAddressesCoverTransfers — H5 regression', () => {
  it('passes when there are no transferObjects', () => {
    const tx = newTx();
    expect(() => assertAllowedAddressesCoverTransfers(tx, [])).not.toThrow();
  });

  it('passes when every recipient is in allowedAddresses', () => {
    const tx = newTx();
    const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(1000))]);
    tx.transferObjects([feeCoin], tx.pure.address(TREASURY));

    expect(() =>
      assertAllowedAddressesCoverTransfers(tx, [TREASURY]),
    ).not.toThrow();
  });

  it('THROWS when treasury fee transfer is missing from allowedAddresses (the actual production bug)', () => {
    // This is the bug the H5 test is the regression guard for: someone
    // refactors prepare/route.ts and accidentally drops T2000_OVERLAY_FEE_WALLET
    // from `allowedAddresses`, but addFeeTransfer is still injected into the
    // PTB. Enoki rejects every save/borrow until rolled back.
    const tx = newTx();
    const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(1000))]);
    tx.transferObjects([feeCoin], tx.pure.address(TREASURY));

    expect(() => assertAllowedAddressesCoverTransfers(tx, [])).toThrow(
      /not allow-listed/,
    );
    expect(() => assertAllowedAddressesCoverTransfers(tx, [RECIPIENT_A])).toThrow(
      /not allow-listed/,
    );
  });

  it('THROWS when the user recipient is missing from allowedAddresses (send flow regression)', () => {
    // Mirrors the send flow: a transferObjects to the user-supplied recipient.
    // If params.recipient never made it into allowedAddresses (e.g. early-return
    // bug), Enoki rejects.
    const tx = newTx();
    tx.transferObjects([tx.gas], tx.pure.address(RECIPIENT_B));

    expect(() => assertAllowedAddressesCoverTransfers(tx, [TREASURY])).toThrow(
      /not allow-listed/,
    );
  });

  it('error message names every missing recipient (not just the first)', () => {
    const tx = newTx();
    const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(1000))]);
    tx.transferObjects([feeCoin], tx.pure.address(TREASURY));
    tx.transferObjects([tx.gas], tx.pure.address(RECIPIENT_A));

    let caught: Error | undefined;
    try {
      assertAllowedAddressesCoverTransfers(tx, []);
    } catch (e) {
      caught = e as Error;
    }

    expect(caught).toBeDefined();
    expect(caught!.message).toContain(normalizeSuiAddress(TREASURY));
    expect(caught!.message).toContain(normalizeSuiAddress(RECIPIENT_A));
  });

  it('normalizes addresses (case-insensitive, short-form padded) before comparing', () => {
    const tx = newTx();
    tx.transferObjects([tx.gas], tx.pure.address(RECIPIENT_A));

    const upper = '0x' + 'A'.repeat(64);
    expect(() =>
      assertAllowedAddressesCoverTransfers(tx, [upper]),
    ).not.toThrow();
  });

  // [PR-H4 / 2026-04-30] Production-caught regression: claim-rewards transfers
  // the rewards coin to the sender's own wallet via a top-level transferObjects.
  // Pre-PR-H4, prepare/route.ts only put `[treasury, recipient?]` in
  // allowedAddresses — the sender was missing, and the runtime guard correctly
  // failed claim-rewards (and would have failed swap/borrow/withdraw/volo-stake/
  // volo-unstake too — those just happened to be working in production because
  // Enoki was lenient about self-transfers). The fix in route.ts always pushes
  // `params.address` (the sender) into allowedAddresses; these tests pin the
  // contract.
  it('THROWS when sender is the transfer recipient and sender is missing from allowedAddresses (claim-rewards regression)', () => {
    const tx = newTx();
    // Mirrors what addClaimRewardsToTx in @t2000/sdk produces: claim_reward →
    // from_balance → transferObjects [coin] sender. We model the final transfer
    // here.
    tx.transferObjects([tx.gas], tx.pure.address(SENDER));

    expect(() => assertAllowedAddressesCoverTransfers(tx, [TREASURY])).toThrow(
      /not allow-listed/,
    );
    expect(() => assertAllowedAddressesCoverTransfers(tx, [TREASURY])).toThrow(
      new RegExp(normalizeSuiAddress(SENDER)),
    );
  });

  it('passes when sender is the transfer recipient AND sender is in allowedAddresses (the fix)', () => {
    const tx = newTx();
    tx.transferObjects([tx.gas], tx.pure.address(SENDER));

    // [TREASURY, SENDER] mirrors what route.ts now passes for every write op.
    expect(() =>
      assertAllowedAddressesCoverTransfers(tx, [TREASURY, SENDER]),
    ).not.toThrow();
  });

  it('passes when both treasury fee + sender output are present (borrow / save with USDC fee)', () => {
    // Mirrors the borrow flow: addBorrowToTx → addFeeTransfer to treasury →
    // transferObjects [borrowedCoin] to sender. Both recipients must be in
    // allowedAddresses or Enoki rejects.
    const tx = newTx();
    const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(BigInt(100))]);
    tx.transferObjects([feeCoin], tx.pure.address(TREASURY));
    tx.transferObjects([tx.gas], tx.pure.address(SENDER));

    expect(() =>
      assertAllowedAddressesCoverTransfers(tx, [TREASURY, SENDER]),
    ).not.toThrow();
  });
});
