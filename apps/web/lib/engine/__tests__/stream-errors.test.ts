import { describe, it, expect } from 'vitest';
import { sanitizeStreamErrorMessage } from '../stream-errors';

describe('sanitizeStreamErrorMessage', () => {
  it('hides raw Anthropic overloaded JSON', () => {
    const raw =
      '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_abc"}';
    const out = sanitizeStreamErrorMessage(raw);
    expect(out).not.toContain('{');
    expect(out).not.toContain('overloaded_error');
    expect(out.toLowerCase()).toContain('over capacity');
  });

  it('hides raw rate-limit JSON', () => {
    const raw =
      '{"type":"error","error":{"type":"rate_limit_error","message":"too fast"}}';
    expect(sanitizeStreamErrorMessage(raw).toLowerCase()).toContain(
      'too many requests',
    );
  });

  it('rewrites bare network errors', () => {
    expect(sanitizeStreamErrorMessage('ECONNRESET').toLowerCase()).toContain(
      "couldn't reach",
    );
    expect(sanitizeStreamErrorMessage('fetch failed').toLowerCase()).toContain(
      "couldn't reach",
    );
  });

  it('replaces any unknown JSON-shaped message with a generic fallback', () => {
    const raw = '{"weird":"thing","with":"no known signal"}';
    expect(sanitizeStreamErrorMessage(raw)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('passes through plain English messages unchanged', () => {
    const raw = 'Session budget exceeded';
    expect(sanitizeStreamErrorMessage(raw)).toBe(raw);
  });

  it('passes through engine-friendly messages unchanged', () => {
    const raw =
      "Anthropic's servers are over capacity right now. Please try again in 30 seconds.";
    expect(sanitizeStreamErrorMessage(raw)).toBe(raw);
  });
});
