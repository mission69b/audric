/**
 * Integration tests for the prepare route.
 * These test USDC enforcement, parameter validation, and error handling
 * without hitting real Sui RPC or Enoki.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The "happy path past validation" tests below (allow-list passers, swap
// missing-tokens, save-without-asset, claim-rewards) deliberately don't
// short-circuit at param validation — they need the route to reach the
// SDK adapter / Enoki sponsor layer to prove `assertAllowedAsset` and
// the field-validation gates fire AFTER the auth/JWT path. The adapter
// layer makes real outbound HTTP (Enoki 401, BlockVision 429, Sui RPC)
// in CI, and each retry burns 1-3 seconds. Local runs hit 1-3s per
// case; GitHub Actions runners occasionally tip past the 5s default
// `testTimeout` and the suite goes red. Bumping this file's budget to
// 15s covers worst-case CI latency without masking real regressions —
// the adapter still has its own short retry budgets, so a genuine hang
// would still time out, just at 15s instead of 5s.
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
  return new NextRequest('http://localhost/api/transactions/prepare', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

describe('POST /api/transactions/prepare — savings asset allow-list', () => {
  // [v0.51.0] USDsui joined USDC as a permitted save/borrow asset (strategic
  // exception — see .cursor/rules/savings-usdc-only.mdc). Every other asset
  // (GOLD, SUI, USDT, USDe, ETH, NAVX, WAL) must still be rejected by the
  // SDK's `assertAllowedAsset` allow-list. These tests are the regression
  // guard for that boundary.
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('rejects save with asset=USDT (caught by allow-list)', async () => {
    const res = await POST(buildRequest({
      type: 'save',
      address: VALID_ADDR,
      amount: 10,
      asset: 'USDT',
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects save with asset=SUI', async () => {
    const res = await POST(buildRequest({
      type: 'save',
      address: VALID_ADDR,
      amount: 1,
      asset: 'SUI',
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects save with asset=USDe (other stable still blocked)', async () => {
    const res = await POST(buildRequest({
      type: 'save',
      address: VALID_ADDR,
      amount: 1,
      asset: 'USDe',
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects borrow with asset=USDT', async () => {
    const res = await POST(buildRequest({
      type: 'borrow',
      address: VALID_ADDR,
      amount: 5,
      asset: 'USDT',
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('rejects borrow with asset=ETH', async () => {
    const res = await POST(buildRequest({
      type: 'borrow',
      address: VALID_ADDR,
      amount: 0.5,
      asset: 'ETH',
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('allows save with asset=USDsui (strategic exception)', async () => {
    // USDsui passes the allow-list; the route still fails downstream because
    // there's no real Sui RPC in the test env, but it MUST get past
    // assertAllowedAsset without an INVALID_ASSET error. That's the boundary
    // we're guarding here.
    const res = await POST(buildRequest({
      type: 'save',
      address: VALID_ADDR,
      amount: 1,
      asset: 'USDsui',
    }));
    const body = await res.json();
    expect(body.error).not.toContain('INVALID_ASSET');
    expect(body.error).not.toContain('only supports');
  });

  it('allows borrow with asset=USDsui (strategic exception)', async () => {
    const res = await POST(buildRequest({
      type: 'borrow',
      address: VALID_ADDR,
      amount: 1,
      asset: 'USDsui',
    }));
    const body = await res.json();
    expect(body.error).not.toContain('INVALID_ASSET');
    expect(body.error).not.toContain('only supports');
  });
});

describe('POST /api/transactions/prepare — parameter validation', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('rejects zero amount', async () => {
    const res = await POST(buildRequest({
      type: 'send',
      address: VALID_ADDR,
      amount: 0,
      recipient: VALID_ADDR,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid amount');
  });

  it('rejects negative amount', async () => {
    const res = await POST(buildRequest({
      type: 'save',
      address: VALID_ADDR,
      amount: -5,
    }));
    expect(res.status).toBe(400);
  });

  it('rejects send without recipient', async () => {
    const res = await POST(buildRequest({
      type: 'send',
      address: VALID_ADDR,
      amount: 1,
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toMatch(/recipient/i);
  });

  it('rejects invalid address', async () => {
    const res = await POST(buildRequest({
      type: 'save',
      address: 'not-an-address',
      amount: 1,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid address');
  });

  it('rejects missing JWT', async () => {
    const req = new NextRequest('http://localhost/api/transactions/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'save', address: VALID_ADDR, amount: 1 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('swap rejects missing from/to tokens', async () => {
    const res = await POST(buildRequest({
      type: 'swap',
      address: VALID_ADDR,
      amount: 1,
    }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('swap rejects unknown token name', async () => {
    const res = await POST(buildRequest({
      type: 'swap',
      address: VALID_ADDR,
      amount: 1,
      from: 'FAKECOIN',
      to: 'USDC',
    }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Unknown token');
  });

  it('allows save without explicit asset (defaults to USDC)', async () => {
    const res = await POST(buildRequest({
      type: 'save',
      address: VALID_ADDR,
      amount: 1,
    }));
    // Will fail at the Sui RPC/adapter level, not the asset validation
    const body = await res.json();
    expect(body.error).not.toContain('INVALID_ASSET');
    expect(body.error).not.toContain('only supports');
  });

  it('allows borrow without explicit asset (defaults to USDC)', async () => {
    const res = await POST(buildRequest({
      type: 'borrow',
      address: VALID_ADDR,
      amount: 1,
    }));
    const body = await res.json();
    expect(body.error).not.toContain('INVALID_ASSET');
    expect(body.error).not.toContain('only supports');
  });

  it('claim-rewards skips amount validation', async () => {
    const res = await POST(buildRequest({
      type: 'claim-rewards',
      address: VALID_ADDR,
      amount: 0,
    }));
    // Fails at the adapter level, not amount validation
    const body = await res.json();
    expect(body.error).not.toContain('Invalid amount');
  });
});

// ─── SPEC 7 P2.4 Layer 3 — Bundle (Payment Stream) parameter validation ───

describe('POST /api/transactions/prepare — bundle requests', () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('ENOKI_SECRET_KEY', 'enoki_private_test_key');
    vi.stubEnv('NEXT_PUBLIC_SUI_NETWORK', 'mainnet');
    const mod = await import('./route');
    POST = mod.POST as unknown as (req: NextRequest) => Promise<Response>;
  });

  it('rejects bundle with missing steps array', async () => {
    const res = await POST(buildRequest({
      type: 'bundle',
      address: VALID_ADDR,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/steps/);
  });

  it('rejects bundle with empty steps array', async () => {
    const res = await POST(buildRequest({
      type: 'bundle',
      address: VALID_ADDR,
      steps: [],
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-empty/);
  });

  it('rejects bundle with > 10 steps (DoS guard)', async () => {
    const steps = Array.from({ length: 11 }, () => ({
      toolName: 'save_deposit',
      input: { amount: 1, asset: 'USDC' },
    }));
    const res = await POST(buildRequest({
      type: 'bundle',
      address: VALID_ADDR,
      steps,
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/10-step limit/);
  });

  it('accepts a valid 2-step bundle past parameter validation', async () => {
    // Failure at the SDK / Enoki adapter layer is fine — we're only
    // proving the bundle handler accepts the shape and reaches composeTx.
    const res = await POST(buildRequest({
      type: 'bundle',
      address: VALID_ADDR,
      steps: [
        { toolName: 'save_deposit', input: { amount: 1, asset: 'USDC' } },
        { toolName: 'send_transfer', input: { to: '0x' + 'b'.repeat(64), amount: 1, asset: 'USDC' } },
      ],
    }));
    const body = await res.json();
    // Specifically NOT one of the bundle-validation errors:
    expect(body.error).not.toMatch(/non-empty/);
    expect(body.error).not.toMatch(/10-step limit/);
  });
});
