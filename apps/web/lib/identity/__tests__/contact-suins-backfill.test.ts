import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveAddressToSuinsViaRpc: vi.fn<
    (
      address: string,
      opts: { suiRpcUrl?: string; signal?: AbortSignal },
    ) => Promise<string[]>
  >(),
}));

vi.mock('@t2000/engine', () => ({
  resolveAddressToSuinsViaRpc: mocks.resolveAddressToSuinsViaRpc,
  SuinsRpcError: class SuinsRpcError extends Error {},
}));

import { backfillAudricUsernames } from '../contact-suins-backfill';
import type { Contact } from '../contact-schema';

const ADDR = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    name: 'Test',
    identifier: ADDR,
    resolvedAddress: ADDR,
    ...overrides,
  };
}

describe('backfillAudricUsernames — needsCheck behavior (S18-F8)', () => {
  beforeEach(() => {
    mocks.resolveAddressToSuinsViaRpc.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('checks contacts with undefined audricUsername (legacy / never checked)', async () => {
    mocks.resolveAddressToSuinsViaRpc.mockResolvedValueOnce(['x.audric.sui']);
    const result = await backfillAudricUsernames([makeContact()]);
    expect(mocks.resolveAddressToSuinsViaRpc).toHaveBeenCalledTimes(1);
    expect(result.contacts[0].audricUsername).toBe('x.audric.sui');
    expect(result.contacts[0].audricUsernameCheckedAt).toBeDefined();
  });

  it('checks contacts with null audricUsername that lack a checkedAt stamp', async () => {
    mocks.resolveAddressToSuinsViaRpc.mockResolvedValueOnce(['x.audric.sui']);
    const result = await backfillAudricUsernames([
      makeContact({ audricUsername: null }),
    ]);
    expect(mocks.resolveAddressToSuinsViaRpc).toHaveBeenCalledTimes(1);
    expect(result.contacts[0].audricUsername).toBe('x.audric.sui');
  });

  it('SKIPS contacts with null audricUsername + recent checkedAt (within 24h)', async () => {
    const recentCheckedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(); // 1h ago
    const result = await backfillAudricUsernames([
      makeContact({ audricUsername: null, audricUsernameCheckedAt: recentCheckedAt }),
    ]);
    expect(mocks.resolveAddressToSuinsViaRpc).not.toHaveBeenCalled();
    expect(result.attempted).toBe(0);
    expect(result.changed).toBe(false);
  });

  it('RE-CHECKS contacts with null audricUsername + stale checkedAt (older than 24h)', async () => {
    const staleCheckedAt = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
    mocks.resolveAddressToSuinsViaRpc.mockResolvedValueOnce(['x.audric.sui']);
    const result = await backfillAudricUsernames([
      makeContact({ audricUsername: null, audricUsernameCheckedAt: staleCheckedAt }),
    ]);
    expect(mocks.resolveAddressToSuinsViaRpc).toHaveBeenCalledTimes(1);
    expect(result.contacts[0].audricUsername).toBe('x.audric.sui');
  });

  it('NEVER re-checks contacts with a confirmed audricUsername string', async () => {
    const result = await backfillAudricUsernames([
      makeContact({ audricUsername: 'alice.audric.sui' }),
    ]);
    expect(mocks.resolveAddressToSuinsViaRpc).not.toHaveBeenCalled();
    expect(result.contacts[0].audricUsername).toBe('alice.audric.sui');
  });

  it('STAMPS checkedAt + null on errored RPCs (so next 24h skips re-RPC)', async () => {
    mocks.resolveAddressToSuinsViaRpc.mockRejectedValueOnce(
      new Error('SuiNS lookup failed for "0x1234..." (Name has expired)'),
    );
    const result = await backfillAudricUsernames([makeContact()]);
    expect(result.errored).toBe(1);
    expect(result.contacts[0].audricUsername).toBeNull();
    expect(result.contacts[0].audricUsernameCheckedAt).toBeDefined();
    expect(result.changed).toBe(true);
  });

  it('does not re-emit "Name has expired" on subsequent backfill within 24h', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    mocks.resolveAddressToSuinsViaRpc.mockRejectedValueOnce(
      new Error('SuiNS lookup failed for "0x1234..." (Name has expired)'),
    );

    const r1 = await backfillAudricUsernames([makeContact()]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAddressToSuinsViaRpc).toHaveBeenCalledTimes(1);

    const r2 = await backfillAudricUsernames(r1.contacts);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(mocks.resolveAddressToSuinsViaRpc).toHaveBeenCalledTimes(1);
    expect(r2.attempted).toBe(0);
  });

  it('marks changed=true when ONLY checkedAt updates (so caller persists the stamp)', async () => {
    mocks.resolveAddressToSuinsViaRpc.mockResolvedValueOnce([]);
    const result = await backfillAudricUsernames([
      makeContact({ audricUsername: null }),
    ]);
    expect(result.contacts[0].audricUsername).toBeNull();
    expect(result.contacts[0].audricUsernameCheckedAt).toBeDefined();
    expect(result.changed).toBe(true);
  });

  it('returns early (no RPCs) when ALL contacts are recent / confirmed', async () => {
    const recentCheckedAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const result = await backfillAudricUsernames([
      makeContact({ audricUsername: 'alice.audric.sui', resolvedAddress: ADDR }),
      makeContact({
        audricUsername: null,
        audricUsernameCheckedAt: recentCheckedAt,
        resolvedAddress: ADDR.replace('1', '2'),
      }),
    ]);
    expect(mocks.resolveAddressToSuinsViaRpc).not.toHaveBeenCalled();
    expect(result.attempted).toBe(0);
    expect(result.changed).toBe(false);
  });
});
