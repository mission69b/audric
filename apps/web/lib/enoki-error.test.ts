import { describe, it, expect } from 'vitest';
import {
  parseEnokiErrorBody,
  isExpiredSessionError,
  SESSION_EXPIRED_USER_MESSAGE,
  SESSION_EXPIRED_RESPONSE_CODE,
} from './enoki-error';

describe('parseEnokiErrorBody', () => {
  it('extracts code + message from the canonical errors[] envelope', () => {
    const body = JSON.stringify({
      errors: [{ code: 'expired', message: 'Sponsored transaction has expired' }],
    });
    expect(parseEnokiErrorBody(body)).toEqual({
      code: 'expired',
      message: 'Sponsored transaction has expired',
    });
  });

  it('extracts the jwt_error message verbatim', () => {
    const body = JSON.stringify({
      errors: [
        { code: 'jwt_error', message: 'no applicable key found in the JSON Web Key Set' },
      ],
    });
    expect(parseEnokiErrorBody(body)).toEqual({
      code: 'jwt_error',
      message: 'no applicable key found in the JSON Web Key Set',
    });
  });

  it('falls back to legacy parsed.message when errors[] is absent', () => {
    const body = JSON.stringify({ message: 'Legacy single-message envelope' });
    expect(parseEnokiErrorBody(body)).toEqual({
      code: undefined,
      message: 'Legacy single-message envelope',
    });
  });

  it('returns empty object for invalid JSON (defensive)', () => {
    expect(parseEnokiErrorBody('not json')).toEqual({});
    expect(parseEnokiErrorBody('')).toEqual({});
  });

  it('returns empty object for malformed envelope', () => {
    expect(parseEnokiErrorBody('null')).toEqual({ code: undefined, message: undefined });
    expect(parseEnokiErrorBody('{}')).toEqual({ code: undefined, message: undefined });
  });

  it('handles errors[] with missing fields gracefully', () => {
    const body = JSON.stringify({ errors: [{}] });
    expect(parseEnokiErrorBody(body)).toEqual({ code: undefined, message: undefined });
  });
});

describe('isExpiredSessionError', () => {
  it('returns true for code=expired (S18-F2)', () => {
    expect(isExpiredSessionError({ code: 'expired', message: 'whatever' })).toBe(true);
  });

  it('returns true for code=jwt_error (S18-F7)', () => {
    expect(
      isExpiredSessionError({
        code: 'jwt_error',
        message: 'no applicable key found in the JSON Web Key Set',
      }),
    ).toBe(true);
  });

  it('returns false for any other code', () => {
    expect(isExpiredSessionError({ code: 'invalid_signature', message: 'x' })).toBe(false);
    expect(isExpiredSessionError({ code: 'internal', message: 'x' })).toBe(false);
    expect(isExpiredSessionError({ code: 'unknown', message: 'x' })).toBe(false);
  });

  it('returns false when code is undefined', () => {
    expect(isExpiredSessionError({})).toBe(false);
    expect(isExpiredSessionError({ message: 'no code' })).toBe(false);
  });
});

describe('exported constants (stable client contract)', () => {
  it('SESSION_EXPIRED_USER_MESSAGE matches the actionable copy', () => {
    expect(SESSION_EXPIRED_USER_MESSAGE).toBe(
      'Your sign-in session has expired. Please sign out and sign back in to continue.',
    );
  });

  it('SESSION_EXPIRED_RESPONSE_CODE is the stable programmatic identifier', () => {
    expect(SESSION_EXPIRED_RESPONSE_CODE).toBe('session_expired');
  });
});
