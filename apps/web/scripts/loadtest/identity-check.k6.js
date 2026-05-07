/* eslint-disable */
/**
 * k6 load test — /api/identity/check
 *
 * What this validates
 * -------------------
 * The READ-SIDE half of the username claim flow at burst scale. Under load,
 * a 100-1000 user signup wave produces:
 *   - ~3 picker `/api/identity/check` calls per user (debounce 300ms while
 *     typing) — total ~300-3000 GETs
 *   - 1 `/api/identity/reserve` call per claimed handle (the WRITE half,
 *     which can't be safely load-tested without burning gas — see comment
 *     at the bottom of this file)
 *
 * This script saturates the read side. Failure modes it surfaces:
 *   - SuiNS RPC ceiling (BlockVision Pro endpoint, ~30 req/s/key)
 *   - Postgres connection pool exhaustion under concurrent unique-checks
 *   - Vercel Lambda cold-start cliff under spike concurrency
 *   - Per-IP rate limiter (30/60s) — confirms the ceiling triggers cleanly
 *   - Upstash SuiNS cache hit rate (S18-F12) under realistic distribution
 *
 * Failure modes it does NOT cover (see "Mint contention" comment below):
 *   - Audric registry shared-object contention (real mints required)
 *   - Enoki sponsorship rate limit (no sponsorship in this path)
 *   - Anthropic API limits (no chat in this path)
 *
 * Usage
 * -----
 *   # Baseline — 10 VUs ramping to 50 over 30s (under per-IP rate limit)
 *   AUDRIC_BASE_URL=https://audric.ai k6 run scripts/loadtest/identity-check.k6.js
 *
 *   # Burst — 100 VUs ramping to 200 over 60s (will hit per-IP rate limit;
 *   # measures the ceiling cleanly)
 *   AUDRIC_BASE_URL=https://audric.ai LOAD_PROFILE=burst k6 run scripts/loadtest/identity-check.k6.js
 *
 *   # Local dev — 5 VUs ramping to 10 over 10s (sanity check before remote)
 *   AUDRIC_BASE_URL=http://localhost:3000 LOAD_PROFILE=local k6 run scripts/loadtest/identity-check.k6.js
 *
 * Env vars
 * --------
 *   AUDRIC_BASE_URL   — required. The audric web origin (no trailing slash).
 *   LOAD_PROFILE      — optional. baseline (default) | burst | local | warm.
 *
 * Output
 * ------
 *   Standard k6 summary (p50/p95/p99 latency, error rate, RPS) plus three
 *   custom metrics:
 *     - check_cache_hit_rate — fraction of responses that came back fast
 *       enough to imply a SuiNS cache hit (response in ≤ 100ms)
 *     - check_rate_limited_rate — fraction of responses that were 429s
 *     - check_rpc_error_rate — fraction of responses that were 503s (SuiNS
 *       RPC degraded)
 *
 * Interpretation guide for the founder
 * ------------------------------------
 *   - p95 < 300ms → fine for picker UX
 *   - p95 < 800ms → tolerable
 *   - p95 > 1500ms → users see "Checking…" pause noticeably
 *   - error_rate > 1% → infra ceiling reached, investigate
 *   - cache_hit_rate > 70% under repeat-handle load → S18-F12 working
 *   - rate_limited_rate climbs predictably with concurrency → limiter healthy
 */

import http from 'k6/http';
import { sleep, check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const BASE = __ENV.AUDRIC_BASE_URL || 'http://localhost:3000';
const PROFILE = __ENV.LOAD_PROFILE || 'baseline';

// Custom metrics
const checkLatency = new Trend('check_latency_ms', true);
const cacheHitRate = new Rate('check_cache_hit_rate');
const rateLimitedRate = new Rate('check_rate_limited_rate');
const rpcErrorRate = new Rate('check_rpc_error_rate');
const availableCount = new Counter('check_available_count');
const takenCount = new Counter('check_taken_count');

// Realistic handle distribution: mix of repeat-popular (drives cache hits)
// + unique-per-VU (drives cache misses + RPC). Same shape as a real signup
// wave where some handles get probed by many users (squat-magnets, brand
// names) and others are user-specific.
const POPULAR_HANDLES = [
  'alice', 'bob', 'admin', 'satoshi', 'crypto', 'defi', 'gold',
  'audric', 'sui', 'wallet', 'pay', 'save',
];

function uniqueHandle(vuId, iter) {
  // Random-ish per-VU handle. The leading "lt" prefix marks load-test
  // traffic in the audric logs (`[identity-check]` JSON entries) so the
  // founder can filter them out post-run.
  const r = (vuId * 7919 + iter * 31) % 100000;
  return `lt${r.toString(36)}`;
}

function pickHandle(vuId, iter) {
  // 70% popular (cache hit after warm-up), 30% unique (cache miss → RPC).
  // Mirrors the empirical claim distribution where a few squat-magnet
  // handles get hammered while most signups go for unique names.
  const rand = (vuId * 13 + iter * 17) % 10;
  return rand < 7
    ? POPULAR_HANDLES[(vuId + iter) % POPULAR_HANDLES.length]
    : uniqueHandle(vuId, iter);
}

const PROFILES = {
  // Sanity check before hitting prod — quick local smoke
  local: {
    stages: [
      { duration: '5s', target: 5 },
      { duration: '10s', target: 10 },
      { duration: '5s', target: 0 },
    ],
    sleepRange: [0.3, 0.8],
  },
  // Steady warm-up — 30 VUs, no per-IP rate-limit triggering
  warm: {
    stages: [
      { duration: '15s', target: 10 },
      { duration: '60s', target: 30 },
      { duration: '15s', target: 0 },
    ],
    sleepRange: [0.5, 1.5],
  },
  // Realistic onboarding wave — 50 VUs over 30s, sustained 60s
  baseline: {
    stages: [
      { duration: '15s', target: 20 },
      { duration: '30s', target: 50 },
      { duration: '60s', target: 50 },
      { duration: '15s', target: 0 },
    ],
    sleepRange: [0.3, 0.8],
  },
  // Burst — 100→200 VUs to find the cliff. WILL hit per-IP rate limit
  // (30/60s) since k6 from one host = one IP. Use this to measure the
  // ceiling, NOT to validate UX. Use distributed k6 for realistic
  // multi-IP testing.
  burst: {
    stages: [
      { duration: '15s', target: 50 },
      { duration: '30s', target: 100 },
      { duration: '60s', target: 200 },
      { duration: '30s', target: 200 },
      { duration: '15s', target: 0 },
    ],
    sleepRange: [0.1, 0.4],
  },
};

const profile = PROFILES[PROFILE] || PROFILES.baseline;

export const options = {
  stages: profile.stages,
  thresholds: {
    // Soft thresholds — we WANT to see the cliff, not abort on it.
    'check_latency_ms': ['p(95)<1500'],
    'check_rpc_error_rate': ['rate<0.05'], // < 5% RPC degradation acceptable
    // Note: NOT thresholding on rate_limited_rate — under burst profile we
    // EXPECT this to climb (that's the point of burst mode).
  },
};

export default function () {
  const vu = __VU;
  const iter = __ITER;

  group('check', () => {
    const handle = pickHandle(vu, iter);
    const url = `${BASE}/api/identity/check?username=${encodeURIComponent(handle)}`;
    const start = Date.now();
    const res = http.get(url, {
      tags: { endpoint: '/api/identity/check' },
      headers: { 'user-agent': 'k6-loadtest/audric-identity-check' },
    });
    const latency = Date.now() - start;
    checkLatency.add(latency);

    if (res.status === 429) {
      rateLimitedRate.add(true);
      return;
    }
    rateLimitedRate.add(false);

    if (res.status === 503) {
      rpcErrorRate.add(true);
      return;
    }
    rpcErrorRate.add(false);

    // Cache-hit heuristic: anything under 100ms implies the SuiNS RPC
    // didn't run (cache hit + fast DB unique check). Over 100ms means
    // we paid for a real RPC round-trip. Tunable; 100ms is a reasonable
    // threshold for the BlockVision Sui RPC at audric.ai's hosting region.
    cacheHitRate.add(latency < 100);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'has json body': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });

    if (res.status === 200) {
      try {
        const body = JSON.parse(res.body);
        if (body.available === true) availableCount.add(1);
        else if (body.reason === 'taken') takenCount.add(1);
      } catch {}
    }
  });

  // Sleep simulates picker debounce — real users type for 1-2s before
  // the picker fires the next check. k6's `sleep()` is per-VU so each
  // VU's pacing is independent.
  const [lo, hi] = profile.sleepRange;
  sleep(lo + Math.random() * (hi - lo));
}

// ---------------------------------------------------------------------------
// Mint contention is NOT covered by this script
// ---------------------------------------------------------------------------
//
// /api/identity/reserve mints a real on-chain SuiNS leaf via
// signAndExecuteTransaction. Each mint costs ~0.0032 SUI in gas paid by
// the audric custody address. Load-testing the WRITE side at 100+
// concurrency would:
//   - Burn ~0.32 SUI / 100 mints (~$1 in gas)
//   - Permanently pollute the audric registry with `lt0`, `lt1`, …
//     load-test handles unless explicitly revoked after
//   - Produce real "shared-object stale-version" contention against the
//     audric registry singleton — which is the ONE bottleneck this
//     script can't validate from the outside
//
// To safely load-test mint contention, see the spec stub at
// `spec/SPEC_MINT_LOAD_TEST.md` (TODO if founder approves the
// ~$0.50–$2 mainnet test budget). Two safer alternatives:
//
//   1. Server-side claim queue (Option A in the readiness writeup) —
//      makes mint contention DETERMINISTIC instead of probabilistic;
//      removes the question entirely.
//
//   2. Pre-mint pool (Option B) — background process pre-mints the
//      Audric registry's leaves into a custody pool; user "claim" is a
//      pool-pop + ownership transfer, no live mint. Eliminates contention.
//
// For "100-1000 users today in bursts" without either Option A or B,
// the empirical answer from S18-F6's retry budget (3 attempts × backoff
// covers ~20 simultaneous mints; degrades above) is the best signal we
// have without spending mainnet gas on a synthetic test.
