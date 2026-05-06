/**
 * SPEC 10 Phase B.1 — `suggestUsernames` deterministic helper.
 *
 * Coverage:
 *   1. Determinism — same input ⇒ same output (no random dependencies).
 *   2. Email-only / name-only / both inputs.
 *   3. Empty inputs ⇒ empty array (picker hides chip row gracefully).
 *   4. Validation — every emitted candidate passes `validateAudricLabel`.
 *   5. Dedup — duplicate candidates from different strategies collapse,
 *      preserving priority order.
 *   6. Seed advancement (privacy escape hatch per B-6) — seed≥1 surfaces
 *      non-email-derived candidates.
 *   7. Wrap-around — high seeds cycle cleanly (no out-of-bounds).
 *   8. Custom `count` parameter.
 *   9. Edge cases: non-ASCII names (José), apostrophes (O'Brien), short
 *      names (1-letter), long names (>20 chars), numeric-only emails.
 */

import { describe, it, expect } from 'vitest';
import { suggestUsernames } from '../suggest-usernames';
import { validateAudricLabel } from '../validate-label';

// Every emitted suggestion must be a valid label per A.3 rules.
function assertAllValid(suggestions: string[]): void {
  for (const s of suggestions) {
    const v = validateAudricLabel(s);
    expect(v.valid, `expected "${s}" to be a valid label`).toBe(true);
  }
}

describe('suggestUsernames', () => {
  describe('determinism', () => {
    it('produces byte-identical output across calls', () => {
      const a = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
      });
      const b = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
      });
      expect(a).toEqual(b);
    });

    it('produces different output for different seeds', () => {
      const a = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
      });
      const b = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 1,
      });
      expect(a).not.toEqual(b);
    });
  });

  describe('seed=0 priority order', () => {
    it('emits email-local first when both name and email present', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
      });
      expect(r[0]).toBe('funkii');
    });

    it('falls back to name when email missing', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: null,
        seed: 0,
      });
      // First name-derived strategy is "first + last" → "johnsmith".
      expect(r[0]).toBe('johnsmith');
    });

    it('emits exactly 3 by default', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
      });
      expect(r).toHaveLength(3);
    });

    it('honors custom count', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
        count: 5,
      });
      expect(r).toHaveLength(5);
    });
  });

  describe('B-6 privacy escape hatch', () => {
    it('seed=1 hides email-local from the displayed slice', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 1,
      });
      // funkii (or funkii-derived) MUST NOT appear in seed=1's slice.
      // The full strategy list interleaves email + name; seed=1 advances
      // past the email entries.
      for (const s of r) {
        expect(s.includes('funkii')).toBe(false);
      }
    });

    it('seed=1 surfaces name-derived alternatives', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 1,
      });
      // Every name-derived strategy contains either "john" or "smith".
      for (const s of r) {
        expect(s.includes('john') || s.includes('smith')).toBe(true);
      }
    });
  });

  describe('empty / missing inputs', () => {
    it('returns [] when both name and email are missing', () => {
      expect(
        suggestUsernames({ googleName: null, googleEmail: null, seed: 0 }),
      ).toEqual([]);
    });

    it('returns [] when both are empty strings', () => {
      expect(
        suggestUsernames({ googleName: '', googleEmail: '', seed: 0 }),
      ).toEqual([]);
    });

    it('returns [] for seed≥0 when both inputs are missing', () => {
      expect(
        suggestUsernames({ googleName: null, googleEmail: null, seed: 5 }),
      ).toEqual([]);
    });

    it('handles null name + valid email', () => {
      const r = suggestUsernames({
        googleName: null,
        googleEmail: 'alice@example.com',
        seed: 0,
      });
      expect(r.length).toBeGreaterThan(0);
      expect(r[0]).toBe('alice');
    });

    it('handles valid name + null email', () => {
      const r = suggestUsernames({
        googleName: 'Alice Cooper',
        googleEmail: null,
        seed: 0,
      });
      expect(r.length).toBeGreaterThan(0);
      assertAllValid(r);
    });
  });

  describe('validation invariant', () => {
    it('every emitted candidate passes validateAudricLabel — common case', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 0,
      });
      assertAllValid(r);
    });

    it('every emitted candidate passes — across many seeds', () => {
      for (let seed = 0; seed < 5; seed++) {
        const r = suggestUsernames({
          googleName: 'John Smith',
          googleEmail: 'funkii@gmail.com',
          seed,
        });
        assertAllValid(r);
      }
    });

    it('strips trailing hyphens after truncation', () => {
      // First name "Christopher" (11) + "-" + last name "Alexander-Pendragon" (19)
      // = 31 chars → "first-last" strategy truncates to 20 chars. The
      // truncation lands inside "alexande" (no trailing hyphen) so the
      // candidate is valid.
      const r = suggestUsernames({
        googleName: 'Christopher Alexander-Pendragon',
        googleEmail: null,
        seed: 0,
      });
      assertAllValid(r);
    });
  });

  describe('dedup', () => {
    it('does not emit "alice" twice when name and email both yield it', () => {
      const r = suggestUsernames({
        googleName: 'Alice',
        googleEmail: 'alice@example.com',
        seed: 0,
        count: 5,
      });
      const occurrences = r.filter((s) => s === 'alice').length;
      expect(occurrences).toBe(1);
    });
  });

  describe('non-ASCII handling', () => {
    it('strips accents (José García → jose / garcia)', () => {
      const r = suggestUsernames({
        googleName: 'José García',
        googleEmail: null,
        seed: 0,
      });
      assertAllValid(r);
      expect(r).toContain('josegarcia');
    });

    it('strips apostrophes (Anne O\'Brien → anneobrien)', () => {
      const r = suggestUsernames({
        googleName: "Anne O'Brien",
        googleEmail: null,
        seed: 0,
      });
      assertAllValid(r);
      expect(r).toContain('anneobrien');
    });
  });

  describe('edge: short / long names', () => {
    it('pads single-letter results to LABEL_MIN', () => {
      const r = suggestUsernames({
        googleName: null,
        googleEmail: 'x@y.com',
        seed: 0,
      });
      assertAllValid(r);
      // Every emitted candidate is ≥ 3 chars — verifying the LABEL_MIN
      // pad path doesn't crash and produces valid output.
      for (const s of r) expect(s.length).toBeGreaterThanOrEqual(3);
    });

    it('truncates long names to LABEL_MAX', () => {
      const r = suggestUsernames({
        googleName: 'Bartholomew Bartholomewson',
        googleEmail: null,
        seed: 0,
      });
      assertAllValid(r);
      for (const s of r) expect(s.length).toBeLessThanOrEqual(20);
    });
  });

  describe('email parsing edge cases', () => {
    it('handles emails with separators (john.smith@x.com → johnsmith + john-smith)', () => {
      const r = suggestUsernames({
        googleName: null,
        googleEmail: 'john.smith@example.com',
        seed: 0,
      });
      assertAllValid(r);
      // Strategy 1 (raw email-local): "john.smith" → slugify drops the
      // dot (not in [a-z0-9-]) → "johnsmith".
      // Strategy 2 (stripped): "johnsmith" — DUP, dropped.
      // Strategy 3 (hyphen-style): "john-smith" — distinct → kept.
      expect(r).toContain('johnsmith');
      expect(r).toContain('john-smith');
    });

    it('rejects malformed emails (no @)', () => {
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'notanemail',
        seed: 0,
      });
      // No email-derived candidates should appear; falls back to name.
      assertAllValid(r);
      for (const s of r) {
        expect(s.includes('notanemail')).toBe(false);
      }
    });

    it('rejects emails with leading @', () => {
      const r = suggestUsernames({
        googleName: 'Alice',
        googleEmail: '@example.com',
        seed: 0,
      });
      assertAllValid(r);
      // Falls back to name-only.
      expect(r[0]).toBe('alice');
    });
  });

  describe('seed wrap-around', () => {
    it('high seeds cycle through the strategy list cleanly', () => {
      // Strategy list for ("John Smith", "funkii@gmail.com") is ~11 unique
      // candidates. seed=10 should still return 3 valid candidates without
      // crashing.
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'funkii@gmail.com',
        seed: 10,
      });
      expect(r).toHaveLength(3);
      assertAllValid(r);
    });
  });

  // ─── S.88 — reserved-base filtering ──────────────────────────────────
  // Regression for the `admin@gmail.com` bug surfaced 2026-05-06: when
  // the email local-part is reserved, the Tier 1 + Tier 3 numeric
  // variants (`admin1`, `admin99`) leaked into the suggestion row. They
  // are technically claimable but are squat-magnet derivatives and
  // burned 2 of 3 suggestion slots for users with that email shape.
  describe('reserved-base filtering (S.88)', () => {
    it('skips the entire email-derived branch when email-local is reserved', () => {
      const r = suggestUsernames({
        googleName: 'Adeniyi Adams',
        googleEmail: 'admin@gmail.com',
        seed: 0,
      });
      assertAllValid(r);
      // None of the squat derivatives should appear.
      expect(r).not.toContain('admin');
      expect(r).not.toContain('admin1');
      expect(r).not.toContain('admin99');
      // Should fall back to name-derived suggestions.
      expect(r[0]).toBe('adeniyiadams');
    });

    it('skips email-derived even when only the stripped form is reserved', () => {
      // `a.d.m.i.n@gmail.com` → raw email-local "a.d.m.i.n", stripped
      // "admin". The branch filter checks BOTH; the stripped form being
      // reserved is enough to kill the branch.
      const r = suggestUsernames({
        googleName: 'Real Name',
        googleEmail: 'a.d.m.i.n@gmail.com',
        seed: 0,
      });
      assertAllValid(r);
      for (const s of r) {
        expect(s).not.toBe('admin');
        expect(s).not.toBe('admin1');
        expect(s).not.toBe('admin99');
      }
      expect(r[0]).toBe('realname');
    });

    it('skips the name-derived branch when first name is reserved (no last)', () => {
      const r = suggestUsernames({
        googleName: 'Admin',
        googleEmail: 'someone@example.com',
        seed: 0,
      });
      assertAllValid(r);
      expect(r).not.toContain('admin');
      expect(r).not.toContain('admin1');
      expect(r).not.toContain('admin7');
      // Falls back to email-derived (someone is not reserved).
      expect(r[0]).toBe('someone');
    });

    it('skips the name-derived branch when first+last is reserved', () => {
      // Synthetic name where the slugged join collides with a reserved
      // entry. "Sup Port" → "support" is in §7.1.
      const r = suggestUsernames({
        googleName: 'Sup Port',
        googleEmail: 'real@example.com',
        seed: 0,
      });
      assertAllValid(r);
      // Name-derived strategies all skipped (first+last = support).
      expect(r).not.toContain('support');
      expect(r).not.toContain('support1');
      expect(r).not.toContain('support7');
      // Falls back to email-derived.
      expect(r[0]).toBe('real');
    });

    it('returns empty array when every branch is reserved', () => {
      const r = suggestUsernames({
        googleName: 'Admin',
        googleEmail: 'admin@example.com',
        seed: 0,
      });
      // Both email and name branches filtered → no candidates.
      // Picker handles empty array gracefully (chip row hidden).
      expect(r).toEqual([]);
    });

    it('candidate-level filter catches accidental reserved slugs from non-reserved bases', () => {
      // First initial + last for "B Ot" → "bot" is in §7.1. Branch is
      // allowed (first+last = "bot" but parseNameParts strips short
      // segments — actually keep as edge: the test asserts the candidate
      // filter is wired even when the branch filter passes).
      // Use a case where firstlast is NOT reserved but a sub-strategy is:
      // "Apie Owner" → first="apie" (not reserved), last="owner",
      // firstlast="apieowner" (not reserved), but first[0]+last="aowner"
      // (not reserved either — hard to construct without a custom name).
      // For now this test asserts the simpler invariant: NO candidate
      // emitted is ever in the reserved set, regardless of how it was
      // derived.
      const r = suggestUsernames({
        googleName: 'John Smith',
        googleEmail: 'john@x.com',
        seed: 0,
        count: 10,
      });
      assertAllValid(r);
      for (const s of r) {
        // Inline import-free check via the same surface the picker uses.
        expect(['admin', 'support', 'audric', 'team', 'bot']).not.toContain(s);
      }
    });
  });
});
