import { describe, it, expect } from 'vitest';

import { redactAddress, redactJwt, redactEmail, redactPII } from './log-redact';

describe('redactAddress', () => {
  it('redacts a valid Sui address to 8-leading + 4-trailing', () => {
    const addr = '0x' + 'a'.repeat(60) + 'c0ff';
    expect(redactAddress(addr)).toBe('0xaaaaaa…c0ff');
  });

  it('returns [invalid-address] for malformed strings', () => {
    expect(redactAddress('0x123')).toBe('[invalid-address]');
    expect(redactAddress('not-an-address')).toBe('[invalid-address]');
    expect(redactAddress('0x' + 'g'.repeat(64))).toBe('[invalid-address]');
  });

  it('returns [no-address] for non-strings', () => {
    expect(redactAddress(undefined)).toBe('[no-address]');
    expect(redactAddress(null)).toBe('[no-address]');
    expect(redactAddress(123)).toBe('[no-address]');
  });
});

describe('redactJwt', () => {
  it('always returns [jwt:redacted] regardless of length or content', () => {
    expect(redactJwt('eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.abc')).toBe(
      '[jwt:redacted]',
    );
    expect(redactJwt('short')).toBe('[jwt:redacted]');
  });

  it('returns [no-jwt] for empty / non-string', () => {
    expect(redactJwt('')).toBe('[no-jwt]');
    expect(redactJwt(undefined)).toBe('[no-jwt]');
    expect(redactJwt(null)).toBe('[no-jwt]');
  });
});

describe('redactEmail', () => {
  it('preserves domain + first char of local-part', () => {
    expect(redactEmail('alice@example.com')).toBe('a***@example.com');
    expect(redactEmail('bob@audric.ai')).toBe('b***@audric.ai');
  });

  it('returns [invalid-email] for malformed inputs', () => {
    expect(redactEmail('not-an-email')).toBe('[invalid-email]');
    expect(redactEmail('@example.com')).toBe('[invalid-email]');
    expect(redactEmail('alice@')).toBe('[invalid-email]');
    expect(redactEmail('alice@nodomain')).toBe('[invalid-email]');
  });

  it('returns [no-email] for non-strings', () => {
    expect(redactEmail(undefined)).toBe('[no-email]');
    expect(redactEmail(null)).toBe('[no-email]');
  });
});

describe('redactPII', () => {
  const addr = '0x' + 'b'.repeat(60) + 'beef';

  it('redacts known PII keys, leaves other keys untouched', () => {
    const out = redactPII({
      address: addr,
      amount: 10,
      asset: 'USDC',
      digest: '0xfeed',
      jwt: 'eyJabc.def.ghi',
      email: 'user@audric.ai',
    });
    expect(out).toEqual({
      address: '0xbbbbbb…beef',
      amount: 10,
      asset: 'USDC',
      digest: '0xfeed',
      jwt: '[jwt:redacted]',
      email: 'u***@audric.ai',
    });
  });

  it('redacts every PII alias key (walletAddress, fromAddress, etc.)', () => {
    const out = redactPII({
      walletAddress: addr,
      fromAddress: addr,
      toAddress: addr,
      senderAddress: addr,
      recipientAddress: addr,
      userAddress: addr,
      suiAddress: addr,
    });
    expect(Object.values(out).every((v) => v === '0xbbbbbb…beef')).toBe(true);
  });

  it('redacts userId/sub with a prefix-suffix pattern', () => {
    const out = redactPII({ userId: 'cuid_a1b2c3d4e5f6', sub: 'google-1234567890' });
    expect(out.userId).toBe('cuid…e5f6');
    expect(out.sub).toBe('goog…7890');
  });

  it('walks one level into nested objects', () => {
    const out = redactPII({
      meta: { address: addr, count: 1 },
      payload: { jwt: 'eyJabc' },
    });
    expect(out).toEqual({
      meta: { address: '0xbbbbbb…beef', count: 1 },
      payload: { jwt: '[jwt:redacted]' },
    });
  });

  it('walks into arrays', () => {
    const out = redactPII([{ address: addr }, { address: addr }]);
    expect(out).toEqual([
      { address: '0xbbbbbb…beef' },
      { address: '0xbbbbbb…beef' },
    ]);
  });

  it('does not mutate the input', () => {
    const input = { address: addr };
    const out = redactPII(input);
    expect(input.address).toBe(addr);
    expect(out.address).toBe('0xbbbbbb…beef');
  });

  it('handles primitives + null gracefully', () => {
    expect(redactPII(null)).toBe(null);
    expect(redactPII(undefined)).toBe(undefined);
    expect(redactPII(42)).toBe(42);
    expect(redactPII('string')).toBe('string');
  });

  it('depth-caps to avoid pathological recursion', () => {
    type Nested = { address: string; nested?: Nested };
    let deep: Nested = { address: addr };
    for (let i = 0; i < 10; i++) deep = { address: addr, nested: deep };
    const out = redactPII(deep);
    expect(out.address).toBe('0xbbbbbb…beef');
    // Doesn't throw or stack-overflow on depth >4 — depth budget bounded.
  });

  it('preserves non-plain-object values (Error, Date, Map) without coercing to {}', () => {
    const err = new Error('boom');
    const date = new Date('2026-05-14T00:00:00Z');
    const out = redactPII({
      address: addr,
      err,
      date,
      // [Read 3 regression] Pre-fix, `Object.entries(new Error())` returns
      // [] (non-enumerable props), so a naive recursive walk would drop
      // the error to `{}` and lose the message. Common log shape is
      // `{ ctx, err }` — losing the err is a real bug. The fix is
      // prototype-checking before recursing.
    });
    expect(out.address).toBe('0xbbbbbb…beef');
    expect(out.err).toBe(err); // same reference, not coerced to {}
    expect(out.date).toBe(date);
  });

  it('preserves arrays of non-plain-object values', () => {
    const errs = [new Error('a'), new Error('b')];
    const out = redactPII({ address: addr, errs });
    expect(out.address).toBe('0xbbbbbb…beef');
    expect(out.errs).toEqual(errs);
  });
});
