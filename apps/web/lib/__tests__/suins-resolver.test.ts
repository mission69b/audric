import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveSuiNs, looksLikeSuiNs, SuinsResolutionError } from '../suins-resolver';

const realFetch = globalThis.fetch;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('looksLikeSuiNs', () => {
  it('returns true for valid SuiNS names', () => {
    expect(looksLikeSuiNs('alex.sui')).toBe(true);
    expect(looksLikeSuiNs('adeniyi.sui')).toBe(true);
    expect(looksLikeSuiNs('foo-bar.sui')).toBe(true);
    expect(looksLikeSuiNs('a.b.sui')).toBe(true);
    expect(looksLikeSuiNs('  Alex.Sui  ')).toBe(true); // case-insensitive + trimmed
  });

  it('returns false for non-SuiNS inputs', () => {
    expect(looksLikeSuiNs('')).toBe(false);
    expect(looksLikeSuiNs('alex')).toBe(false);
    expect(looksLikeSuiNs('alex@sui')).toBe(false);
    expect(looksLikeSuiNs('0x1234')).toBe(false);
    expect(looksLikeSuiNs('alex.eth')).toBe(false);
    expect(looksLikeSuiNs('.sui')).toBe(false);
    expect(looksLikeSuiNs('alex .sui')).toBe(false);
  });
});

describe('resolveSuiNs', () => {
  it('resolves a registered name to its 0x address', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          address: '0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0',
          name: 'example.sui',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const address = await resolveSuiNs('example.sui');
    expect(address).toBe('0x214a4199264348df2364acd683a3971a9927a5252747f4e0776f0506922f9db0');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/suins/resolve?name=example.sui',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lowercases + trims the name before sending to the route', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ address: '0xabc', name: 'foo.sui' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await resolveSuiNs('  FOO.Sui  ');
    expect(fetchMock).toHaveBeenCalledWith('/api/suins/resolve?name=foo.sui', expect.anything());
  });

  it('throws invalid_format when the input does not look like a SuiNS name', async () => {
    await expect(resolveSuiNs('alex')).rejects.toMatchObject({
      code: 'invalid_format',
    });
    await expect(resolveSuiNs('alex.eth')).rejects.toBeInstanceOf(SuinsResolutionError);
    await expect(resolveSuiNs('')).rejects.toBeInstanceOf(SuinsResolutionError);
  });

  it('throws not_registered when the route returns a null address', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ address: null, name: 'unowned.sui' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await resolveSuiNs('unowned.sui');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SuinsResolutionError);
    expect((caught as SuinsResolutionError).code).toBe('not_registered');
    expect((caught as SuinsResolutionError).message).toMatch(/unowned\.sui/);
  });

  it('throws rpc_failure when the route returns a non-200', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'RPC HTTP 502' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    await expect(resolveSuiNs('alex.sui')).rejects.toMatchObject({
      code: 'rpc_failure',
    });
  });

  it('throws rpc_failure when fetch itself rejects (network error / timeout)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    await expect(resolveSuiNs('alex.sui')).rejects.toMatchObject({
      code: 'rpc_failure',
      message: expect.stringContaining('network down'),
    });
  });

  it('error message includes the original raw name (not the normalized form) so the user sees what they typed', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ address: null, name: 'foo.sui' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    let caught: SuinsResolutionError | undefined;
    try {
      await resolveSuiNs('Adeniyi.Sui'); // mixed case as the user typed
    } catch (err) {
      caught = err as SuinsResolutionError;
    }
    expect(caught?.message).toMatch(/Adeniyi\.Sui/);
  });
});
