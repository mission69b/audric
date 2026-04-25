import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ToolContext } from '@t2000/engine';

/**
 * Unit tests for the audric-side contact tools.
 *
 * The system-level bug these tools close: the previous implementation
 * stubbed `save_contact` server-side and delegated persistence to a
 * client `useContacts.addContact` callback that didn't check `res.ok`,
 * so any non-2xx response silently lost the contact while the LLM
 * happily narrated "Saved". A new session then loaded an empty list.
 *
 * These tests assert the new tools persist deterministically through
 * Prisma and that idempotency / validation hold.
 */

// `vi.mock` is hoisted, so the factory can't close over module-scope
// `let`/`const`. `vi.hoisted` lifts this object alongside the mock so the
// factory and the assertions both reference the same instance.
const { mockUserPreferences } = vi.hoisted(() => ({
  mockUserPreferences: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreferences: mockUserPreferences,
  },
}));

import { audricSaveContactTool, audricListContactsTool } from '../contact-tools';

const WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CONTACT_ADDR = '0x321987e5555037e281e5e83d311ec9e29eb6d6f2e99bf6068fe1b6e62f9e72d2';
const OTHER_ADDR = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

// Use a sentinel for "no wallet" so the default-parameter trick doesn't
// silently substitute the test wallet when callers pass `undefined`.
const NO_WALLET = Symbol('no-wallet');
const ctx = (walletAddress: string | typeof NO_WALLET = WALLET): ToolContext =>
  ({
    agent: undefined,
    mcpManager: undefined,
    walletAddress: walletAddress === NO_WALLET ? undefined : walletAddress,
  }) as unknown as ToolContext;

beforeEach(() => {
  mockUserPreferences.findUnique.mockReset();
  mockUserPreferences.upsert.mockReset();
});

describe('audricSaveContactTool — declarative shape', () => {
  it('is named save_contact (overrides engine stub)', () => {
    expect(audricSaveContactTool.name).toBe('save_contact');
  });

  it('runs auto so the engine never yields pending_action for it', () => {
    expect(audricSaveContactTool.permissionLevel).toBe('auto');
    expect(audricSaveContactTool.isReadOnly).toBe(false);
  });
});

describe('audricSaveContactTool.call — persistence', () => {
  it('upserts a brand-new contact into Postgres', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({ contacts: [] });
    mockUserPreferences.upsert.mockResolvedValue({});

    const result = await audricSaveContactTool.call!(
      { name: 'Wallet1', address: CONTACT_ADDR },
      ctx(),
    );

    expect(mockUserPreferences.upsert).toHaveBeenCalledTimes(1);
    const args = mockUserPreferences.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ address: WALLET });
    expect(args.create.contacts).toEqual([
      { name: 'Wallet1', address: CONTACT_ADDR },
    ]);
    expect(args.update.contacts).toEqual([
      { name: 'Wallet1', address: CONTACT_ADDR },
    ]);

    expect((result.data as { action: string }).action).toBe('created');
  });

  it('preserves existing contacts when adding a new one', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [{ name: 'Alex', address: OTHER_ADDR }],
    });
    mockUserPreferences.upsert.mockResolvedValue({});

    await audricSaveContactTool.call!(
      { name: 'Wallet1', address: CONTACT_ADDR },
      ctx(),
    );

    const args = mockUserPreferences.upsert.mock.calls[0][0];
    expect(args.update.contacts).toEqual([
      { name: 'Alex', address: OTHER_ADDR },
      { name: 'Wallet1', address: CONTACT_ADDR },
    ]);
  });

  it('is a true no-op when the same name+address is saved twice', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [{ name: 'Wallet1', address: CONTACT_ADDR }],
    });

    const result = await audricSaveContactTool.call!(
      { name: 'Wallet1', address: CONTACT_ADDR },
      ctx(),
    );

    expect(mockUserPreferences.upsert).not.toHaveBeenCalled();
    expect((result.data as { action: string }).action).toBe('unchanged');
  });

  it('renames a contact when the same address is saved with a new name', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [{ name: 'OldName', address: CONTACT_ADDR }],
    });
    mockUserPreferences.upsert.mockResolvedValue({});

    const result = await audricSaveContactTool.call!(
      { name: 'NewName', address: CONTACT_ADDR },
      ctx(),
    );

    const args = mockUserPreferences.upsert.mock.calls[0][0];
    expect(args.update.contacts).toEqual([
      { name: 'NewName', address: CONTACT_ADDR },
    ]);
    expect((result.data as { action: string }).action).toBe('updated');
  });

  it('matches addresses case-insensitively (Sui addresses are hex)', async () => {
    const upper = CONTACT_ADDR.toUpperCase().replace('0X', '0x');
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [{ name: 'Wallet1', address: CONTACT_ADDR }],
    });

    const result = await audricSaveContactTool.call!(
      { name: 'Wallet1', address: upper },
      ctx(),
    );

    expect(mockUserPreferences.upsert).not.toHaveBeenCalled();
    expect((result.data as { action: string }).action).toBe('unchanged');
  });

  it('throws on missing wallet context (no silent corruption)', async () => {
    await expect(
      audricSaveContactTool.call!(
        { name: 'Wallet1', address: CONTACT_ADDR },
        ctx(NO_WALLET),
      ),
    ).rejects.toThrow(/wallet address/i);

    expect(mockUserPreferences.upsert).not.toHaveBeenCalled();
  });

  it('rejects empty names so the LLM cannot save unidentified contacts', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({ contacts: [] });

    await expect(
      audricSaveContactTool.call!(
        { name: '   ', address: CONTACT_ADDR },
        ctx(),
      ),
    ).rejects.toThrow(/empty/i);

    expect(mockUserPreferences.upsert).not.toHaveBeenCalled();
  });
});

describe('audricListContactsTool', () => {
  it('returns the user contact list from Postgres', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [
        { name: 'Wallet1', address: CONTACT_ADDR },
        { name: 'Alex', address: OTHER_ADDR },
      ],
    });

    const result = await audricListContactsTool.call!({}, ctx());

    expect(result.data).toEqual({
      contacts: [
        { name: 'Wallet1', address: CONTACT_ADDR },
        { name: 'Alex', address: OTHER_ADDR },
      ],
      count: 2,
    });
  });

  it('returns an empty list when the user has no preferences row yet', async () => {
    mockUserPreferences.findUnique.mockResolvedValue(null);

    const result = await audricListContactsTool.call!({}, ctx());

    expect(result.data).toEqual({ contacts: [], count: 0 });
  });

  it('drops malformed contact entries without throwing', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [
        { name: 'Wallet1', address: CONTACT_ADDR },
        { name: 'broken' /* missing address */ },
        null,
        'string-not-object',
        { name: 123, address: 'numeric name is not valid' },
      ],
    });

    const result = await audricListContactsTool.call!({}, ctx());

    expect((result.data as { contacts: unknown[] }).contacts).toEqual([
      { name: 'Wallet1', address: CONTACT_ADDR },
    ]);
  });

  it('throws on missing wallet context', async () => {
    await expect(
      audricListContactsTool.call!({}, ctx(NO_WALLET)),
    ).rejects.toThrow(/wallet address/i);
  });
});
