// SPEC 30 Phase 1A.5 — unit tests for the authFetch wrapper.
//
// Two-pronged coverage:
//   1. Behavioural — JWT is added when present, omitted when not,
//      caller-supplied headers are preserved, the storage-miss path
//      is graceful.
//   2. Invariant — the duplicated `STORAGE_KEY` literal in
//      `auth-fetch.ts` matches `zklogin.ts`'s `STORAGE_KEY`. The
//      duplication is deliberate (zero-dependency module-eval to
//      avoid the env-mock circular import) but it MUST stay in sync.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const STORAGE_KEY = 't2000:zklogin:session';

const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});

const storage = new Map<string, string>();
const localStorageMock = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
};

beforeEach(() => {
  fetchMock.mockClear();
  storage.clear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('localStorage', localStorageMock);
  // Anchor `typeof window !== 'undefined'` to truthy without overriding
  // jsdom's window. The implementation reads `window.localStorage`, so
  // also patch it onto window when it exists.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authFetch', () => {
  it('attaches x-zklogin-jwt when a session is present', async () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({ jwt: 'token-xyz', address: '0xabc' }),
    );
    const { authFetch } = await import('./auth-fetch');
    await authFetch('/api/portfolio?address=0xabc');

    expect(fetchMock).toHaveBeenCalledOnce();
    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-zklogin-jwt')).toBe('token-xyz');
  });

  it('omits the JWT header when no session is present', async () => {
    const { authFetch } = await import('./auth-fetch');
    await authFetch('/api/portfolio?address=0xabc');

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.has('x-zklogin-jwt')).toBe(false);
  });

  it('omits the JWT header when the stored session has an empty jwt', async () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ jwt: '' }));
    const { authFetch } = await import('./auth-fetch');
    await authFetch('/api/portfolio?address=0xabc');

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.has('x-zklogin-jwt')).toBe(false);
  });

  it('preserves caller-supplied headers and merges with the JWT', async () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ jwt: 'token-xyz' }));
    const { authFetch } = await import('./auth-fetch');
    await authFetch('/api/portfolio?address=0xabc', {
      headers: { 'x-trace-id': 'abc123', 'content-type': 'application/json' },
    });

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-zklogin-jwt')).toBe('token-xyz');
    expect(headers.get('x-trace-id')).toBe('abc123');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('does not overwrite a caller-supplied x-zklogin-jwt header', async () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify({ jwt: 'session-token' }));
    const { authFetch } = await import('./auth-fetch');
    await authFetch('/api/portfolio?address=0xabc', {
      headers: { 'x-zklogin-jwt': 'caller-supplied-token' },
    });

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-zklogin-jwt')).toBe('caller-supplied-token');
  });

  it('survives malformed JSON in the storage entry', async () => {
    localStorageMock.setItem(STORAGE_KEY, '{not valid json');
    const { authFetch } = await import('./auth-fetch');
    await authFetch('/api/portfolio?address=0xabc');

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.has('x-zklogin-jwt')).toBe(false);
  });
});

describe('STORAGE_KEY invariant', () => {
  // The deliberate duplication of `STORAGE_KEY` between auth-fetch.ts
  // and zklogin.ts is documented in auth-fetch.ts. This test pins the
  // invariant: the two literals MUST match.
  it('matches the literal in lib/zklogin.ts', () => {
    const here = readFileSync(join(__dirname, 'auth-fetch.ts'), 'utf8');
    const there = readFileSync(join(__dirname, 'zklogin.ts'), 'utf8');
    const KEY_RE = /STORAGE_KEY\s*=\s*['"]([^'"]+)['"]/;
    const a = here.match(KEY_RE);
    const b = there.match(KEY_RE);
    expect(a?.[1]).toBeDefined();
    expect(b?.[1]).toBeDefined();
    expect(a?.[1]).toBe(b?.[1]);
  });
});
