import { describe, it, expect, vi, beforeEach } from 'vitest';
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
