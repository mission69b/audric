/**
 * Smart pre-fill suggestion engine for the SPEC 10 Phase B.1 username picker.
 *
 * Derives candidate `*.audric.sui` labels from the user's Google profile
 * (`name` + `email` claims) using a fixed list of strategies. The picker
 * displays 3 suggestions at a time and exposes a 🔄 "regenerate" button
 * that advances `seed` by one — re-deriving 3 new candidates from a
 * different slice of strategies (per SPEC 10 B-6: privacy escape hatch
 * for users who don't want their email visible in the suggestion list).
 *
 * Determinism contract:
 *
 *   For a given `(name, email, seed)` the output is byte-stable. This
 *   matters for two reasons:
 *
 *     1. Tests assert exact suggestion strings rather than structural
 *        properties, which catches regressions in the strategy list
 *        ordering or the slug normalization rules.
 *
 *     2. Re-renders during the picker's "checking availability" phase
 *        don't reshuffle the chips under the user's mouse — the chip
 *        the user is about to click stays put.
 *
 * Validation contract:
 *
 *   Every emitted candidate is guaranteed to satisfy `validateAudricLabel`
 *   (3–20 chars, lowercase ASCII + digits + hyphens, no leading/trailing/
 *   consecutive hyphens). Strategies that produce invalid candidates
 *   (e.g. truncation lands on a hyphen, name is empty after slugification)
 *   are silently skipped — `suggestUsernames` walks the strategy list
 *   until it has 3 valid candidates or runs out.
 *
 * Out of scope:
 *
 *   - Reserved-list filtering (caller decides — the picker fires
 *     `/api/identity/check` for each suggestion which handles this).
 *   - Availability pre-checking (caller decides — see B.1 picker).
 *   - Personality / vibe-based generation (out of scope for v0.2.0).
 */

import { validateAudricLabel } from './validate-label';

const LABEL_MIN = 3;
const LABEL_MAX = 20;

export interface SuggestUsernamesInput {
  /** Google `name` claim — full name, e.g. "John Smith" or "José García". */
  googleName?: string | null;
  /** Google `email` claim — full email, e.g. "funkii@gmail.com". */
  googleEmail?: string | null;
  /**
   * Regenerate counter. 0 on initial render; the picker increments by 1
   * each time the user clicks 🔄. Different seeds yield different slices
   * of the strategy list (each slice is 3 candidates, drawn in priority
   * order with duplicates collapsed).
   */
  seed: number;
  /** Number of suggestions to return (default 3 per SPEC 10 B.1). */
  count?: number;
}

/**
 * Returns up to `count` valid suggestion labels (no `.audric.sui` suffix).
 * Empty array if no suggestions could be derived (e.g. both name + email
 * are missing, or every candidate failed validation).
 */
export function suggestUsernames(input: SuggestUsernamesInput): string[] {
  const { googleName, googleEmail, seed, count = 3 } = input;

  const candidates = generateAllCandidates(googleName ?? null, googleEmail ?? null);

  // [Dedup-preserve-order] A name like "John" with email "john@x.com"
  // produces "john" twice (email-local + name-flat). Keep the first
  // occurrence so the higher-priority strategy wins.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!seen.has(c)) {
      seen.add(c);
      unique.push(c);
    }
  }

  // [Seed → slice] seed=0 → unique[0..count]; seed=1 → [count..2*count]; etc.
  // When the slice exhausts the list, wrap around so 🔄 always shows
  // SOMETHING (better UX than an empty chip row).
  if (unique.length === 0) return [];
  const start = (seed * count) % unique.length;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(unique[(start + i) % unique.length]);
  }
  // Final dedup in case wrap-around re-introduced duplicates (small list,
  // large seed). Cap at count.
  const finalSeen = new Set<string>();
  const finalOut: string[] = [];
  for (const c of out) {
    if (!finalSeen.has(c)) {
      finalSeen.add(c);
      finalOut.push(c);
    }
    if (finalOut.length >= count) break;
  }
  return finalOut;
}

// ───────────────────────────────────────────────────────────────────────────
// Strategy list — generates the universe of candidates in priority order.
// Caller (suggestUsernames) dedups + slices by seed.
//
// Strategies are ordered roughly:
//   1. Email-derived first (highest signal — Google email local-part is
//      typically the user's chosen handle on other services).
//   2. Name-derived second (good fallback when email is generic).
//   3. Numeric-suffix variants last (privacy escape hatch — once the user
//      hits 🔄 enough times, we stop showing email-derived candidates).
// ───────────────────────────────────────────────────────────────────────────

function generateAllCandidates(
  googleName: string | null,
  googleEmail: string | null,
): string[] {
  const emailLocal = parseEmailLocal(googleEmail);
  const nameParts = parseNameParts(googleName);

  const out: string[] = [];

  // ─── Tier 1: email-derived (visible privacy footprint) ──────────────
  if (emailLocal) {
    push(out, emailLocal);
    push(out, emailLocal.replace(/[._-]/g, '')); // strip separators
    push(out, emailLocal.replace(/[._]/g, '-')); // hyphen-style
  }

  // ─── Tier 2: name-derived (lower privacy footprint) ─────────────────
  if (nameParts) {
    const { first, last } = nameParts;
    if (last) {
      push(out, first + last); // johnsmith
      push(out, first[0] + last); // jsmith
      push(out, first + '-' + last); // john-smith
      push(out, first); // john
      push(out, last + first[0]); // smithj
    } else {
      push(out, first);
    }
  }

  // ─── Tier 3: numeric variants (privacy escape hatch — these are the
  //          farthest from the original email/name and surface AFTER
  //          the user clicks 🔄 a few times).
  if (nameParts) {
    const { first, last } = nameParts;
    if (last) {
      push(out, first + last + '1');
      push(out, first + last + '7');
      push(out, first[0] + last + '42');
    } else {
      push(out, first + '1');
      push(out, first + '7');
    }
  }
  if (emailLocal) {
    const stripped = emailLocal.replace(/[._-]/g, '');
    push(out, stripped + '1');
    push(out, stripped + '99');
  }

  return out;
}

/**
 * Push `raw` into `out` after slugify + validate. Silently drops invalid
 * candidates (e.g. truncation lands on a hyphen, slug is empty).
 */
function push(out: string[], raw: string): void {
  const slug = slugify(raw);
  if (!slug) return;
  // Truncate from the end if too long. If the truncation lands on a
  // hyphen, drop the trailing hyphens — the validator rejects them.
  let truncated = slug.slice(0, LABEL_MAX);
  while (truncated.endsWith('-')) truncated = truncated.slice(0, -1);
  // Pad short labels (e.g. 2-letter "jo") to LABEL_MIN with a "0" filler.
  // Most names are 3+ chars so this is rare, but it ensures `j` doesn't
  // crash the picker (it'd be filtered out otherwise, leaving a chip-row
  // of fewer than 3 suggestions for short names).
  if (truncated.length < LABEL_MIN) {
    truncated = (truncated + '00').slice(0, LABEL_MIN);
  }
  const v = validateAudricLabel(truncated);
  if (v.valid) out.push(v.label);
}

/**
 * Lowercases, normalizes accents (NFD strip), and replaces every
 * non-`[a-z0-9-]` character with empty (or hyphen, contextually). Folds
 * consecutive hyphens to a single hyphen and strips leading/trailing
 * hyphens.
 *
 * Examples:
 *   "John Smith"     → "johnsmith"          (space stripped)
 *   "José García"    → "josegarcia"         (accents folded, space stripped)
 *   "Anne O'Brien"   → "anneobrien"         (apostrophe stripped)
 *   "john.smith"     → "john.smith" → "johnsmith" via the .replace caller path
 *   "  john  "       → "john"
 */
function slugify(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks (accents)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '') // drop everything that isn't allowed
    .replace(/-+/g, '-') // fold consecutive hyphens
    .replace(/^-+|-+$/g, ''); // strip leading/trailing hyphens
}

/**
 * Returns the local-part of a valid email, or `null` if `email` is
 * malformed / missing. The local-part is returned RAW (lowercased only,
 * not slugified) so callers can apply different normalization strategies
 * (with separators, without separators, hyphen-style).
 */
function parseEmailLocal(email: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  // Cheap structural check; we don't need full RFC validation here — the
  // Google JWT is the source of truth.
  const at = trimmed.indexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return null;
  return trimmed.slice(0, at);
}

interface NameParts {
  first: string;
  last: string;
}

/**
 * Splits a Google `name` claim into `{first, last}` slugged segments. If
 * the name has no whitespace, `last` is empty and the picker falls back
 * to first-only strategies. Returns `null` for missing/blank names.
 */
function parseNameParts(raw: string | null): NameParts | null {
  if (!raw) return null;
  // Split on the ORIGINAL whitespace (before slugify, which would collapse
  // first+last into one token). slugify each segment independently so each
  // strategy can compose them.
  const parts = raw.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return null;
  const first = slugify(parts[0]);
  if (!first) return null;
  if (parts.length === 1) return { first, last: '' };
  // Multi-token names: take the LAST token as the surname. Most cultures
  // place the family name last ("Maria del Carmen Pérez" → "perez"); best-
  // effort and good enough for suggestion seeds.
  const last = slugify(parts[parts.length - 1]);
  if (!last) return { first, last: '' };
  return { first, last };
}
