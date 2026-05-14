import { describe, it, expect } from 'vitest';
import { sanitizeForLog } from './log-sanitize';

describe('sanitizeForLog (SPEC 30 Phase 1B.5)', () => {
  it('passes through plain ASCII unchanged', () => {
    expect(sanitizeForLog('hello world')).toBe('hello world');
    expect(sanitizeForLog('0xabc123def456')).toBe('0xabc123def456');
  });

  it('replaces newlines with ? (CRLF log injection defense)', () => {
    expect(sanitizeForLog('0x123\n[INFO] fake')).toBe('0x123?[INFO] fake');
    expect(sanitizeForLog('foo\r\nbar')).toBe('foo??bar');
  });

  it('replaces tabs and other control chars', () => {
    expect(sanitizeForLog('a\tb\0c\x1bd')).toBe('a?b?c?d');
  });

  it('replaces DEL (0x7F)', () => {
    expect(sanitizeForLog('foo\x7Fbar')).toBe('foo?bar');
  });

  it('coerces non-strings safely', () => {
    expect(sanitizeForLog(42)).toBe('42');
    expect(sanitizeForLog(null)).toBe('null');
    expect(sanitizeForLog(undefined)).toBe('undefined');
    expect(sanitizeForLog({ a: 1 })).toBe('[object Object]');
  });

  it('truncates oversized values to 256 chars + ellipsis', () => {
    const huge = 'a'.repeat(500);
    const out = sanitizeForLog(huge);
    expect(out.length).toBe(259);
    expect(out.endsWith('...')).toBe(true);
    expect(out.startsWith('a'.repeat(256))).toBe(true);
  });

  it('preserves Unicode that is NOT a control character', () => {
    expect(sanitizeForLog('emoji 🎉 ok')).toBe('emoji 🎉 ok');
    expect(sanitizeForLog('日本語')).toBe('日本語');
  });

  it('handles empty / whitespace inputs', () => {
    expect(sanitizeForLog('')).toBe('');
    expect(sanitizeForLog(' ')).toBe(' ');
    expect(sanitizeForLog('   ')).toBe('   ');
  });
});
