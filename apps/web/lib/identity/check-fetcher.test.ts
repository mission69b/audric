/**
 * `fetchIdentityCheck` HTTP-status mapping contract.
 *
 * Owned by `lib/identity/check-fetcher.ts`. Both the signup picker
 * (UsernamePicker) and the change-handle modal (UsernameChangeModal)
 * route through this helper, so a regression here breaks BOTH surfaces
 * — these tests are the canonical guard against the "one fetcher got
 * fixed, the other didn't" failure class (cf. S18-F18, S18-F19).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchIdentityCheck } from './check-fetcher';

describe('fetchIdentityCheck', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns { available: true } on 200 + body.available=true', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ available: true }), { status: 200 }),
    ) as typeof global.fetch;

    const r = await fetchIdentityCheck('alice');

    expect(r).toEqual({ available: true, reason: undefined });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/identity/check?username=alice',
      { method: 'GET' },
    );
  });

  it('returns { available: false, reason } on 200 + body.available=false', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ available: false, reason: 'taken' }),
        { status: 200 },
      ),
    ) as typeof global.fetch;

    const r = await fetchIdentityCheck('funkii');

    expect(r).toEqual({ available: false, reason: 'taken' });
  });

  it('URL-encodes the label so it survives unsafe characters', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ available: false, reason: 'invalid' }), { status: 200 }),
    );
    global.fetch = fetchMock as typeof global.fetch;

    await fetchIdentityCheck('hello world');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/identity/check?username=hello%20world',
      { method: 'GET' },
    );
  });

  it('maps 503 to verifierDown=true (RPC degraded — Sui fullnode flaky)', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'SuiNS verification temporarily unavailable' }), {
        status: 503,
      }),
    ) as typeof global.fetch;

    const r = await fetchIdentityCheck('alice');

    expect(r).toEqual({ available: false, verifierDown: true });
  });

  it('S18-F19: maps 429 to verifierDown=true (rate-limited — fast typer)', async () => {
    // Pre-S18-F19 this fell through to the throw branch and rendered
    // the scary "// CHECK FAILED" copy. After the 2026-05-08 launch
    // showed real users tripping the limit by typing fast, both 503
    // and 429 surface as verifierDown — same retry-friendly UX.
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Rate limit exceeded' }), { status: 429 }),
    ) as typeof global.fetch;

    const r = await fetchIdentityCheck('alice');

    expect(r).toEqual({ available: false, verifierDown: true });
  });

  it('throws on other non-OK statuses (genuine errors → "// CHECK FAILED")', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 }),
    ) as typeof global.fetch;

    await expect(fetchIdentityCheck('alice')).rejects.toThrow('identity-check 500');
  });

  it('throws on 400 (genuine client-side error — distinct from rate-limit)', async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'Missing username parameter' }), { status: 400 }),
    ) as typeof global.fetch;

    await expect(fetchIdentityCheck('')).rejects.toThrow('identity-check 400');
  });

  it('throws on network failure (fetch rejects)', async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof global.fetch;

    await expect(fetchIdentityCheck('alice')).rejects.toThrow('Failed to fetch');
  });
});
