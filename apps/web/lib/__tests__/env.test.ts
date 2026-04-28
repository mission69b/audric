/**
 * Tests for the env-validation gate. These pin the bug class that
 * motivated the entire `lib/env.ts` module: a Vercel-stored empty
 * string ("") for a required key should fail at boot, not silently
 * degrade.
 *
 * Each test uses `vi.resetModules()` to force the env module to be
 * re-evaluated against a fresh `process.env`. Without that, the schema
 * validation only runs once and subsequent tests inherit the first
 * test's parsed result.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the original env so each test can mutate freely and we can
// restore it in afterEach. `process.env` is a global and tests in the
// same suite share it.
const ORIGINAL_ENV = { ...process.env };

function setMinimumValidEnv() {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
  process.env.BLOCKVISION_API_KEY = 'bv-test';
  process.env.DATABASE_URL = 'postgres://test';
  process.env.ENOKI_SECRET_KEY = 'enoki-test';
  process.env.T2000_INTERNAL_KEY = 't2000-test';
  process.env.SPONSOR_INTERNAL_KEY = 'sponsor-test';
  process.env.UPSTASH_REDIS_REST_URL = 'https://x.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'redis-test';
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-test';
  process.env.NEXT_PUBLIC_ENOKI_API_KEY = 'enoki-pub-test';
  process.env.NEXT_PUBLIC_SUI_NETWORK = 'mainnet';
}

beforeEach(() => {
  // Reset the module cache so `import('../env')` re-runs validation.
  vi.resetModules();
  // Wipe every key first so each test starts from a deterministic baseline.
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith('ANTHROPIC_') ||
      key.startsWith('BLOCKVISION_') ||
      key.startsWith('DATABASE_') ||
      key.startsWith('ENOKI_') ||
      key.startsWith('T2000_') ||
      key.startsWith('SPONSOR_') ||
      key.startsWith('UPSTASH_') ||
      key.startsWith('NEXT_PUBLIC_') ||
      key.startsWith('AGENT_') ||
      key.startsWith('AUDRIC_') ||
      key.startsWith('BRAVE_') ||
      key.startsWith('CRON_') ||
      key.startsWith('OPENAI_') ||
      key.startsWith('ELEVENLABS_') ||
      key.startsWith('RESEND_') ||
      key.startsWith('INTERNAL_') ||
      key.startsWith('SUI_') ||
      key === 'SERVER_URL' ||
      key === 'SYNTHETIC_SESSION_PREFIXES'
    ) {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  // Restore the original env so we don't poison sibling test files.
  for (const key of Object.keys(process.env)) delete process.env[key];
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (v !== undefined) process.env[k] = v;
  }
});

describe('env validation', () => {
  it('passes with all required vars set to non-empty values', async () => {
    setMinimumValidEnv();
    const { env } = await import('../env');
    expect(env.BLOCKVISION_API_KEY).toBe('bv-test');
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-test');
  });

  // ── The original bug ─────────────────────────────────────────────────
  it('REJECTS BLOCKVISION_API_KEY="" (the original Vercel bug)', async () => {
    setMinimumValidEnv();
    process.env.BLOCKVISION_API_KEY = '';
    await expect(import('../env')).rejects.toThrow(
      /Invalid environment configuration\. \d+ issue\(s\)/,
    );
  });

  it('REJECTS BLOCKVISION_API_KEY="   " (whitespace-only)', async () => {
    setMinimumValidEnv();
    process.env.BLOCKVISION_API_KEY = '   ';
    await expect(import('../env')).rejects.toThrow(/Invalid environment configuration/);
  });

  it('REJECTS missing BLOCKVISION_API_KEY entirely', async () => {
    setMinimumValidEnv();
    delete process.env.BLOCKVISION_API_KEY;
    await expect(import('../env')).rejects.toThrow(/Invalid environment configuration/);
  });

  // ── Other required keys (not exhaustive — just enough to confirm the pattern) ──
  it('REJECTS empty ANTHROPIC_API_KEY', async () => {
    setMinimumValidEnv();
    process.env.ANTHROPIC_API_KEY = '';
    await expect(import('../env')).rejects.toThrow();
  });

  it('REJECTS empty DATABASE_URL', async () => {
    setMinimumValidEnv();
    process.env.DATABASE_URL = '';
    await expect(import('../env')).rejects.toThrow();
  });

  it('REJECTS empty ENOKI_SECRET_KEY', async () => {
    setMinimumValidEnv();
    process.env.ENOKI_SECRET_KEY = '';
    await expect(import('../env')).rejects.toThrow();
  });

  // ── Multi-key error reporting ────────────────────────────────────────
  it('reports ALL misconfigured keys in one error (not just the first)', async () => {
    setMinimumValidEnv();
    process.env.BLOCKVISION_API_KEY = '';
    process.env.ENOKI_SECRET_KEY = '';
    process.env.ANTHROPIC_API_KEY = '   ';
    await expect(import('../env')).rejects.toThrow(/3 issue\(s\)/);
  });

  // ── Optional keys ────────────────────────────────────────────────────
  it('normalizes empty optional vars to undefined (not "")', async () => {
    setMinimumValidEnv();
    process.env.BRAVE_API_KEY = '';
    process.env.AGENT_MODEL = '   ';
    const { env } = await import('../env');
    expect(env.BRAVE_API_KEY).toBeUndefined();
    expect(env.AGENT_MODEL).toBeUndefined();
  });

  it('preserves optional vars when set to a non-empty value', async () => {
    setMinimumValidEnv();
    process.env.AGENT_MODEL = 'claude-opus-4-7';
    const { env } = await import('../env');
    expect(env.AGENT_MODEL).toBe('claude-opus-4-7');
  });

  it('trims whitespace around valid optional vars', async () => {
    setMinimumValidEnv();
    process.env.AGENT_MODEL = '  claude-opus-4-7  ';
    const { env } = await import('../env');
    expect(env.AGENT_MODEL).toBe('claude-opus-4-7');
  });

  // ── NEXT_PUBLIC_SUI_NETWORK is an enum, not a free string ────────────
  it('REJECTS NEXT_PUBLIC_SUI_NETWORK="prod" (typo)', async () => {
    setMinimumValidEnv();
    process.env.NEXT_PUBLIC_SUI_NETWORK = 'prod';
    await expect(import('../env')).rejects.toThrow();
  });
});
