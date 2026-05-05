// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — /api/engine/resume-with-input route helpers
//
// Covers the pure helpers exported via `__testables`:
//   1. validateValues — schema-keyed defense-in-depth (Zod-style coercion)
//   2. resolveRecipientField — sui-recipient polymorphic resolution
//   3. persistAddRecipientContact — Contact upsert + dedupe
//
// HTTP-layer + engine.resumeWithInput round-trip ride along with the P9.6
// release wiring (engine v1.18.0 publish + audric flag flip). For now the
// route's @ts-expect-error annotation marks the call site that v1.18.0
// unblocks.
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { __testables } from './route';
import type { FormSchema } from '@/lib/engine/sse-types';

// ───────────────────────────────────────────────────────────────────────────
// Engine resolver mocks — `normalizeAddressInput` + `resolveAddressToSuinsViaRpc`.
// Stub them via the module path so the import in route.ts resolves to the
// mock in this file's scope.
// ───────────────────────────────────────────────────────────────────────────

vi.mock('@t2000/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@t2000/engine')>();
  return {
    ...actual,
    normalizeAddressInput: vi.fn(async (raw: string) => {
      // Bare 0x → no SuiNS sidecar.
      if (raw.startsWith('0x')) {
        return { address: raw.toLowerCase(), suinsName: null };
      }
      // SuiNS-shaped → resolved + sidecar populated.
      if (raw.endsWith('.sui')) {
        return {
          address: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
          suinsName: raw,
        };
      }
      throw new Error(`Could not resolve: ${raw}`);
    }),
    resolveAddressToSuinsViaRpc: vi.fn(async () => []),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    userPreferences: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';

const { validateValues, resolveRecipientField, persistAddRecipientContact } = __testables;

// ───────────────────────────────────────────────────────────────────────────
// validateValues
// ───────────────────────────────────────────────────────────────────────────

describe('validateValues — defense-in-depth schema coercion', () => {
  it('returns ok=true and trims string fields when all required fields are filled', () => {
    const schema: FormSchema = {
      fields: [
        { name: 'name', label: 'Name', kind: 'text', required: true },
        { name: 'identifier', label: 'Identifier', kind: 'sui-recipient', required: true },
      ],
    };
    const result = validateValues(schema, {
      name: '  Mom  ',
      identifier: 'mom.audric.sui',
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.coerced).toEqual({
      name: 'Mom',
      identifier: 'mom.audric.sui',
    });
  });

  it('flags required + empty fields with "Required"', () => {
    const schema: FormSchema = {
      fields: [{ name: 'name', label: 'Name', kind: 'text', required: true }],
    };
    const result = validateValues(schema, { name: '' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual({ name: 'Required' });
  });

  it('coerces number / usd inputs to JS Number; flags non-numeric strings', () => {
    const schema: FormSchema = {
      fields: [
        { name: 'qty', label: 'Quantity', kind: 'number', required: true },
        { name: 'amt', label: 'Amount', kind: 'usd', required: true },
      ],
    };
    const result = validateValues(schema, { qty: '7', amt: '12.50' });
    expect(result.ok).toBe(true);
    expect(result.coerced).toEqual({ qty: 7, amt: 12.5 });

    const bad = validateValues(schema, { qty: 'seven', amt: '12.50' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.qty).toMatch(/number/i);
  });

  it('rejects select values not in the options allow-list', () => {
    const schema: FormSchema = {
      fields: [
        {
          name: 'color',
          label: 'Color',
          kind: 'select',
          required: true,
          options: [
            { value: 'red', label: 'Red' },
            { value: 'blue', label: 'Blue' },
          ],
        },
      ],
    };
    expect(validateValues(schema, { color: 'red' }).ok).toBe(true);
    const bad = validateValues(schema, { color: 'green' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.color).toMatch(/valid/i);
  });

  it('rejects date values not in YYYY-MM-DD format', () => {
    const schema: FormSchema = {
      fields: [{ name: 'd', label: 'Date', kind: 'date', required: true }],
    };
    expect(validateValues(schema, { d: '2026-05-01' }).ok).toBe(true);
    const bad = validateValues(schema, { d: '2026/05/01' });
    expect(bad.ok).toBe(false);
    expect(bad.errors.d).toMatch(/YYYY-MM-DD/);
  });

  it('skips optional empty fields (no error, no coerced entry)', () => {
    const schema: FormSchema = {
      fields: [{ name: 'note', label: 'Note', kind: 'text', required: false }],
    };
    const result = validateValues(schema, { note: '' });
    expect(result.ok).toBe(true);
    expect(result.coerced).toEqual({});
  });
});

// ───────────────────────────────────────────────────────────────────────────
// resolveRecipientField
// ───────────────────────────────────────────────────────────────────────────

describe('resolveRecipientField — polymorphic identifier resolution', () => {
  it('resolves a SuiNS name to canonical 0x + populates audricUsername from the sidecar', async () => {
    const result = await resolveRecipientField('mom.audric.sui');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonical).toMatch(/^0x[0-9a-f]+$/);
    expect(result.value.audricUsername).toBe('mom.audric.sui');
    expect(result.value.raw).toBe('mom.audric.sui');
  });

  it('resolves a bare 0x and returns audricUsername=undefined when reverse lookup fails', async () => {
    const result = await resolveRecipientField(
      '0x40cd0000000000000000000000000000000000000000000000000000000000ab',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.canonical).toMatch(/^0x[0-9a-f]+$/);
    expect(result.value.audricUsername).toBeUndefined();
  });

  it('returns ok=false with a useful error when normalize throws', async () => {
    const result = await resolveRecipientField('not-an-address');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/resolve/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// persistAddRecipientContact
// ───────────────────────────────────────────────────────────────────────────

describe('persistAddRecipientContact — Contact upsert + dedupe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a new contact row in the SPEC 10 D7 unified shape', async () => {
    (prisma.userPreferences.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      contacts: [],
    });

    await persistAddRecipientContact(
      '0x1234',
      'Mom',
      'mom.audric.sui',
      {
        raw: 'mom.audric.sui',
        canonical: '0xabc',
        audricUsername: 'mom.audric.sui',
      },
    );

    const upsert = (prisma.userPreferences.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsert.where).toEqual({ address: '0x1234' });
    const newContacts = upsert.update.contacts as Array<Record<string, unknown>>;
    expect(newContacts).toHaveLength(1);
    expect(newContacts[0]).toMatchObject({
      name: 'Mom',
      identifier: 'mom.audric.sui',
      resolvedAddress: '0xabc',
      audricUsername: 'mom.audric.sui',
      source: 'agent',
    });
    expect(newContacts[0].addedAt).toEqual(expect.any(Number));
  });

  it('dedupes against an existing contact with the same case-insensitive name', async () => {
    (prisma.userPreferences.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      contacts: [
        {
          name: 'mom',
          address: '0xolder',
        },
      ],
    });

    await persistAddRecipientContact(
      '0x1234',
      'Mom',
      'mom.audric.sui',
      {
        raw: 'mom.audric.sui',
        canonical: '0xabc',
        audricUsername: 'mom.audric.sui',
      },
    );

    const upsert = (prisma.userPreferences.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const newContacts = upsert.update.contacts as Array<Record<string, unknown>>;
    expect(newContacts).toHaveLength(1);
    // The legacy `address` field survives + the new fields overlay it.
    expect(newContacts[0]).toMatchObject({
      name: 'Mom',
      resolvedAddress: '0xabc',
      identifier: 'mom.audric.sui',
    });
  });

  it('appends to existing contacts when the name does NOT match', async () => {
    (prisma.userPreferences.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      contacts: [
        { name: 'Dad', address: '0xdad' },
      ],
    });

    await persistAddRecipientContact(
      '0x1234',
      'Mom',
      'mom.audric.sui',
      {
        raw: 'mom.audric.sui',
        canonical: '0xabc',
      },
    );

    const upsert = (prisma.userPreferences.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const newContacts = upsert.update.contacts as Array<Record<string, unknown>>;
    expect(newContacts).toHaveLength(2);
    expect(newContacts.map((c) => c.name)).toEqual(['Dad', 'Mom']);
  });

  it('handles a missing UserPreferences row by creating one via upsert', async () => {
    (prisma.userPreferences.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await persistAddRecipientContact(
      '0x1234',
      'Mom',
      'mom.audric.sui',
      { raw: 'mom.audric.sui', canonical: '0xabc' },
    );

    const upsert = (prisma.userPreferences.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(upsert.create).toMatchObject({ address: '0x1234' });
    const newContacts = upsert.create.contacts as Array<Record<string, unknown>>;
    expect(newContacts).toHaveLength(1);
  });
});
