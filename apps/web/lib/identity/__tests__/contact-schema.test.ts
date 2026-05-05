import { describe, expect, it } from 'vitest';
import {
  contactFromSaveInput,
  parseContact,
  parseContactList,
  serializeContactList,
  UnifiedContactSchema,
  type Contact,
} from '../contact-schema';

/**
 * Tests for the contact Zod schema (SPEC 10 v0.2.1 Phase A.2).
 *
 * The schema sits at the parse boundary between the persistent Json column
 * `UserPreferences.contacts` and every consumer of contact data. It MUST
 * handle three input regimes correctly:
 *
 *   1. Legacy `{name, address}` rows from existing prod data — lifted to
 *      unified shape with `source: 'import'` defaults. This is what makes
 *      the migration "behavior-preserving by construction" (B-5).
 *   2. New unified rows written by post-A.2 code — passthrough validation.
 *   3. Mixed arrays (some legacy + some unified) — common during the
 *      migration period before every user has touched their contacts at
 *      least once. Must produce a uniformly-shaped output.
 *
 * Plus standard defensive cases: malformed rows dropped silently, non-array
 * inputs returning empty, etc.
 */

const ADDR_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('parseContact — single-row parsing', () => {
  it('passes through a unified-shape row unchanged', () => {
    const raw = {
      name: 'Alice',
      identifier: 'alice.audric.sui',
      resolvedAddress: ADDR_A,
      audricUsername: 'alice.audric.sui',
      addedAt: '2026-05-05T12:00:00.000Z',
      source: 'save_contact',
    };
    const parsed = parseContact(raw);
    expect(parsed).toEqual(raw);
  });

  it('lifts a legacy {name, address} row to unified shape with import defaults', () => {
    const parsed = parseContact({ name: 'Bob', address: ADDR_B });
    expect(parsed).toEqual({
      name: 'Bob',
      identifier: ADDR_B,
      resolvedAddress: ADDR_B.toLowerCase(),
      audricUsername: null,
      source: 'import',
    });
  });

  it('lowercases the resolvedAddress when lifting legacy', () => {
    const upperAddr = ADDR_A.toUpperCase().replace('0X', '0x');
    const parsed = parseContact({ name: 'Cara', address: upperAddr });
    expect(parsed?.identifier).toBe(upperAddr); // identifier preserves caller input
    expect(parsed?.resolvedAddress).toBe(upperAddr.toLowerCase());
  });

  it('returns null for malformed input (missing both legacy and unified shapes)', () => {
    expect(parseContact({ name: 'no-address' })).toBeNull();
    expect(parseContact({ address: ADDR_A })).toBeNull();
    expect(parseContact({})).toBeNull();
    expect(parseContact(null)).toBeNull();
    expect(parseContact(undefined)).toBeNull();
    expect(parseContact('string-not-object')).toBeNull();
    expect(parseContact(42)).toBeNull();
  });

  it('rejects unified rows with malformed Sui address in resolvedAddress', () => {
    const malformed = {
      name: 'Bad',
      identifier: 'something.audric.sui',
      resolvedAddress: 'not-a-real-address',
      audricUsername: null,
      source: 'manual',
    };
    expect(parseContact(malformed)).toBeNull();
  });

  it('rejects empty names (defensive — guards the LLM input boundary)', () => {
    expect(parseContact({ name: '', address: ADDR_A })).toBeNull();
    expect(parseContact({ name: '   ', address: ADDR_A })).toBeNull();
  });

  it('rejects names exceeding the 50-char cap', () => {
    const tooLong = 'x'.repeat(51);
    expect(parseContact({ name: tooLong, address: ADDR_A })).toBeNull();
  });

  it('accepts names exactly at the 50-char cap', () => {
    const exact = 'x'.repeat(50);
    const parsed = parseContact({ name: exact, address: ADDR_A });
    expect(parsed?.name).toBe(exact);
  });
});

describe('parseContactList — array parsing with mixed shapes', () => {
  it('returns empty array for non-array inputs', () => {
    expect(parseContactList(null)).toEqual([]);
    expect(parseContactList(undefined)).toEqual([]);
    expect(parseContactList({})).toEqual([]);
    expect(parseContactList('string')).toEqual([]);
    expect(parseContactList(42)).toEqual([]);
  });

  it('returns empty array for empty array input', () => {
    expect(parseContactList([])).toEqual([]);
  });

  it('parses an all-legacy array', () => {
    const result = parseContactList([
      { name: 'Alice', address: ADDR_A },
      { name: 'Bob', address: ADDR_B },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: 'Alice',
      identifier: ADDR_A,
      resolvedAddress: ADDR_A.toLowerCase(),
      audricUsername: null,
      source: 'import',
    });
    expect(result[1]).toMatchObject({
      name: 'Bob',
      identifier: ADDR_B,
      resolvedAddress: ADDR_B.toLowerCase(),
      audricUsername: null,
      source: 'import',
    });
  });

  it('parses an all-unified array', () => {
    const unified = [
      {
        name: 'Alice',
        identifier: 'alice.audric.sui',
        resolvedAddress: ADDR_A,
        audricUsername: 'alice.audric.sui',
        addedAt: '2026-05-05T12:00:00.000Z',
        source: 'save_contact' as const,
      },
    ];
    const result = parseContactList(unified);
    expect(result).toEqual(unified);
  });

  it('parses a MIXED legacy + unified array (the migration case)', () => {
    const result = parseContactList([
      { name: 'LegacyAlice', address: ADDR_A },
      {
        name: 'UnifiedBob',
        identifier: 'bob.audric.sui',
        resolvedAddress: ADDR_B,
        audricUsername: 'bob.audric.sui',
        source: 'save_contact',
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('import');
    expect(result[1].source).toBe('save_contact');
    expect(result[0].audricUsername).toBeNull();
    expect(result[1].audricUsername).toBe('bob.audric.sui');
  });

  it('drops malformed rows silently and keeps the good ones', () => {
    const result = parseContactList([
      { name: 'Good', address: ADDR_A },
      null,
      'string-not-object',
      { name: 'BadShape' /* missing address */ },
      { name: 123, address: ADDR_B }, // numeric name
      { /* totally empty */ },
      { name: 'AnotherGood', address: ADDR_B },
    ]);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.name)).toEqual(['Good', 'AnotherGood']);
  });
});

describe('serializeContactList — write boundary validation', () => {
  it('round-trips a valid Contact[] unchanged', () => {
    const input: Contact[] = [
      {
        name: 'Alice',
        identifier: 'alice.audric.sui',
        resolvedAddress: ADDR_A.toLowerCase(),
        audricUsername: 'alice.audric.sui',
        addedAt: '2026-05-05T12:00:00.000Z',
        source: 'save_contact',
      },
    ];
    expect(serializeContactList(input)).toEqual(input);
  });

  it('throws on a malformed row at write time (catches programming errors)', () => {
    const malformed = [
      { name: 'Bad', identifier: 'whatever', resolvedAddress: 'not-an-address' },
    ] as unknown as Contact[];
    expect(() => serializeContactList(malformed)).toThrow();
  });
});

describe('contactFromSaveInput — engine save_contact boundary', () => {
  it('produces a unified-shape Contact with save_contact source + addedAt', () => {
    const c = contactFromSaveInput({ name: 'Alice', address: ADDR_A });
    expect(c.name).toBe('Alice');
    expect(c.identifier).toBe(ADDR_A);
    expect(c.resolvedAddress).toBe(ADDR_A.toLowerCase());
    expect(c.audricUsername).toBeNull();
    expect(c.source).toBe('save_contact');
    expect(c.addedAt).toBeDefined();
    expect(() => new Date(c.addedAt!).toISOString()).not.toThrow();
  });

  it('trims the name', () => {
    const c = contactFromSaveInput({ name: '  Alice  ', address: ADDR_A });
    expect(c.name).toBe('Alice');
  });

  it('throws on a malformed address (delegates to UnifiedContactSchema.parse)', () => {
    expect(() =>
      contactFromSaveInput({ name: 'X', address: 'not-an-address' }),
    ).toThrow();
  });
});

describe('SPEC 9 P9.4 compat — addedAt:number + source:agent rows round-trip', () => {
  // The P9.4 add_recipient flow (apps/web/app/api/engine/resume-with-input/
  // route-helpers.ts) writes contacts with addedAt: Date.now() (number, not
  // ISO string) and source: 'agent'. When SPEC 10 A.2 landed, my initial
  // schema rejected these on parse. The schema now accepts both addedAt
  // shapes (normalizing number→ISO on parse) and the 'agent' source enum
  // value — guards against breaking every picker-saved contact in prod.
  it('parses a row with addedAt:number (P9.4 picker shape)', () => {
    const epochMs = 1714928045123;
    const parsed = parseContact({
      name: 'Mom',
      identifier: 'mom.audric.sui',
      resolvedAddress: ADDR_A,
      audricUsername: 'mom.audric.sui',
      addedAt: epochMs,
      source: 'agent',
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.source).toBe('agent');
    // Number got normalized to ISO datetime string on parse.
    expect(parsed?.addedAt).toBe(new Date(epochMs).toISOString());
  });

  it('parses an array containing both P9.4 picker rows and post-A.2 rows', () => {
    const result = parseContactList([
      // P9.4 picker row
      {
        name: 'Mom',
        identifier: 'mom.audric.sui',
        resolvedAddress: ADDR_A,
        audricUsername: 'mom.audric.sui',
        addedAt: 1714928045123,
        source: 'agent',
      },
      // Post-A.2 save_contact row
      {
        name: 'Bob',
        identifier: ADDR_B,
        resolvedAddress: ADDR_B.toLowerCase(),
        audricUsername: null,
        addedAt: '2026-05-05T20:00:00.000Z',
        source: 'save_contact',
      },
      // Pre-A.2 legacy row
      { name: 'Alice', address: ADDR_A },
    ]);
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.source)).toEqual(['agent', 'save_contact', 'import']);
    // All addedAt values that exist are ISO strings post-normalization.
    expect(typeof result[0].addedAt).toBe('string');
    expect(typeof result[1].addedAt).toBe('string');
    expect(result[2].addedAt).toBeUndefined(); // legacy lift omits addedAt
  });

  it('serializeContactList round-trips a P9.4 picker row as ISO string', () => {
    const epochMs = 1714928045123;
    const parsed = parseContactList([
      {
        name: 'Mom',
        identifier: 'mom.audric.sui',
        resolvedAddress: ADDR_A,
        audricUsername: 'mom.audric.sui',
        addedAt: epochMs,
        source: 'agent',
      },
    ]);
    const serialized = serializeContactList(parsed);
    // Computed at test time so we don't hardcode timezone-shifted constants.
    expect(serialized[0].addedAt).toBe(new Date(epochMs).toISOString());
    expect(serialized[0].source).toBe('agent');
  });
});

describe('UnifiedContactSchema — declarative shape', () => {
  it('makes audricUsername optional + nullable', () => {
    expect(
      UnifiedContactSchema.safeParse({
        name: 'A',
        identifier: 'x',
        resolvedAddress: ADDR_A,
        audricUsername: null,
      }).success,
    ).toBe(true);
    expect(
      UnifiedContactSchema.safeParse({
        name: 'A',
        identifier: 'x',
        resolvedAddress: ADDR_A,
      }).success,
    ).toBe(true);
    expect(
      UnifiedContactSchema.safeParse({
        name: 'A',
        identifier: 'x',
        resolvedAddress: ADDR_A,
        audricUsername: 'a.audric.sui',
      }).success,
    ).toBe(true);
  });

  it('rejects identifier that is empty string', () => {
    expect(
      UnifiedContactSchema.safeParse({
        name: 'A',
        identifier: '',
        resolvedAddress: ADDR_A,
      }).success,
    ).toBe(false);
  });
});
