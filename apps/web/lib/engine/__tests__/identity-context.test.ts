import { describe, it, expect } from 'vitest';
import { buildIdentityContext } from '../engine-context';

/**
 * [SPEC 10 Phase C.1] Tests for the `<user_identity>` block helper. The
 * block lands at the top of every dynamic-context render, so the LLM
 * sees the user's claimed Audric handle (or the unclaimed-state hint)
 * before it sees balances, contacts, or financial context.
 *
 * Pinning behaviour:
 *   1. Both `<user_identity>` open + close tags wrap every output.
 *   2. Wallet line is ALWAYS present (load-bearing — referenced by the
 *      `Wallet address: …. Never ask for it.` historical note).
 *   3. When `username` is set: handle line is `Your Audric handle:
 *      {username}.audric.sui (claimed YYYY-MM-DD)`. Trailing
 *      instruction tells the LLM to apply D10 + reference contacts for
 *      other users.
 *   4. When `username` is null: no handle line, but a defensive hint
 *      tells the LLM the picker should appear at /new.
 *   5. When `claimedAt` is null but `username` is set (theoretical edge
 *      case — should not happen in production data): handle line drops
 *      the `(claimed …)` suffix without throwing.
 */

const WALLET = '0x40cd000000000000000000000000000000000000000000000000000000003e62';

describe('buildIdentityContext', () => {
  it('wraps output in <user_identity> tags', () => {
    const out = buildIdentityContext({
      walletAddress: WALLET,
      username: 'funkii',
      claimedAt: new Date('2026-05-05T12:00:00Z'),
    });
    const lines = out.split('\n');
    expect(lines[0]).toBe('<user_identity>');
    expect(lines).toContain('</user_identity>');
  });

  it('always includes the wallet line', () => {
    const claimed = buildIdentityContext({
      walletAddress: WALLET,
      username: 'funkii',
      claimedAt: new Date('2026-05-05T12:00:00Z'),
    });
    const unclaimed = buildIdentityContext({
      walletAddress: WALLET,
      username: null,
      claimedAt: null,
    });
    expect(claimed).toContain(`Your wallet: ${WALLET}`);
    expect(unclaimed).toContain(`Your wallet: ${WALLET}`);
  });

  it('S.118: renders the @audric display handle + claimed date + on-chain reference when username is set', () => {
    const out = buildIdentityContext({
      walletAddress: WALLET,
      username: 'funkii',
      claimedAt: new Date('2026-05-05T12:00:00Z'),
    });
    // [S.118 D10 reversal] The display handle (@audric) is what the LLM
    // narrates; the on-chain SuiNS NFT name (.audric.sui) is included as
    // a parenthetical for context but the LLM is told not to write it
    // back to the user.
    expect(out).toContain('Your Audric handle: funkii@audric (claimed 2026-05-05)');
    expect(out).toContain('On-chain SuiNS NFT name: funkii.audric.sui');
    expect(out).toContain('apply the D10 narration rule');
  });

  it('omits the handle line + adds a claim hint when username is null', () => {
    const out = buildIdentityContext({
      walletAddress: WALLET,
      username: null,
      claimedAt: null,
    });
    expect(out).not.toContain('Your Audric handle:');
    expect(out).toContain("haven't claimed an Audric handle yet");
    expect(out).toContain('/new');
    // No D10 narration footer — there's no handle to apply it to.
    expect(out).not.toContain('apply the D10 narration rule');
  });

  it('drops the (claimed …) suffix when claimedAt is null but username is set', () => {
    // Defensive edge case: should not happen in production data (username
    // and usernameClaimedAt are written atomically in the reserve route),
    // but the helper must not throw.
    const out = buildIdentityContext({
      walletAddress: WALLET,
      username: 'funkii',
      claimedAt: null,
    });
    // [S.118] Display handle is `funkii@audric`; on-chain handle still
    // appears for technical reference but no `(claimed …)` suffix.
    expect(out).toContain('Your Audric handle: funkii@audric');
    expect(out).not.toContain('Your Audric handle: funkii@audric (claimed');
    expect(out).not.toContain('Your Audric handle: funkii.audric.sui');
  });

  it('formats the claimed date as ISO YYYY-MM-DD (no time component)', () => {
    const out = buildIdentityContext({
      walletAddress: WALLET,
      username: 'alice',
      claimedAt: new Date('2025-12-01T23:59:59Z'),
    });
    expect(out).toContain('(claimed 2025-12-01)');
    expect(out).not.toContain('T23:59');
  });
});
