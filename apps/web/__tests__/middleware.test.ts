/**
 * SPEC 22.5 — Middleware tests pin the `X-App-Version` header contract.
 *
 * The version-drift client expects this header on every API response.
 * Without it the drift detector silently no-ops; deploys would never
 * trigger an auto-reload.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID;
const ORIGINAL_GIT_SHA = process.env.VERCEL_GIT_COMMIT_SHA;

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(`https://audric.ai${pathname}`));
}

async function freshMiddleware(): Promise<typeof import('../middleware')> {
  vi.resetModules();
  return import('../middleware');
}

beforeEach(() => {
  delete process.env.VERCEL_DEPLOYMENT_ID;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
});

afterEach(() => {
  if (ORIGINAL_DEPLOYMENT_ID === undefined) {
    delete process.env.VERCEL_DEPLOYMENT_ID;
  } else {
    process.env.VERCEL_DEPLOYMENT_ID = ORIGINAL_DEPLOYMENT_ID;
  }
  if (ORIGINAL_GIT_SHA === undefined) {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  } else {
    process.env.VERCEL_GIT_COMMIT_SHA = ORIGINAL_GIT_SHA;
  }
});

describe('middleware — X-App-Version header (SPEC 22.5)', () => {
  it('stamps API responses with X-App-Version (falls back to local-dev when env unset)', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/api/engine/chat'));
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });

  it('stamps panel rewrites with X-App-Version', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/portfolio'));
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });

  it('panel rewrites still rewrite to /new + panel param', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/portfolio'));
    // NextResponse.rewrite sets the x-middleware-rewrite header.
    expect(response.headers.get('x-middleware-rewrite')).toContain('/new');
    expect(response.headers.get('x-middleware-rewrite')).toContain('panel=portfolio');
  });
});

describe('middleware — version source precedence', () => {
  it('prefers VERCEL_DEPLOYMENT_ID over VERCEL_GIT_COMMIT_SHA', async () => {
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_abc';
    process.env.VERCEL_GIT_COMMIT_SHA = 'sha_def';
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/api/foo'));
    expect(response.headers.get('X-App-Version')).toBe('dpl_abc');
  });

  it('falls back to VERCEL_GIT_COMMIT_SHA when VERCEL_DEPLOYMENT_ID missing', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'sha_xyz';
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/api/foo'));
    expect(response.headers.get('X-App-Version')).toBe('sha_xyz');
  });

  it('falls back to local-dev when both env vars unset', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/api/foo'));
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });
});

// [SPEC 30 Phase 1A.2] Middleware JWT signature verification (PERMISSIVE).
// When JWT header is present, signature must verify. When absent, request
// passes through (Phase 1A.5 will tighten to require JWT).
describe('middleware — JWT signature gate (SPEC 30 Phase 1A.2 PERMISSIVE)', () => {
  function makeApiRequest(pathname: string, headers?: Record<string, string>): NextRequest {
    return new NextRequest(new URL(`https://audric.ai${pathname}`), { headers });
  }

  it('passes API requests with no JWT header through (PERMISSIVE)', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeApiRequest('/api/portfolio?address=0xabc'));
    // No JWT → middleware passes through, route handler decides.
    expect(response.status).toBe(200);
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });

  it('rejects API requests with malformed JWT header (signature fail)', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(
      makeApiRequest('/api/user/status', { 'x-zklogin-jwt': 'not-a-real-jwt' }),
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Invalid authentication token');
  });

  it('rejects API requests with structurally-valid but unsigned JWT', async () => {
    const { middleware } = await freshMiddleware();
    const fakeJwt =
      Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify({ sub: 'attacker', iss: 'https://accounts.google.com' })).toString('base64url') +
      '.fake-sig';
    const response = await middleware(
      makeApiRequest('/api/user/status', { 'x-zklogin-jwt': fakeJwt }),
    );
    expect(response.status).toBe(401);
  });

  it('skips JWT verification on /api/internal/* (separate auth)', async () => {
    const { middleware } = await freshMiddleware();
    // Even with a malformed JWT, internal routes pass through (their
    // own gate uses x-internal-key, not zkLogin JWT).
    const response = await middleware(
      makeApiRequest('/api/internal/profile-inference', { 'x-zklogin-jwt': 'malformed' }),
    );
    expect(response.status).toBe(200);
  });

  it('skips JWT verification on /api/cron/* (separate auth)', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(
      makeApiRequest('/api/cron/turn-metrics-cleanup', { 'x-zklogin-jwt': 'malformed' }),
    );
    expect(response.status).toBe(200);
  });

  it('skips JWT verification on /api/services/complete (sig-bound)', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(
      makeApiRequest('/api/services/complete', { 'x-zklogin-jwt': 'malformed' }),
    );
    expect(response.status).toBe(200);
  });

  it('skips JWT verification on /api/transactions/execute (sig-bound)', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(
      makeApiRequest('/api/transactions/execute', { 'x-zklogin-jwt': 'malformed' }),
    );
    expect(response.status).toBe(200);
  });

  it('non-API routes are not subject to JWT gate', async () => {
    const { middleware } = await freshMiddleware();
    const response = await middleware(makeRequest('/'));
    expect(response.status).toBe(200);
  });
});
