import { z } from 'zod';

/**
 * Contact Zod schema — the parse boundary between `UserPreferences.contacts`
 * (a Json column in Postgres) and the rest of the audric application.
 *
 * Background — why this lives here:
 *
 * Pre-SPEC 10, contacts were stored as `Array<{ name: string; address: string }>`.
 * SPEC 10 D7 evolves the model to a unified shape that supports lookups by
 * Audric handle, external SuiNS name, or bare 0x address — all with the same
 * Contact row:
 *
 *     {
 *       name:             "Alice",                     // human label
 *       identifier:       "alice.audric.sui",          // canonical lookup key
 *       resolvedAddress:  "0x40cd...3e62",             // address it currently
 *                                                       //   points to (lower)
 *       audricUsername:   "alice.audric.sui" | null,   // enrichment if .audric
 *       addedAt:          "2026-05-05T12:00:00.000Z",  // creation timestamp
 *       source:           "import" | "save_contact"    // origin of the row
 *                       | "manual" | "autocomplete",
 *     }
 *
 * The persisted Json column accumulates rows in BOTH shapes for as long as
 * legacy data exists in production. Rather than running a one-shot SQL
 * backfill (which is awkward against Json columns and provides no value at
 * our current user count), we run the migration LAZILY here: every read
 * passes through `parseContactList()`, which:
 *
 *   1. Tries to parse each row as the unified shape (cheap fast path).
 *   2. If that fails, tries the legacy `{name, address}` shape and lifts it
 *      into the unified shape with `source: 'import'` defaults.
 *   3. Drops malformed rows silently (defense — never fail a read because of
 *      one bad row in someone's contacts).
 *
 * Writes always emit the unified shape (see contact-tools.ts), so the
 * persistent data drifts toward the new shape over time without any
 * coordination. After every Audric user has touched their contacts at least
 * once (added/edited a row, which rewrites the entire array), the legacy
 * shape is gone from prod.
 *
 * Cross-references:
 *   - SPEC 10 D7 — unified Contact model (the spec)
 *   - SPEC 10 build-plan addendum B-5 — backfill strategy (locked decision)
 *   - audric-pay-flow.mdc — send-flow contract (saved-contact-name resolution)
 *   - apps/web/lib/engine/contact-tools.ts — save_contact + list_contacts
 *     tools, which read/write through this schema
 */

// SPEC 10 D3 length cap on contact names — same 50-char cap as save_contact.
const MAX_NAME_LENGTH = 50;

const SUI_ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;

export const ContactSourceSchema = z.enum([
  'import', // backfilled from legacy {name, address} on lazy migration
  'save_contact', // written by the engine `save_contact` tool
  'manual', // added via /settings/contacts UI
  'autocomplete', // added via @-typed picker in send modal
  'agent', // SPEC 9 P9.4 add_recipient flow (resume-with-input handler)
]);

export type ContactSource = z.infer<typeof ContactSourceSchema>;

/**
 * `addedAt` accepts BOTH formats and normalizes to ISO datetime string on
 * parse:
 *   - ISO datetime string (the canonical post-A.2 format, written by
 *     `contactFromSaveInput` and the `/api/user/preferences` POST handler)
 *   - Epoch ms number (the SPEC 9 P9.4 `add_recipient` flow's format —
 *     `Date.now()` → `addedAt: 1714928045123`)
 *
 * On parse, both flow into the canonical string form. New writes always
 * emit string. Existing number-shaped rows in prod data drift toward
 * string-shaped on next write (re-read → normalize → re-serialize).
 *
 * The pre-existing P9.4 contract is the reason this is a union and not a
 * pure z.string().datetime() — making `addedAt` strict-string would
 * silently drop every contact added via the picker since SPEC 9 shipped.
 */
const AddedAtSchema = z
  .union([z.string().datetime(), z.number().int().positive()])
  .transform((v) => (typeof v === 'number' ? new Date(v).toISOString() : v));

/**
 * The canonical Contact shape — what every read normalizes to and every write
 * emits. All five product surfaces (engine tools, /api/user/preferences,
 * useContacts hook, send-modal autocomplete, /settings/contacts) consume
 * this shape exclusively.
 */
export const UnifiedContactSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  identifier: z.string().trim().min(1),
  resolvedAddress: z.string().regex(SUI_ADDRESS_REGEX),
  audricUsername: z.string().nullable().optional(),
  addedAt: AddedAtSchema.optional(),
  source: ContactSourceSchema.optional(),
});

export type Contact = z.infer<typeof UnifiedContactSchema>;

/**
 * Legacy shape — only ever read, never written. Rows that match this shape
 * are lifted into UnifiedContactSchema by `liftLegacyContact()` below.
 */
const LegacyContactSchema = z.object({
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
  address: z.string().regex(SUI_ADDRESS_REGEX),
});

function liftLegacyContact(legacy: z.infer<typeof LegacyContactSchema>): Contact {
  return {
    name: legacy.name,
    identifier: legacy.address,
    resolvedAddress: legacy.address.toLowerCase(),
    audricUsername: null,
    // addedAt intentionally omitted — we don't know when it was originally
    // added and we don't want to claim "now" (which would mess up sort).
    // Consumers that need a timestamp should fall back to a sentinel.
    source: 'import',
  };
}

/**
 * Parse a single Json value into a Contact. Returns null for malformed rows
 * (callers MUST handle null and skip silently — see parseContactList for the
 * standard handling).
 *
 * Order matters: try the unified shape first (fast path for new data), then
 * the legacy shape (slow path for backfill).
 */
export function parseContact(raw: unknown): Contact | null {
  const unified = UnifiedContactSchema.safeParse(raw);
  if (unified.success) return unified.data;

  const legacy = LegacyContactSchema.safeParse(raw);
  if (legacy.success) return liftLegacyContact(legacy.data);

  return null;
}

/**
 * Parse a Json array (the raw value of UserPreferences.contacts) into a
 * Contact[]. Drops malformed rows silently — a single bad row should never
 * fail an entire user's contact list. Returns empty array if input is not
 * an array (defensive — handles `null`, `undefined`, `{}`, etc).
 *
 * This is the canonical entrypoint. Every consumer that reads
 * UserPreferences.contacts MUST go through here.
 */
export function parseContactList(raw: unknown): Contact[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Contact[] => {
    const parsed = parseContact(item);
    return parsed ? [parsed] : [];
  });
}

/**
 * Serialize a Contact[] for persistence. Currently a passthrough since the
 * unified shape IS the persistence shape; exists as a named function so that
 * (a) any future shape evolution has one place to update, and (b) callers
 * that pass arbitrary arrays go through a typed funnel.
 */
export function serializeContactList(contacts: Contact[]): Contact[] {
  // Validate every row going to disk. This catches programming errors (e.g.
  // a UI handler that constructs a malformed Contact); failing here is much
  // better than writing bad data and discovering it on the next read.
  return contacts.map((c) => UnifiedContactSchema.parse(c));
}

/**
 * Construct a Contact from a save_contact tool input ({name, address}). Used
 * by the engine `save_contact` tool to emit canonical-shape rows from the
 * minimal LLM-provided input.
 *
 * [SPEC 10 D.4] `audricUsername` is intentionally OMITTED at construction
 * time (rather than set to `null`). The omitted/`undefined` value signals
 * "never reverse-checked" to the lazy backfill pass; if we hard-set `null`
 * here we'd conflate "never checked" with "checked, no Audric leaf" and
 * the backfill could skip new contacts. After the backfill runs, the
 * field becomes either a leaf string (e.g. `alice.audric.sui`) or
 * literal `null` (= checked, no Audric handle on this address).
 */
export function contactFromSaveInput(input: {
  name: string;
  address: string;
}): Contact {
  return UnifiedContactSchema.parse({
    name: input.name.trim(),
    identifier: input.address,
    resolvedAddress: input.address.toLowerCase(),
    addedAt: new Date().toISOString(),
    source: 'save_contact',
  });
}
