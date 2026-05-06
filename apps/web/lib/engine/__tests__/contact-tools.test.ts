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
const ADDR_ALICE = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

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
  it('upserts a brand-new contact into Postgres (unified shape on write)', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({ contacts: [] });
    mockUserPreferences.upsert.mockResolvedValue({});

    const result = await audricSaveContactTool.call!(
      { name: 'Wallet1', address: CONTACT_ADDR },
      ctx(),
    );

    expect(mockUserPreferences.upsert).toHaveBeenCalledTimes(1);
    const args = mockUserPreferences.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ address: WALLET });
    // SPEC 10 v0.2.1 A.2 — writes emit unified Contact shape (not legacy).
    // toMatchObject lets us assert the load-bearing fields without coupling
    // to the addedAt timestamp (which is `new Date().toISOString()` at
    // write time — would break the assertion otherwise).
    expect(args.create.contacts).toHaveLength(1);
    // [SPEC 10 D.4] `audricUsername` is intentionally omitted at creation
    // — undefined signals "never reverse-checked" to the lazy backfill.
    // Hard-setting `null` here would conflate "never checked" with
    // "checked, no Audric leaf".
    expect(args.create.contacts[0]).toMatchObject({
      name: 'Wallet1',
      identifier: CONTACT_ADDR,
      resolvedAddress: CONTACT_ADDR.toLowerCase(),
      source: 'save_contact',
    });
    expect(args.create.contacts[0]).not.toHaveProperty('audricUsername');
    expect(args.create.contacts[0].addedAt).toBeDefined();
    // The LLM-facing response surface is unchanged — still {name, address}.
    expect((result.data as { action: string; address: string }).action).toBe('created');
    expect((result.data as { action: string; address: string }).address).toBe(CONTACT_ADDR);
  });

  it('preserves existing contacts when adding a new one (legacy + unified mix)', async () => {
    // Existing data is in legacy shape (the realistic prod state at A.2 launch).
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [{ name: 'Alex', address: OTHER_ADDR }],
    });
    mockUserPreferences.upsert.mockResolvedValue({});

    await audricSaveContactTool.call!(
      { name: 'Wallet1', address: CONTACT_ADDR },
      ctx(),
    );

    const args = mockUserPreferences.upsert.mock.calls[0][0];
    expect(args.update.contacts).toHaveLength(2);
    // Legacy row was lifted to unified shape on read → re-serialized on write.
    expect(args.update.contacts[0]).toMatchObject({
      name: 'Alex',
      identifier: OTHER_ADDR,
      resolvedAddress: OTHER_ADDR.toLowerCase(),
      audricUsername: null,
      source: 'import',
    });
    // New row written in unified shape with save_contact source.
    // [SPEC 10 D.4] audricUsername omitted (see note above).
    expect(args.update.contacts[1]).toMatchObject({
      name: 'Wallet1',
      identifier: CONTACT_ADDR,
      resolvedAddress: CONTACT_ADDR.toLowerCase(),
      source: 'save_contact',
    });
    expect(args.update.contacts[1]).not.toHaveProperty('audricUsername');
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
    // Rename preserves all fields except name (per Phase A.2 contract —
    // identifier, audricUsername enrichment, addedAt, source all carry over).
    expect(args.update.contacts).toHaveLength(1);
    expect(args.update.contacts[0]).toMatchObject({
      name: 'NewName',
      identifier: CONTACT_ADDR,
      resolvedAddress: CONTACT_ADDR.toLowerCase(),
      // Source stays 'import' (the legacy row's lifted source) — even though
      // the user renamed via save_contact, we don't overwrite the original
      // source. This gives us better forensics ("when did this row enter the
      // system?") than re-stamping on every edit.
      source: 'import',
    });
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
  it('returns legacy {name, address} shape to LLM (preserves tool contract)', async () => {
    // Storage may be in legacy or unified shape — the LLM-facing response
    // must remain {name, address} until a future engine release widens the
    // schema. Phase A.2 commits the host-side migration without breaking
    // the LLM tool contract.
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

  it('returns identifier-as-address for unified-shape rows (LLM contract holds across schema)', async () => {
    mockUserPreferences.findUnique.mockResolvedValue({
      contacts: [
        {
          name: 'Alice',
          identifier: ADDR_ALICE,
          resolvedAddress: ADDR_ALICE.toLowerCase(),
          audricUsername: null,
          source: 'save_contact',
        },
      ],
    });

    const result = await audricListContactsTool.call!({}, ctx());

    expect(result.data).toEqual({
      contacts: [{ name: 'Alice', address: ADDR_ALICE }],
      count: 1,
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
