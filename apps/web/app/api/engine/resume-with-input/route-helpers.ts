// ───────────────────────────────────────────────────────────────────────────
// SPEC 9 v0.1.3 P9.4 — /api/engine/resume-with-input pure helpers
//
// Extracted from `route.ts` because Next.js 15 strict route-export validation
// rejects any export from a `route.ts` file that isn't an HTTP method or a
// known config field (the previous `export const __testables` pattern fails
// build with: `"__testables" is not a valid Route export field`).
//
// All three helpers are pure (validateValues / resolveRecipientField) or
// scoped to a single Prisma upsert (persistAddRecipientContact). The route
// imports them from here; the test file imports them from here too.
// ───────────────────────────────────────────────────────────────────────────

import { normalizeAddressInput, resolveAddressToSuinsViaRpc } from '@t2000/engine';
import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import type { FormSchema } from '@/lib/engine/sse-types';
import {
  isAudricHandle,
  pickAudricHandleFromReverseNames,
} from '@/lib/identity/audric-handle-helpers';

// ───────────────────────────────────────────────────────────────────────────
// validateValues — defense-in-depth schema coercion
// ───────────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  /** Per-field error map keyed on `field.name`. */
  errors: Record<string, string>;
  /** Coerced values (numbers parsed, strings trimmed). */
  coerced: Record<string, unknown>;
}

export function validateValues(
  schema: FormSchema,
  values: Record<string, unknown>,
): ValidationResult {
  const errors: Record<string, string> = {};
  const coerced: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const raw = values[field.name];

    if (field.required && (raw == null || raw === '')) {
      errors[field.name] = 'Required';
      continue;
    }

    if (raw == null || raw === '') continue;

    switch (field.kind) {
      case 'number':
      case 'usd': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) {
          errors[field.name] = 'Must be a number';
          continue;
        }
        coerced[field.name] = n;
        break;
      }

      case 'select': {
        const s = String(raw);
        const allowed = (field.options ?? []).map((o) => o.value);
        if (allowed.length > 0 && !allowed.includes(s)) {
          errors[field.name] = 'Not a valid option';
          continue;
        }
        coerced[field.name] = s;
        break;
      }

      case 'date': {
        const s = String(raw);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          errors[field.name] = 'Must be YYYY-MM-DD';
          continue;
        }
        coerced[field.name] = s;
        break;
      }

      case 'sui-recipient':
      case 'text':
      default: {
        const s = String(raw).trim();
        if (s === '') {
          if (field.required) errors[field.name] = 'Required';
          continue;
        }
        coerced[field.name] = s;
        break;
      }
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, coerced };
}

// ───────────────────────────────────────────────────────────────────────────
// `sui-recipient` resolution — runs AFTER schema validation, BEFORE
// engine.resumeWithInput. Calls `normalizeAddressInput` (S.52) to coerce
// the polymorphic identifier into a canonical 0x address. For external
// SuiNS / Audric handles this hits NAVI's RPC for the lookup.
//
// The resolved canonical address replaces the user-typed string in the
// values payload — the engine's tool sees an address-shaped string. The
// raw identifier is preserved on a side-channel `_resolvedFrom[<field>]`
// key for tools that want to render "Saved Mom (mom.audric.sui →
// 0xabc…)" in their displayText.
//
// Audric-handle reverse-lookup: SPEC 10 D7's unified Contact shape
// includes `audricUsername`. When the identifier is a 0x address (no
// SuiNS associated), we attempt a reverse lookup to populate the
// `audricUsername` so the persisted contact stays SPEC 10-compliant.
// ───────────────────────────────────────────────────────────────────────────

export interface ResolvedRecipient {
  raw: string;
  canonical: string;
  audricUsername?: string;
}

export async function resolveRecipientField(
  raw: string,
): Promise<{ ok: true; value: ResolvedRecipient } | { ok: false; error: string }> {
  try {
    const normalized = await normalizeAddressInput(raw);
    // [SPEC 10 D.4 fix] Both branches MUST filter to Audric leaves only —
    // `normalized.suinsName` may be a generic SuiNS (e.g. `alex.sui`) when
    // the user typed a top-level name; the reverse-lookup result may
    // contain generic names ahead of the Audric leaf. Pre-fix, both
    // branches blindly accepted any `.sui` name and persisted it as
    // `audricUsername`, polluting contact rows with non-Audric handles.
    let audricUsername: string | undefined =
      normalized.suinsName && isAudricHandle(normalized.suinsName)
        ? normalized.suinsName
        : undefined;
    if (!audricUsername) {
      try {
        const reverse = await resolveAddressToSuinsViaRpc(normalized.address);
        const picked = pickAudricHandleFromReverseNames(
          Array.isArray(reverse) ? reverse : [],
        );
        if (picked) audricUsername = picked;
      } catch {
        // swallow — backfill on next contacts/backfill POST handles
      }
    }
    return {
      ok: true,
      value: {
        raw,
        canonical: normalized.address,
        audricUsername,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not resolve recipient',
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Contact persistence — only fires when the resumed tool is `add_recipient`.
// Upserts onto `UserPreferences.contacts` (JSON column).
//
// The persisted shape is the SPEC 10 D7 unified Contact:
//   { name, identifier, resolvedAddress, audricUsername?, addedAt, source }
// Existing contacts in the JSON blob may be the legacy `{ name, address }`
// shape — we don't migrate them here. The reading code that consumes
// `contacts` (engine `ToolContext.contacts`, transfer-asset-casing, etc.)
// already handles both shapes.
// ───────────────────────────────────────────────────────────────────────────

interface UnifiedContactRow {
  name: string;
  identifier: string;
  resolvedAddress: string;
  audricUsername?: string;
  addedAt: number;
  source: 'agent' | 'manual';
}

export async function persistAddRecipientContact(
  address: string,
  name: string,
  identifier: string,
  resolved: ResolvedRecipient,
): Promise<void> {
  // [P9.4 host fix] Conditionally include audricUsername. If the
  // current resolution didn't yield one (most identifiers won't), we
  // must NOT spread `audricUsername: undefined` — on the dedupe-merge
  // path below, the spread would clobber an existing audricUsername
  // that an earlier resolution had captured.
  const newContact: UnifiedContactRow = {
    name,
    identifier,
    resolvedAddress: resolved.canonical,
    ...(resolved.audricUsername ? { audricUsername: resolved.audricUsername } : {}),
    addedAt: Date.now(),
    source: 'agent',
  };

  const prefs = await prisma.userPreferences.findUnique({
    where: { address },
    select: { contacts: true },
  });
  const existing = Array.isArray(prefs?.contacts)
    ? (prefs.contacts as Array<Record<string, unknown>>)
    : [];

  // Dedupe on (case-insensitive name) — avoids agent re-adding a contact
  // the user already saved manually. First match wins.
  const dupIdx = existing.findIndex(
    (c) => typeof c.name === 'string' && c.name.toLowerCase() === name.toLowerCase(),
  );
  let nextContacts: Array<Record<string, unknown>>;
  if (dupIdx >= 0) {
    nextContacts = existing.map((c, i) => (i === dupIdx ? { ...c, ...newContact } : c));
  } else {
    nextContacts = [...existing, newContact as unknown as Record<string, unknown>];
  }

  await prisma.userPreferences.upsert({
    where: { address },
    update: { contacts: nextContacts as Prisma.InputJsonValue },
    create: {
      address,
      contacts: nextContacts as Prisma.InputJsonValue,
    },
  });
}
