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
    const response = middleware(makeRequest('/api/engine/chat'));
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });

  it('stamps panel rewrites with X-App-Version', async () => {
    const { middleware } = await freshMiddleware();
    const response = middleware(makeRequest('/portfolio'));
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });

  it('panel rewrites still rewrite to /new + panel param', async () => {
    const { middleware } = await freshMiddleware();
    const response = middleware(makeRequest('/portfolio'));
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
    const response = middleware(makeRequest('/api/foo'));
    expect(response.headers.get('X-App-Version')).toBe('dpl_abc');
  });

  it('falls back to VERCEL_GIT_COMMIT_SHA when VERCEL_DEPLOYMENT_ID missing', async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'sha_xyz';
    const { middleware } = await freshMiddleware();
    const response = middleware(makeRequest('/api/foo'));
    expect(response.headers.get('X-App-Version')).toBe('sha_xyz');
  });

  it('falls back to local-dev when both env vars unset', async () => {
    const { middleware } = await freshMiddleware();
    const response = middleware(makeRequest('/api/foo'));
    expect(response.headers.get('X-App-Version')).toBe('local-dev');
  });
});
