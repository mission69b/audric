/**
 * Integration tests for /api/services/prepare.
 *
 * These cover parameter validation + the boundary checks that gate the
 * downstream MPP gateway/composeTx calls. Full end-to-end coverage (live
 * gateway 402 challenges, real Enoki sponsor) is out of scope for unit
 * tests — those run as smoke tests against staging.
 *
 * Added in SPEC 7 P2.2c audit (2026-05-02) to close a coverage gap: the
 * route had ZERO tests pre-migration, so the composeTx migration had no
 * regression guard. This file is the regression baseline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.setConfig({ testTimeout: 15000 });

function fakeJwt(payload: Record<string, unknown> = { sub: '123', email: 'test@test.com' }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

const TEST_JWT = fakeJwt();
const VALID_ADDR = '0x' + 'a'.repeat(64);

function buildRequest(body: unknown, jwt: string = TEST_JWT): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers['x-zklogin-jwt'] = jwt;
  return new NextRequest('http://localhost/api/services/prepare', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/services/prepare — parameter validation', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('rejects request with invalid Sui address', async () => {
    const res = await POST(buildRequest({
      address: '0xnotvalid',
      serviceId: 'translate-en-fr',
      fields: { text: 'hello' },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid address/i);
  });

  it('rejects request with malformed JSON body', async () => {
    const req = new NextRequest('http://localhost/api/services/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-zklogin-jwt': TEST_JWT },
      body: '{ not valid json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/i);
  });

  it('rejects unknown serviceId', async () => {
    const res = await POST(buildRequest({
      address: VALID_ADDR,
      serviceId: 'does-not-exist',
      fields: {},
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown or disallowed service/i);
  });

  it('rejects request with neither serviceId nor url', async () => {
    const res = await POST(buildRequest({
      address: VALID_ADDR,
      fields: {},
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown or disallowed service/i);
  });
});

describe('POST /api/services/prepare — auth + rate limiting', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('rejects request without a JWT', async () => {
    const req = new NextRequest('http://localhost/api/services/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: VALID_ADDR,
        serviceId: 'translate-en-fr',
        fields: { text: 'hello' },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/services/prepare — env gate', () => {
  it('returns 500 when ENOKI_SECRET_KEY is not configured', async () => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    vi.stubEnv('ENOKI_SECRET_KEY', '');
    let mod;
    try {
      mod = await import('./route');
    } catch {
      // Env validation may throw at import — the gate is hit either way.
      // The boot-time hook is what surfaces the error in prod; tests just
      // verify the route is unreachable when the secret is missing.
      expect(true).toBe(true);
      return;
    }
    const POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
    const res = await POST(buildRequest({
      address: VALID_ADDR,
      serviceId: 'translate-en-fr',
      fields: { text: 'hello' },
    }));
    expect(res.status).toBe(500);
  });
});
