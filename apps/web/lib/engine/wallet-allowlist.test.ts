import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseWalletAllowlist,
  isAddressAllowlisted,
  _resetCachedAllowlist,
} from './wallet-allowlist';

// Three valid Sui addresses (64 hex chars after 0x). Different shapes:
const ADDR_A_LOWER = '0x91b88d0e7eaf45e3252a06ad57f6b9c79b1e7f8d3e0a6c1d2b3c4d5e6f7a8b9c';
const ADDR_A_UPPER = '0x91B88D0E7EAF45E3252A06AD57F6B9C79B1E7F8D3E0A6C1D2B3C4D5E6F7A8B9C';
const ADDR_B = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const ADDR_C = '0xfedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('parseWalletAllowlist', () => {
  it('returns empty Set + empty dropped for null / undefined / empty input', () => {
    for (const input of [null, undefined, '', '   ', '\n\t']) {
      const { allowlist, dropped } = parseWalletAllowlist(input);
      expect(allowlist.size).toBe(0);
      expect(dropped).toEqual([]);
    }
  });

  it('parses a single valid address', () => {
    const { allowlist, dropped } = parseWalletAllowlist(ADDR_A_LOWER);
    expect(allowlist.size).toBe(1);
    expect(allowlist.has(ADDR_A_LOWER)).toBe(true);
    expect(dropped).toEqual([]);
  });

  it('parses multiple comma-separated addresses', () => {
    const { allowlist, dropped } = parseWalletAllowlist(`${ADDR_A_LOWER},${ADDR_B},${ADDR_C}`);
    expect(allowlist.size).toBe(3);
    expect(allowlist.has(ADDR_A_LOWER)).toBe(true);
    expect(allowlist.has(ADDR_B)).toBe(true);
    expect(allowlist.has(ADDR_C)).toBe(true);
    expect(dropped).toEqual([]);
  });

  it('trims whitespace per entry', () => {
    const { allowlist, dropped } = parseWalletAllowlist(`  ${ADDR_A_LOWER}  ,  ${ADDR_B}  `);
    expect(allowlist.size).toBe(2);
    expect(dropped).toEqual([]);
  });

  it('skips empty entries between commas', () => {
    const { allowlist, dropped } = parseWalletAllowlist(`${ADDR_A_LOWER},,${ADDR_B},,,`);
    expect(allowlist.size).toBe(2);
    expect(dropped).toEqual([]);
  });

  it('normalises addresses to lower-case', () => {
    const { allowlist } = parseWalletAllowlist(ADDR_A_UPPER);
    expect(allowlist.has(ADDR_A_LOWER)).toBe(true);
    expect(allowlist.has(ADDR_A_UPPER)).toBe(false);
  });

  it('drops invalid addresses + reports them in dropped[]', () => {
    const { allowlist, dropped } = parseWalletAllowlist(
      `${ADDR_A_LOWER},not-a-wallet,${ADDR_B},0x123`,
    );
    expect(allowlist.size).toBe(2);
    expect(dropped).toEqual(['not-a-wallet', '0x123']);
  });

  it('still returns the valid entries when ALL invalid addresses dropped', () => {
    const { allowlist, dropped } = parseWalletAllowlist(`badaddr1,badaddr2,${ADDR_A_LOWER}`);
    expect(allowlist.size).toBe(1);
    expect(allowlist.has(ADDR_A_LOWER)).toBe(true);
    expect(dropped).toEqual(['badaddr1', 'badaddr2']);
  });

  it('returns empty allowlist (no throw) when EVERY entry is invalid', () => {
    const { allowlist, dropped } = parseWalletAllowlist('not-a-wallet,also-bad');
    expect(allowlist.size).toBe(0);
    expect(dropped).toEqual(['not-a-wallet', 'also-bad']);
  });
});

describe('isAddressAllowlisted', () => {
  beforeEach(() => {
    _resetCachedAllowlist();
  });

  it('returns false when address is null / undefined / empty', () => {
    expect(isAddressAllowlisted(null, ADDR_A_LOWER)).toBe(false);
    expect(isAddressAllowlisted(undefined, ADDR_A_LOWER)).toBe(false);
    expect(isAddressAllowlisted('', ADDR_A_LOWER)).toBe(false);
  });

  it('returns false when allowlist env is empty (default OFF)', () => {
    expect(isAddressAllowlisted(ADDR_A_LOWER, undefined)).toBe(false);
    expect(isAddressAllowlisted(ADDR_A_LOWER, '')).toBe(false);
  });

  it('returns true when address matches a single-entry allowlist', () => {
    expect(isAddressAllowlisted(ADDR_A_LOWER, ADDR_A_LOWER)).toBe(true);
  });

  it('returns true when address matches case-insensitively', () => {
    expect(isAddressAllowlisted(ADDR_A_UPPER, ADDR_A_LOWER)).toBe(true);
  });

  it('returns true when allowlist entry is upper-case but lookup is lower-case', () => {
    _resetCachedAllowlist();
    expect(isAddressAllowlisted(ADDR_A_LOWER, ADDR_A_UPPER)).toBe(true);
  });

  it('returns true when address matches one of multiple entries', () => {
    expect(
      isAddressAllowlisted(ADDR_B, `${ADDR_A_LOWER},${ADDR_B},${ADDR_C}`),
    ).toBe(true);
  });

  it('returns false when address is not in the allowlist', () => {
    expect(isAddressAllowlisted(ADDR_C, `${ADDR_A_LOWER},${ADDR_B}`)).toBe(false);
  });

  it('returns false when the lookup address is malformed', () => {
    expect(isAddressAllowlisted('not-a-wallet', ADDR_A_LOWER)).toBe(false);
  });

  it('logs a warning when the allowlist env contains invalid entries (first call only)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(isAddressAllowlisted(ADDR_A_LOWER, `${ADDR_A_LOWER},badaddr`)).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('dropped 1 invalid wallet(s)'),
      ['badaddr'],
    );
    // Second call uses the cached allowlist — no second warning.
    expect(isAddressAllowlisted(ADDR_A_LOWER, `${ADDR_A_LOWER},badaddr`)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('caches the parsed allowlist across calls (parse-once-per-cold-start)', () => {
    // First call with allowlist X.
    expect(isAddressAllowlisted(ADDR_A_LOWER, ADDR_A_LOWER)).toBe(true);
    // Subsequent calls with a DIFFERENT allowlist value still use the
    // cached set from the first call. This is by design — the env var
    // is re-read only on cold start (Vercel runtime env change restarts
    // the function). Test asserts the cache is honoured.
    expect(isAddressAllowlisted(ADDR_A_LOWER, ADDR_B)).toBe(true);
    expect(isAddressAllowlisted(ADDR_B, ADDR_B)).toBe(false);
  });

  it('honours _resetCachedAllowlist between tests (cache invalidates correctly)', () => {
    expect(isAddressAllowlisted(ADDR_A_LOWER, ADDR_A_LOWER)).toBe(true);
    _resetCachedAllowlist();
    expect(isAddressAllowlisted(ADDR_A_LOWER, ADDR_B)).toBe(false);
    expect(isAddressAllowlisted(ADDR_B, ADDR_B)).toBe(true);
  });
});
