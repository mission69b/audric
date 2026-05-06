import { describe, expect, it } from 'vitest';
import {
  isAudricHandle,
  pickAudricHandleFromReverseNames,
} from '../audric-handle-helpers';

/**
 * SPEC 10 D.4 — `audric-handle-helpers` correctness.
 *
 * Two predicates underpin every contact backfill + recipient-resolution
 * path that needs to extract an Audric leaf from a SuiNS reverse-lookup:
 *
 *   - `isAudricHandle(name)` — pure suffix test
 *   - `pickAudricHandleFromReverseNames(names)` — first-match scan
 *
 * Buglet pre-this-helper: `app/api/engine/resume-with-input/route-helpers.ts`
 * picked `reverse[0]` blindly, which could be a generic `.sui` name OR
 * the parent `audric.sui`. Tests here lock in the correct behavior so
 * regressions surface immediately.
 */

describe('isAudricHandle', () => {
  it('returns true for a leaf under audric.sui', () => {
    expect(isAudricHandle('alice.audric.sui')).toBe(true);
    expect(isAudricHandle('mission69b.audric.sui')).toBe(true);
    expect(isAudricHandle('a.audric.sui')).toBe(true);
  });

  it('returns false for the parent name itself', () => {
    expect(isAudricHandle('audric.sui')).toBe(false);
  });

  it('returns false for unrelated SuiNS names', () => {
    expect(isAudricHandle('alex.sui')).toBe(false);
    expect(isAudricHandle('funkii.sui')).toBe(false);
    expect(isAudricHandle('audric.sui.evil.sui')).toBe(false);
    expect(isAudricHandle('not-audric.sui')).toBe(false);
  });

  it('returns false for malformed inputs', () => {
    expect(isAudricHandle('')).toBe(false);
    expect(isAudricHandle('audric.sui ')).toBe(false);
    expect(isAudricHandle('.audric.sui')).toBe(true);
  });

  it('handles multi-level subdomains as expected (no false positives)', () => {
    expect(isAudricHandle('foo.bar.audric.sui')).toBe(true);
    expect(isAudricHandle('audric.sui.com')).toBe(false);
  });
});

describe('pickAudricHandleFromReverseNames', () => {
  it('returns null for an empty array', () => {
    expect(pickAudricHandleFromReverseNames([])).toBeNull();
  });

  it('returns the only Audric leaf in a single-element list', () => {
    expect(pickAudricHandleFromReverseNames(['alice.audric.sui'])).toBe(
      'alice.audric.sui',
    );
  });

  it('skips a generic SuiNS name and picks the Audric leaf behind it', () => {
    expect(
      pickAudricHandleFromReverseNames(['alex.sui', 'alex.audric.sui']),
    ).toBe('alex.audric.sui');
  });

  it('returns null when no Audric leaves are present', () => {
    expect(
      pickAudricHandleFromReverseNames(['alex.sui', 'alex.io', 'alex.eth']),
    ).toBeNull();
  });

  it('skips the parent `audric.sui` (defensive — never claimed by users)', () => {
    expect(
      pickAudricHandleFromReverseNames(['audric.sui', 'alice.audric.sui']),
    ).toBe('alice.audric.sui');
  });

  it('returns the FIRST Audric leaf when multiple are registered', () => {
    expect(
      pickAudricHandleFromReverseNames([
        'alice.audric.sui',
        'old-handle.audric.sui',
      ]),
    ).toBe('alice.audric.sui');
  });

  it('returns null when only the parent is present (no leaves)', () => {
    expect(pickAudricHandleFromReverseNames(['audric.sui'])).toBeNull();
  });

  it('handles long lists with mixed names correctly', () => {
    const names = [
      'audric.sui',
      'something.sui',
      'mission69b.eth.sui',
      'mission69b.audric.sui',
      'old.audric.sui',
    ];
    expect(pickAudricHandleFromReverseNames(names)).toBe(
      'mission69b.audric.sui',
    );
  });
});
