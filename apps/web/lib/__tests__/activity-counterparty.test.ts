import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreferences: { findUnique: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { resolveCounterpartyDisplayMap } from '@/lib/activity-counterparty';

// Prisma's generated types are full row shapes; tests only mock the
// fields the resolver reads. Casting through `unknown` keeps the
// resolver's narrow `select:` shape contract testable without listing
// every column the User / UserPreferences models hold.
const asResolved = <T>(value: T) => value as unknown as never;

const ME = '0x' + 'a'.repeat(64);
const ALICE = '0x' + 'b'.repeat(64);
const BOB = '0x' + 'c'.repeat(64);
const CHARLIE = '0x' + 'd'.repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveCounterpartyDisplayMap', () => {
  it('returns empty map when no addresses are passed', async () => {
    const map = await resolveCounterpartyDisplayMap([], ME);
    expect(map).toEqual({});
    expect(prisma.userPreferences.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('returns Audric handles in @audric form when no contacts are saved', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(asResolved(null));
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      asResolved([
        { suiAddress: ALICE, username: 'alice' },
        { suiAddress: BOB, username: 'bob' },
      ]),
    );

    const map = await resolveCounterpartyDisplayMap([ALICE, BOB], ME);
    expect(map).toEqual({
      [ALICE.toLowerCase()]: 'alice@audric',
      [BOB.toLowerCase()]: 'bob@audric',
    });
  });

  it('returns saved contact names when no Audric users match', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(
      asResolved({
        contacts: [
          {
            name: 'Mom',
            identifier: ALICE,
            resolvedAddress: ALICE.toLowerCase(),
            audricUsername: null,
            source: 'manual',
          },
        ],
      }),
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue(asResolved([]));

    const map = await resolveCounterpartyDisplayMap([ALICE], ME);
    expect(map).toEqual({ [ALICE.toLowerCase()]: 'Mom' });
  });

  it('contact name WINS over Audric handle (user labelling beats public handle)', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(
      asResolved({
        contacts: [
          {
            name: 'Best Friend',
            identifier: ALICE,
            resolvedAddress: ALICE.toLowerCase(),
            audricUsername: 'alice@audric',
            source: 'manual',
          },
        ],
      }),
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      asResolved([{ suiAddress: ALICE, username: 'alice' }]),
    );

    const map = await resolveCounterpartyDisplayMap([ALICE], ME);
    expect(map[ALICE.toLowerCase()]).toBe('Best Friend');
  });

  it('mixed page: contact for one, Audric handle for another, untouched for third', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(
      asResolved({
        contacts: [
          {
            name: 'Mom',
            identifier: ALICE,
            resolvedAddress: ALICE.toLowerCase(),
            audricUsername: null,
            source: 'manual',
          },
        ],
      }),
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      asResolved([{ suiAddress: BOB, username: 'bob' }]),
    );

    const map = await resolveCounterpartyDisplayMap([ALICE, BOB, CHARLIE], ME);
    expect(map[ALICE.toLowerCase()]).toBe('Mom');
    expect(map[BOB.toLowerCase()]).toBe('bob@audric');
    expect(map[CHARLIE.toLowerCase()]).toBeUndefined();
  });

  it('lowercases addresses on the way in (mixed-case input)', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(asResolved(null));
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      asResolved([{ suiAddress: ALICE.toLowerCase(), username: 'alice' }]),
    );

    const mixedCase = '0x' + 'B'.repeat(32) + 'b'.repeat(32);
    await resolveCounterpartyDisplayMap([mixedCase, ALICE.toUpperCase()], ME);

    const callArg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0] as
      | { where: { suiAddress: { in: string[] } } }
      | undefined;
    expect(callArg?.where.suiAddress.in.every((a) => a === a.toLowerCase())).toBe(true);
  });

  it('degrades silently when contacts query fails', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockRejectedValue(new Error('db down'));
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      asResolved([{ suiAddress: ALICE, username: 'alice' }]),
    );

    const map = await resolveCounterpartyDisplayMap([ALICE], ME);
    expect(map[ALICE.toLowerCase()]).toBe('alice@audric');
  });

  it('degrades silently when user query fails', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(
      asResolved({
        contacts: [
          {
            name: 'Mom',
            identifier: ALICE,
            resolvedAddress: ALICE.toLowerCase(),
            audricUsername: null,
            source: 'manual',
          },
        ],
      }),
    );
    vi.mocked(prisma.user.findMany).mockRejectedValue(new Error('db down'));

    const map = await resolveCounterpartyDisplayMap([ALICE], ME);
    expect(map[ALICE.toLowerCase()]).toBe('Mom');
  });

  it('skips Audric users with null username (defensive — should not happen in DB)', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(asResolved(null));
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      asResolved([{ suiAddress: ALICE, username: null }]),
    );

    const map = await resolveCounterpartyDisplayMap([ALICE], ME);
    expect(map).toEqual({});
  });

  it('dedupes input addresses', async () => {
    vi.mocked(prisma.userPreferences.findUnique).mockResolvedValue(asResolved(null));
    vi.mocked(prisma.user.findMany).mockResolvedValue(asResolved([]));

    await resolveCounterpartyDisplayMap([ALICE, ALICE, ALICE.toUpperCase()], ME);

    const callArg = vi.mocked(prisma.user.findMany).mock.calls[0]?.[0] as
      | { where: { suiAddress: { in: string[] } } }
      | undefined;
    expect(callArg?.where.suiAddress.in).toEqual([ALICE.toLowerCase()]);
  });
});
