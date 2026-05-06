import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '@t2000/engine';

/**
 * SPEC 10 D.3 — `lookup_user` tool tests.
 *
 * Coverage:
 *  - Forward lookups (bare label / @label / full audric handle)
 *  - Reverse lookups (0x address → audric user)
 *  - Negative paths: not-found, invalid-label, reserved-label, not-audric-suins
 *  - Auto permission + cacheable + isReadOnly invariants (auto-permission
 *    matters — if this tool ever silently flips to `confirm` the LLM
 *    would yield pending_action for "who is alice", which is broken UX)
 */

// Hoist mocks above the dynamic import (vi.mock factory cannot reference
// module-scope `let`/`const`) — same pattern as contact-tools.test.ts.
const { mockUserFindFirst } = vi.hoisted(() => ({
  mockUserFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: mockUserFindFirst,
    },
  },
}));

import { lookupUserTool } from '../lookup-user-tool';

const ALICE_ADDR = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CLAIMED_AT = new Date('2026-05-15T12:00:00.000Z');

const ctx: ToolContext = {
  agent: undefined,
  mcpManager: undefined,
} as unknown as ToolContext;

beforeEach(() => {
  mockUserFindFirst.mockReset();
});

describe('lookupUserTool — declarative shape', () => {
  it('is named lookup_user', () => {
    expect(lookupUserTool.name).toBe('lookup_user');
  });

  it('is read-only (auto permission, never yields pending_action)', () => {
    expect(lookupUserTool.isReadOnly).toBe(true);
    expect(lookupUserTool.permissionLevel).toBe('auto');
  });

  it('is cacheable (engine dedupes within turn)', () => {
    expect(lookupUserTool.cacheable).toBe(true);
  });
});

describe('lookupUserTool — preflight', () => {
  it('rejects empty query', () => {
    expect(lookupUserTool.preflight?.({ query: '' })).toEqual({
      valid: false,
      error: 'query is required',
    });
  });

  it('rejects whitespace-only query', () => {
    expect(lookupUserTool.preflight?.({ query: '   ' })).toEqual({
      valid: false,
      error: 'query is required',
    });
  });

  it('accepts a normal label', () => {
    expect(lookupUserTool.preflight?.({ query: 'alice' })).toEqual({ valid: true });
  });
});

describe('lookupUserTool — forward (label) hit', () => {
  beforeEach(() => {
    mockUserFindFirst.mockResolvedValue({
      username: 'alice',
      suiAddress: ALICE_ADDR,
      usernameClaimedAt: CLAIMED_AT,
    });
  });

  it('looks up bare "alice" by username', async () => {
    const result = await lookupUserTool.call({ query: 'alice' }, ctx);
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'alice' } }),
    );
    expect(result.data).toMatchObject({
      found: true,
      username: 'alice',
      fullHandle: 'alice.audric.sui',
      address: ALICE_ADDR,
      claimedAt: CLAIMED_AT.toISOString(),
      isAudricUser: true,
      profileUrl: 'https://audric.ai/alice',
    });
  });

  it('strips leading @ from "@alice"', async () => {
    await lookupUserTool.call({ query: '@alice' }, ctx);
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'alice' } }),
    );
  });

  it('strips .audric.sui suffix from full handle', async () => {
    await lookupUserTool.call({ query: 'alice.audric.sui' }, ctx);
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'alice' } }),
    );
  });

  it('lowercases mixed-case input', async () => {
    await lookupUserTool.call({ query: '@Alice.AUDRIC.sui' }, ctx);
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { username: 'alice' } }),
    );
  });

  it('preserves the original query in the result for narration', async () => {
    const result = await lookupUserTool.call({ query: '@Alice' }, ctx);
    expect(result.data).toMatchObject({ found: true, query: '@Alice' });
  });

  it('renders displayText as fullHandle → truncated address', async () => {
    const result = await lookupUserTool.call({ query: 'alice' }, ctx);
    expect(result.displayText).toContain('alice.audric.sui');
    expect(result.displayText).toContain(ALICE_ADDR.slice(0, 10));
    expect(result.displayText).toContain(ALICE_ADDR.slice(-6));
  });
});

describe('lookupUserTool — reverse (address) hit', () => {
  it('looks up 0x address by suiAddress', async () => {
    mockUserFindFirst.mockResolvedValue({
      username: 'bob',
      suiAddress: BOB_ADDR,
      usernameClaimedAt: CLAIMED_AT,
    });
    const result = await lookupUserTool.call({ query: BOB_ADDR }, ctx);
    expect(mockUserFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { suiAddress: BOB_ADDR } }),
    );
    expect(result.data).toMatchObject({
      found: true,
      username: 'bob',
      fullHandle: 'bob.audric.sui',
      address: BOB_ADDR,
    });
  });

  it('rejects malformed address (too short)', async () => {
    const result = await lookupUserTool.call({ query: '0xabcd' }, ctx);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      found: false,
      reason: 'invalid-address',
    });
  });

  it('rejects malformed address (non-hex chars)', async () => {
    const bad = '0x' + 'g'.repeat(64);
    const result = await lookupUserTool.call({ query: bad }, ctx);
    expect(result.data).toMatchObject({ found: false, reason: 'invalid-address' });
  });
});

describe('lookupUserTool — misses', () => {
  it('returns no-such-user when label has no Prisma row', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const result = await lookupUserTool.call({ query: 'ghost' }, ctx);
    expect(result.data).toMatchObject({
      found: false,
      query: 'ghost',
      reason: 'no-such-user',
    });
    expect(result.displayText).toContain('ghost.audric.sui');
  });

  it('returns no-such-user when address has no claim', async () => {
    mockUserFindFirst.mockResolvedValue(null);
    const result = await lookupUserTool.call({ query: ALICE_ADDR }, ctx);
    expect(result.data).toMatchObject({
      found: false,
      reason: 'no-such-user',
    });
    expect(result.displayText).toContain(ALICE_ADDR.slice(0, 10));
  });

  it('returns no-such-user when row exists but username is null (defensive)', async () => {
    mockUserFindFirst.mockResolvedValue({
      username: null,
      suiAddress: ALICE_ADDR,
      usernameClaimedAt: null,
    });
    const result = await lookupUserTool.call({ query: ALICE_ADDR }, ctx);
    expect(result.data).toMatchObject({ found: false, reason: 'no-such-user' });
  });

  it('returns invalid-label for too-short input', async () => {
    const result = await lookupUserTool.call({ query: 'ab' }, ctx);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      found: false,
      reason: 'invalid-label',
    });
  });

  it('returns invalid-label for forbidden chars', async () => {
    const result = await lookupUserTool.call({ query: 'al!ce' }, ctx);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ found: false, reason: 'invalid-label' });
  });

  it('returns reserved-label for known reserved names', async () => {
    // "team" is in the reserved-usernames list per S.75 expansion.
    const result = await lookupUserTool.call({ query: 'team' }, ctx);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      found: false,
      reason: 'reserved-label',
    });
  });

  it('returns not-audric-suins for top-level SuiNS names', async () => {
    const result = await lookupUserTool.call({ query: 'alex.sui' }, ctx);
    expect(mockUserFindFirst).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      found: false,
      reason: 'not-audric-suins',
    });
  });

  it('returns not-audric-suins for third-party leaf subnames', async () => {
    const result = await lookupUserTool.call({ query: 'team.alex.sui' }, ctx);
    expect(result.data).toMatchObject({
      found: false,
      reason: 'not-audric-suins',
    });
  });

  it('hint for not-audric-suins points the LLM at resolve_suins', async () => {
    const result = await lookupUserTool.call({ query: 'alex.sui' }, ctx);
    if (result.data.found) throw new Error('expected miss');
    expect(result.data.hint).toContain('resolve_suins');
  });
});
