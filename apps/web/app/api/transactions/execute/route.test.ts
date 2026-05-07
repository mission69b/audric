import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/transactions/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/transactions/execute', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');

    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for missing digest', async () => {
    const res = await POST(buildRequest({ signature: 'sig' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing digest');
  });

  it('returns 400 for missing signature', async () => {
    const res = await POST(buildRequest({ digest: 'abc123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Missing signature');
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/transactions/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // [S18-F2] When Enoki returns `{"errors":[{"code":"expired","message":"Sponsored transaction has expired"}]}`
  // (which empirically fires for stale zkLogin JWTs, NOT actual sponsorship-blob
  // TTL expiry — verified live 2026-05-07 against funkii.audric.sui aged session
  // vs same-account fresh sign-in), the route must surface 401 + actionable copy
  // so the chat narrates the recovery path. Pre-S18-F2 this fell through to the
  // generic 400 branch and the agent narrated "NAVI returned a 400 error".
  it('returns 401 + actionable copy when Enoki returns code=expired (S18-F2)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: [{ code: 'expired', message: 'Sponsored transaction has expired' }] }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await POST(buildRequest({ digest: 'abc123def456', signature: 'sig' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('session_expired');
    expect(body.error).toMatch(/sign.*out.*sign.*back in/i);
    // The agent reads `error` and narrates it. Make sure the copy is the recovery
    // instruction, not the misleading raw Enoki message.
    expect(body.error).not.toContain('Sponsored transaction has expired');
  });

  // Pre-S18-F2 the route parsed `parsed.message` from `JSON.parse(errorBody)` —
  // but Enoki's actual envelope is `{ errors: [{ message }] }`. As a result
  // `parsed.message` was always undefined and every non-404 Enoki failure fell
  // back to "Execution failed (<status>)", giving the engine no useful signal.
  // Fix: extract `errors[0].message` first; fall back to legacy `parsed.message`.
  it('extracts the real Enoki error message from `errors[0].message` (not the legacy `message` field)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: [{ code: 'invalid_signature', message: 'Signature does not match the sponsored transaction.' }] }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await POST(buildRequest({ digest: 'abc123def456', signature: 'sig' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Signature does not match the sponsored transaction.');
  });

  it('preserves the 404 branch (sponsored tx not found)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('', { status: 404 }),
    );

    const res = await POST(buildRequest({ digest: 'abc123def456', signature: 'sig' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/expired or not found/i);
  });

  it('maps 5xx Enoki errors to 502 (upstream failure)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ errors: [{ code: 'internal', message: 'Internal sponsor error' }] }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const res = await POST(buildRequest({ digest: 'abc123def456', signature: 'sig' }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Internal sponsor error');
  });

  // Pre-env-validation this route returned 500 with a "not configured"
  // body when ENOKI_SECRET_KEY was missing at request time. After
  // `lib/env.ts` landed (Apr 2026, post the BlockVision empty-string
  // bug), the validation runs at module load — so an empty key fails
  // BEFORE the route can even handle a request. The runtime 500 path
  // is no longer reachable.
  //
  // The "missing key fails fast" guarantee is now pinned in
  // `lib/__tests__/env.test.ts > REJECTS empty ENOKI_SECRET_KEY`. We
  // keep this comment instead of the deleted test so the next person
  // who notices the gap understands why the assertion moved up a layer.
  it('boot-time env validation prevents the route from running with an empty key (covered in env.test.ts)', () => {
    expect(true).toBe(true);
  });
});
