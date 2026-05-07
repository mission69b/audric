#!/usr/bin/env tsx
/**
 * Mainnet mint load test for /api/identity/reserve.
 *
 * What this exercises (vs. the read-side k6 tests next door)
 * ----------------------------------------------------------
 * The READ-SIDE k6 test (`identity-check.k6.js`) hits a stateless route
 * that doesn't touch chain state. It validates the SuiNS RPC + cache
 * funnel, but tells us NOTHING about what we actually care about for a
 * 100-1000 user signup burst: whether the audric registry shared object
 * can absorb concurrent mints without dropping requests on the floor.
 *
 * This script answers that question with REAL on-chain data:
 *   1. Generate N throwaway Ed25519 keypairs locally
 *   2. Seed a User row per keypair in prod DB (suiAddress, no username)
 *   3. Mint a fake-but-shape-valid JWT (validateJwt is structural only)
 *   4. Fire concurrent POST /api/identity/reserve with a unique handle
 *      per wallet, ramping concurrency to find the cliff
 *   5. Capture success/fail/error-code/latency per request
 *   6. Write an audit JSON so the companion cleanup script can revoke
 *      leaves + delete test users
 *
 * Cost & cleanup
 * --------------
 * Each successful mint costs ~0.0032 SUI from the audric custody wallet
 * (~$0.008 at SUI ≈ $2.50). 200 mints = ~$1.60. Failed mints cost
 * nothing (gas is only burned on successful execution).
 *
 * After the test, run `mint-cleanup.ts <audit-file>` to:
 *   - Revoke each minted leaf (another ~$1.60 in gas) — OR leave them
 *     as identifiable garbage (handles are `lt-*` prefixed, won't
 *     collide with real users)
 *   - Delete the test User rows from prod DB
 *
 * Safety guards (no real-user impact)
 * -----------------------------------
 *   - All handles use the `lt-<runTag>-NNN` prefix — no real user would
 *     pick this format
 *   - All test User rows have a synthetic `suiAddress` (random keypair,
 *     no real funds, never receives a transfer)
 *   - User rows are tagged via `googleSub: LOADTEST_<runTag>_<i>` so
 *     the cleanup script can find them deterministically
 *   - The route's per-address rate limit (5/24h) means each test wallet
 *     can only attempt once — no double-spend risk
 *
 * Usage
 * -----
 *   # Tiny smoke test — 5 wallets, 2 concurrent
 *   AUDRIC_BASE_URL=https://audric.ai PROFILE=smoke \
 *     pnpm tsx apps/web/scripts/loadtest/mint-load-test.ts
 *
 *   # Realistic 100-user burst
 *   AUDRIC_BASE_URL=https://audric.ai PROFILE=burst-100 \
 *     pnpm tsx apps/web/scripts/loadtest/mint-load-test.ts
 *
 *   # Find-the-cliff 200-user burst
 *   AUDRIC_BASE_URL=https://audric.ai PROFILE=burst-200 \
 *     pnpm tsx apps/web/scripts/loadtest/mint-load-test.ts
 *
 * Required env (loaded via dotenv from apps/web/.env.local):
 *   DATABASE_URL — prod Postgres URL
 */

/* eslint-disable no-console */

import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../../lib/generated/prisma/client';

// Load .env.local explicitly — tsx scripts don't inherit Next.js env loading.
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '../../.env.local') });

// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script invoked outside Next.js runtime; env.ts schema would force validation of unrelated production vars.
const TARGET = process.env.AUDRIC_BASE_URL || 'https://audric.ai';
// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script invoked outside Next.js runtime.
const PROFILE = process.env.PROFILE || 'smoke';

interface Profile {
  wallets: number;
  concurrency: number;
  label: string;
}

const PROFILES: Record<string, Profile> = {
  smoke: { wallets: 5, concurrency: 2, label: 'Smoke (5 wallets, 2 concurrent)' },
  'burst-50': { wallets: 50, concurrency: 25, label: '50-user burst (25 concurrent)' },
  'burst-100': { wallets: 100, concurrency: 50, label: '100-user burst (50 concurrent)' },
  'burst-200': { wallets: 200, concurrency: 100, label: '200-user burst (100 concurrent)' },
  'all-at-once': {
    wallets: 100,
    concurrency: 100,
    label: 'All-at-once (100 wallets fire simultaneously — worst-case contention)',
  },
};

const cfg = PROFILES[PROFILE];
if (!cfg) {
  console.error(`Unknown PROFILE="${PROFILE}". Valid: ${Object.keys(PROFILES).join(', ')}`);
  process.exit(1);
}

const RUN_TAG = `r${randomBytes(3).toString('hex')}`;
const RUN_STARTED_AT = new Date();
const AUDIT_DIR = join(here, 'runs');
const AUDIT_FILE = join(
  AUDIT_DIR,
  `mint-loadtest-${RUN_STARTED_AT.toISOString().replace(/[:.]/g, '-')}-${RUN_TAG}.json`,
);

if (!existsSync(AUDIT_DIR)) mkdirSync(AUDIT_DIR, { recursive: true });

interface Wallet {
  idx: number;
  address: string;
  handle: string;
  keypair: Ed25519Keypair;
}

interface ReserveResult {
  idx: number;
  handle: string;
  address: string;
  status: number;
  ms: number;
  ok: boolean;
  txDigest: string | null;
  error: string | null;
  reason?: string | null;
}

function mintFakeJwt(addr: string): string {
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return [
    b64({ alg: 'none', typ: 'JWT', kid: RUN_TAG }),
    b64({
      sub: addr,
      iss: 'mint-load-test',
      aud: 'audric',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
    Buffer.from('loadtest').toString('base64url'),
  ].join('.');
}

function makeWallet(idx: number): Wallet {
  const keypair = Ed25519Keypair.generate();
  const address = keypair.toSuiAddress();
  const handle = `lt-${RUN_TAG}-${String(idx).padStart(3, '0')}`;
  return { idx, address, handle, keypair };
}

async function seedTestUser(prisma: PrismaClient, wallet: Wallet): Promise<void> {
  // Tag via displayName so the cleanup script can find LOADTEST rows by
  // a `startsWith` query. User schema (apps/web/prisma/schema.prisma)
  // has no dedicated tagging field — displayName is the cheapest non-
  // unique optional column we can hijack for this.
  await prisma.user.create({
    data: {
      suiAddress: wallet.address,
      displayName: `LOADTEST_${RUN_TAG}_${wallet.idx}`,
    },
  });
}

async function reserveOne(wallet: Wallet, jwt: string): Promise<ReserveResult> {
  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(`${TARGET}/api/identity/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zklogin-jwt': jwt,
        'user-agent': `audric-mint-loadtest/${RUN_TAG}`,
      },
      body: JSON.stringify({
        label: wallet.handle,
        address: wallet.address,
      }),
    });
  } catch (err) {
    return {
      idx: wallet.idx,
      handle: wallet.handle,
      address: wallet.address,
      status: 0,
      ms: Math.round(performance.now() - start),
      ok: false,
      txDigest: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const ms = Math.round(performance.now() - start);
  let body: { success?: boolean; txDigest?: string; error?: string; reason?: string } | null = null;
  try {
    body = (await res.json()) as typeof body;
  } catch {
    body = { error: '<unparseable response>' };
  }

  return {
    idx: wallet.idx,
    handle: wallet.handle,
    address: wallet.address,
    status: res.status,
    ms,
    ok: res.status === 200 && body?.success === true,
    txDigest: body?.txDigest ?? null,
    error: body?.success ? null : body?.error ?? `HTTP ${res.status}`,
    reason: body?.reason ?? null,
  };
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function runConcurrent(
  wallets: Wallet[],
  concurrency: number,
): Promise<ReserveResult[]> {
  const results = new Array(wallets.length) as ReserveResult[];
  let nextIdx = 0;
  let completed = 0;

  async function worker(): Promise<void> {
    while (true) {
      const myIdx = nextIdx;
      nextIdx += 1;
      if (myIdx >= wallets.length) return;
      const w = wallets[myIdx];
      const jwt = mintFakeJwt(w.address);
      const r = await reserveOne(w, jwt);
      results[myIdx] = r;
      completed += 1;
      const tag = r.ok ? '✓' : '✗';
      console.log(
        `  [${String(completed).padStart(3, ' ')}/${wallets.length}] ${tag} ${w.handle} ${r.status} ${r.ms}ms${
          r.error ? ` — ${r.error.slice(0, 80)}` : ''
        }`,
      );
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, wallets.length) }, () => worker()),
  );
  return results;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  console.log('━'.repeat(70));
  console.log(`MINT LOAD TEST — ${cfg.label}`);
  console.log('━'.repeat(70));
  console.log(`Target:    ${TARGET}`);
  console.log(`Run tag:   ${RUN_TAG}`);
  console.log(`Started:   ${RUN_STARTED_AT.toISOString()}`);
  console.log(`Audit:     ${AUDIT_FILE}`);
  console.log(`Wallets:   ${cfg.wallets}`);
  console.log(`Concurr:   ${cfg.concurrency}`);
  console.log(`Est cost:  ~$${(cfg.wallets * 0.008).toFixed(2)} in SUI gas (only on successful mints)`);
  console.log('━'.repeat(70));
  console.log('');

  const wallets = Array.from({ length: cfg.wallets }, (_, i) => makeWallet(i));

  console.log(`[step 1/3] Seeding ${wallets.length} test users in DB...`);
  // eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script; PrismaClient needs DATABASE_URL outside the Next.js env-gate.
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL missing from env (expected in apps/web/.env.local).');
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: dbUrl }),
  });
  const seedT0 = Date.now();
  let seeded = 0;
  for (const w of wallets) {
    try {
      await seedTestUser(prisma, w);
      seeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ failed to seed ${w.handle}:`, msg.slice(0, 120));
    }
  }
  console.log(`  → ${seeded}/${wallets.length} users seeded in ${Date.now() - seedT0}ms\n`);

  console.log(`[step 2/3] Firing ${wallets.length} reserves at concurrency=${cfg.concurrency}...`);
  const fireT0 = Date.now();
  const results = await runConcurrent(wallets, cfg.concurrency);
  const fireMs = Date.now() - fireT0;
  console.log(`  → ${wallets.length} requests completed in ${(fireMs / 1000).toFixed(1)}s\n`);

  console.log(`[step 3/3] Writing audit JSON to ${AUDIT_FILE}...`);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const byStatus: Record<number, number> = {};
  const byReason: Record<string, number> = {};
  for (const r of failed) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    if (r.reason) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  }
  const okLatencies = ok.map((r) => r.ms);
  const allLatencies = results.map((r) => r.ms);
  const audit = {
    runTag: RUN_TAG,
    profile: PROFILE,
    target: TARGET,
    startedAt: RUN_STARTED_AT.toISOString(),
    durationMs: Date.now() - t0,
    wallets: cfg.wallets,
    concurrency: cfg.concurrency,
    results,
    summary: {
      total: results.length,
      successful: ok.length,
      failed: failed.length,
      successRate: results.length > 0 ? ok.length / results.length : 0,
      latencyMs: {
        ok: {
          p50: pct(okLatencies, 0.5),
          p95: pct(okLatencies, 0.95),
          p99: pct(okLatencies, 0.99),
          max: Math.max(0, ...okLatencies),
        },
        all: {
          p50: pct(allLatencies, 0.5),
          p95: pct(allLatencies, 0.95),
          p99: pct(allLatencies, 0.99),
          max: Math.max(0, ...allLatencies),
        },
      },
      failedByStatus: byStatus,
      failedByReason: byReason,
      throughput: {
        totalRequests: results.length,
        elapsedSec: fireMs / 1000,
        requestsPerSec: fireMs > 0 ? (results.length / fireMs) * 1000 : 0,
        successfulMintsPerSec: fireMs > 0 ? (ok.length / fireMs) * 1000 : 0,
      },
    },
  };
  writeFileSync(AUDIT_FILE, JSON.stringify(audit, null, 2));

  console.log('');
  console.log('━'.repeat(70));
  console.log('RESULTS');
  console.log('━'.repeat(70));
  console.log(
    `Successful mints:  ${ok.length}/${results.length} (${((ok.length / results.length) * 100).toFixed(1)}%)`,
  );
  console.log(`Failed:            ${failed.length}/${results.length}`);
  if (failed.length > 0) {
    console.log(`  By HTTP status: ${JSON.stringify(byStatus)}`);
    if (Object.keys(byReason).length > 0) {
      console.log(`  By reason:      ${JSON.stringify(byReason)}`);
    }
    console.log(`  Sample errors:`);
    for (const f of failed.slice(0, 5)) {
      console.log(`    ${f.handle}: status=${f.status} error="${(f.error || '').slice(0, 80)}"`);
    }
  }
  console.log('');
  console.log(`Latency (successful mints):`);
  console.log(
    `  p50: ${audit.summary.latencyMs.ok.p50}ms  p95: ${audit.summary.latencyMs.ok.p95}ms  p99: ${audit.summary.latencyMs.ok.p99}ms  max: ${audit.summary.latencyMs.ok.max}ms`,
  );
  console.log(`Throughput:`);
  console.log(`  ${audit.summary.throughput.requestsPerSec.toFixed(2)} req/sec total`);
  console.log(
    `  ${audit.summary.throughput.successfulMintsPerSec.toFixed(2)} successful mints/sec (theoretical Sui ceiling: ~4/sec)`,
  );
  console.log('');
  console.log(`Cost estimate: ~$${(ok.length * 0.008).toFixed(2)} in SUI gas`);
  console.log('');
  console.log(`Cleanup: pnpm tsx apps/web/scripts/loadtest/mint-cleanup.ts ${AUDIT_FILE}`);
  console.log('━'.repeat(70));

  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
