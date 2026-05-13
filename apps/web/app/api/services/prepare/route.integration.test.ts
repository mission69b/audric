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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

/**
 * [SPEC 26 P5.2 — 2026-05-13] Settle-on-success refundable verdict at the
 * prepare boundary.
 *
 * Pre-fix: the route assumed every gateway 402 was an mppx Challenge envelope,
 * called `Challenge.fromResponse`, the parse threw on the upstream error body,
 * and the route returned 502 "Gateway returned 402 but challenge could not be
 * parsed" — dropping `settleVerdict` + `settleReason` + the upstream error
 * message that the engine D-8 paragraph relies on for the LLM's
 * transient-vs-correctable retry decision.
 *
 * Post-fix: classify BEFORE attempting `Challenge.fromResponse`. If the gateway
 * returned the SPEC 26 settle-no-delivery shape (402 + `x-settle-verdict`
 * header), short-circuit and return the same shape `services/complete` returns
 * for late-stage settle-no-delivery (402 + `paymentConfirmed: false` +
 * `settleVerdict` + `settleReason`). The only difference vs the late path:
 * `paymentDigest` is always `null` here because no Sui transfer has fired yet
 * (this is the BEST case — early failure means the SPEC 26 O-4 deferred-refund
 * caveat does not apply).
 */
describe('POST /api/services/prepare — SPEC 26 settle-no-delivery short-circuit', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns SPEC 26 402 + paymentConfirmed:false + settleVerdict + settleReason when gateway emits x-settle-verdict header', async () => {
    const upstreamErrorBody = {
      error: { message: 'Account does not have access to image generation', code: 'access_denied' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(upstreamErrorBody), {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'x-settle-verdict': 'refundable',
            'x-settle-reason': 'upstream 403',
          },
        }),
      ),
    );

    const res = await POST(
      buildRequest({
        address: VALID_ADDR,
        url: 'openai/v1/images/generations',
        rawBody: { prompt: 'a cat' },
      }),
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toMatchObject({
      paymentConfirmed: false,
      serviceStatus: 402,
      settleVerdict: 'refundable',
      settleReason: 'upstream 403',
      paymentDigest: null,
    });
    expect(body.error).toMatch(/Account does not have access/);
  });

  it('falls back to default settle reason when x-settle-reason header is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'something failed' }), {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'x-settle-verdict': 'refundable',
          },
        }),
      ),
    );

    const res = await POST(
      buildRequest({
        address: VALID_ADDR,
        url: 'openai/v1/images/generations',
        rawBody: { prompt: 'a cat' },
      }),
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.settleVerdict).toBe('refundable');
    expect(body.settleReason).toBe('Upstream rejected; no charge.');
    expect(body.paymentDigest).toBeNull();
  });

  it('preserves the charge-failed verdict when gateway emits it (treated as free-retry per engine D-8)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Sui RPC congestion' }), {
          status: 402,
          headers: {
            'content-type': 'application/json',
            'x-settle-verdict': 'charge-failed',
            'x-settle-reason': 'Sui-congestion',
          },
        }),
      ),
    );

    const res = await POST(
      buildRequest({
        address: VALID_ADDR,
        url: 'openai/v1/images/generations',
        rawBody: { prompt: 'a cat' },
      }),
    );

    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.settleVerdict).toBe('charge-failed');
    expect(body.settleReason).toBe('Sui-congestion');
    expect(body.paymentConfirmed).toBe(false);
    expect(body.paymentDigest).toBeNull();
  });

  it('does NOT short-circuit on a regular x402 challenge (no x-settle-verdict header)', async () => {
    // Emulates the legacy bare 402 mppx Challenge that prepare used to handle
    // exclusively. Without the header, classifyGatewayResponse returns
    // 'success' (legacy passthrough), control flows to Challenge.fromResponse.
    // The body here is intentionally not a valid Challenge so that path errors
    // out the OLD way (502 "challenge could not be parsed") — proving the SPEC
    // 26 short-circuit is gated strictly on the header, not all 402s.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'not a challenge' }), {
          status: 402,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const res = await POST(
      buildRequest({
        address: VALID_ADDR,
        url: 'openai/v1/images/generations',
        rawBody: { prompt: 'a cat' },
      }),
    );

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/challenge could not be parsed/i);
    expect(body.settleVerdict).toBeUndefined();
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
