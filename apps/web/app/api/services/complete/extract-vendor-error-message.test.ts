/**
 * Regression test for `extractVendorErrorMessage`.
 *
 * The bug this guards: pre-fix the `complete` route trusted that
 * `result.error` was always a string and cast it as such. OpenAI's
 * standard error envelope is an OBJECT (`{ error: { message, code, type } }`),
 * which then propagated through `useAgent.ts` →
 * `new ServiceDeliveryError(<object>, ...)` → the Error constructor coerced
 * via String() → user saw the literal string "[object Object]" in the
 * paid-but-failed receipt. Surfacing the actual upstream error message
 * is the difference between the user knowing "rate limit, wait and retry"
 * vs "broken UI, no idea what happened".
 *
 * The test file lives next to route.ts per the inline-test convention
 * (canonical for the t2000 monorepo per coding-discipline.mdc).
 */
import { describe, it, expect } from 'vitest';

import { extractVendorErrorMessage } from './route';

describe('extractVendorErrorMessage', () => {
  const FALLBACK = 'Service request failed';

  it('returns the fallback for null / undefined / non-objects', () => {
    expect(extractVendorErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(extractVendorErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(extractVendorErrorMessage('plain string', FALLBACK)).toBe(FALLBACK);
    expect(extractVendorErrorMessage(42, FALLBACK)).toBe(FALLBACK);
  });

  it('returns `error` when it is a non-empty string (gateway / MPP shape)', () => {
    expect(
      extractVendorErrorMessage(
        { error: 'Model "dall-e-3" is not currently supported.' },
        FALLBACK,
      ),
    ).toBe('Model "dall-e-3" is not currently supported.');
  });

  it('walks `error.message` when error is an object (OpenAI shape)', () => {
    const openaiRateLimit = {
      error: {
        code: 'rate_limit_exceeded',
        message: 'Rate limit reached for images per minute. Try again in 30 seconds.',
        type: 'requests',
      },
    };
    expect(extractVendorErrorMessage(openaiRateLimit, FALLBACK)).toBe(
      'Rate limit reached for images per minute. Try again in 30 seconds.',
    );
  });

  it('walks `error.message` for OpenAI safety-system rejections', () => {
    const safetyHit = {
      error: {
        code: 'content_policy_violation',
        message:
          'Your request was rejected as a result of our safety system.',
        type: 'image_generation_user_error',
      },
    };
    expect(extractVendorErrorMessage(safetyHit, FALLBACK)).toBe(
      'Your request was rejected as a result of our safety system.',
    );
  });

  it('JSON-stringifies the error object when no `.message` field exists', () => {
    // Unknown vendor shape — surface SOMETHING structured rather than
    // letting the literal "[object Object]" escape.
    const weirdShape = { error: { code: 'X', detail: 'Y' } };
    const out = extractVendorErrorMessage(weirdShape, FALLBACK);
    expect(out).toContain('"code":"X"');
    expect(out).toContain('"detail":"Y"');
    expect(out).not.toBe('[object Object]');
  });

  it('falls back to top-level `message` if `error` is absent', () => {
    expect(
      extractVendorErrorMessage({ message: 'top-level message' }, FALLBACK),
    ).toBe('top-level message');
  });

  it('treats empty / whitespace-only `error` strings as missing', () => {
    expect(extractVendorErrorMessage({ error: '' }, FALLBACK)).toBe(FALLBACK);
    expect(extractVendorErrorMessage({ error: '   ' }, FALLBACK)).toBe(FALLBACK);
  });

  it('treats empty `error.message` strings as missing → JSON.stringify path', () => {
    const out = extractVendorErrorMessage({ error: { message: '', code: 'X' } }, FALLBACK);
    expect(out).toContain('"code":"X"');
  });

  it('NEVER returns the literal string "[object Object]"', () => {
    // Defensive — every code path must avoid this exact string. Pre-fix
    // this is the symptom we surface in the smoke trace.
    const samples = [
      { error: { code: 'X' } },
      { error: { message: 'real message' } },
      { error: 'real string' },
      { message: 'top-level' },
      {},
      null,
    ];
    for (const sample of samples) {
      expect(extractVendorErrorMessage(sample, FALLBACK)).not.toBe('[object Object]');
    }
  });
});
