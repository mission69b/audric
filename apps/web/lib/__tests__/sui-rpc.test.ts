import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * `getSuiRpcUrl` reads through the validated `lib/env` module, which is
 * a module-load-time snapshot. To exercise different env states per
 * test, we have to reset both `process.env` AND the module cache so the
 * dynamic `import('../sui-rpc')` re-evaluates `lib/env.ts` against the
 * fresh process.env on every iteration.
 *
 * Required keys are always set (env.ts schema rejects empty strings)
 * regardless of what the test under test cares about — otherwise the
 * env import would throw before sui-rpc even gets a chance to run.
 */

const REQUIRED_BASE_ENV: Record<string, string> = {
  ANTHROPIC_API_KEY: 'sk-ant-test',
  BLOCKVISION_API_KEY: 'baseline-key', // overridden per-test below
  DATABASE_URL: 'postgres://test',
  ENOKI_SECRET_KEY: 'enoki-test',
  T2000_INTERNAL_KEY: 't2000-test',
  UPSTASH_REDIS_REST_URL: 'https://x.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-test',
  // SPEC 10 B.2 — required as of S.69 follow-up.
  AUDRIC_PARENT_NFT_PRIVATE_KEY: 'suiprivkey-test',
  NEXT_PUBLIC_GOOGLE_CLIENT_ID: 'google-test',
  NEXT_PUBLIC_ENOKI_API_KEY: 'enoki-pub-test',
  NEXT_PUBLIC_SUI_NETWORK: 'mainnet',
};

const VARIABLE_KEYS = ['BLOCKVISION_API_KEY', 'SUI_RPC_URL', 'NEXT_PUBLIC_SUI_NETWORK'] as const;

const ORIGINAL_ENV = { ...process.env };

async function loadGetSuiRpcUrl() {
  vi.resetModules();
  const mod = await import('../sui-rpc');
  return mod.getSuiRpcUrl;
}

describe('getSuiRpcUrl', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    for (const [k, v] of Object.entries(REQUIRED_BASE_ENV)) process.env[k] = v;
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
      if (v !== undefined) process.env[k] = v;
    }
  });

  it('uses BlockVision URL with the configured key (production default)', async () => {
    process.env.BLOCKVISION_API_KEY = 'test-key-123';
    const getSuiRpcUrl = await loadGetSuiRpcUrl();
    expect(getSuiRpcUrl()).toBe('https://sui-mainnet.blockvision.org/v1/test-key-123');
  });

  it('respects NEXT_PUBLIC_SUI_NETWORK=testnet', async () => {
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'testnet';
    process.env.BLOCKVISION_API_KEY = 'test-key-123';
    const getSuiRpcUrl = await loadGetSuiRpcUrl();
    expect(getSuiRpcUrl()).toBe('https://sui-testnet.blockvision.org/v1/test-key-123');
  });

  it('SUI_RPC_URL override takes precedence over BlockVision', async () => {
    process.env.SUI_RPC_URL = 'https://custom.example/rpc';
    process.env.BLOCKVISION_API_KEY = 'should-be-ignored';
    const getSuiRpcUrl = await loadGetSuiRpcUrl();
    expect(getSuiRpcUrl()).toBe('https://custom.example/rpc');
  });

  // Note: the "no BlockVision key, fall back to public fullnode" branch
  // is no longer reachable from `getSuiRpcUrl` callers because the env
  // schema (lib/env.ts) rejects empty BLOCKVISION_API_KEY at boot. The
  // fallback is kept in code as defense-in-depth but is unreachable in
  // any path that goes through validated env. We don't test it here
  // because reaching it would require asserting the env module throws,
  // which is covered exhaustively in env.test.ts.
});

// `VARIABLE_KEYS` is exported for clarity about which keys this suite
// intentionally varies; it isn't used in assertions but documents the
// boundaries of the test surface.
void VARIABLE_KEYS;
