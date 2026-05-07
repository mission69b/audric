/* eslint-disable */
/**
 * k6 cache-effectiveness benchmark — /api/identity/check
 *
 * Runs UNDER the per-IP rate limit (30 req/60s) so we can measure the
 * end-to-end check latency cleanly. Three phases:
 *
 *   1. COLD START — first request for a never-seen handle. Pays for
 *      the SuiNS RPC round-trip + Lambda spin-up if cold. This is the
 *      worst-case latency.
 *
 *   2. WARM CACHE — same handle, repeated. After the first request,
 *      the handle's resolution is in Upstash (S18-F12). Subsequent
 *      requests should be ~5-15ms server-side (Postgres unique check
 *      + Upstash GET). Round-trip from your machine adds whatever your
 *      latency to Vercel is (~80-300ms typical).
 *
 *   3. CROSS-LAMBDA — sleep long enough for the original Lambda to
 *      cool, then re-hit. Cold container should hit the WARM Upstash
 *      entry (no RPC) — confirms the S18-F12 cross-fleet sharing works
 *      as designed (vs. the pre-S18-F12 per-Lambda cache where each
 *      cold container would re-RPC).
 *
 * Real-world interpretation
 * -------------------------
 * For a 100-1000 user burst with each user from their own IP:
 *   - Each user does ~3 check requests
 *   - Per-IP rate limiter (30/60s) is NEVER triggered (3 << 30)
 *   - Cross-user cache hit rate depends on handle distribution:
 *     * 70% popular handles (cached after first user) → ~70% cache hit
 *     * 30% unique handles (cache miss → RPC each)
 *   - At peak ~10 unique-handle RPCs/sec, well under BlockVision's
 *     ~30 req/s/key ceiling
 *
 * Usage
 * -----
 *   AUDRIC_BASE_URL=https://audric.ai k6 run scripts/loadtest/identity-check-cache-bench.k6.js
 */

import http from 'k6/http';
import { sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.AUDRIC_BASE_URL || 'http://localhost:3000';

const coldLatency = new Trend('cold_start_latency_ms', true);
const warmLatency = new Trend('warm_cache_latency_ms', true);
const crossLambdaLatency = new Trend('cross_lambda_latency_ms', true);

export const options = {
  scenarios: {
    cache_bench: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '5m',
    },
  },
};

function checkOnce(handle) {
  const url = `${BASE}/api/identity/check?username=${encodeURIComponent(handle)}`;
  const start = Date.now();
  const res = http.get(url, {
    headers: { 'user-agent': 'k6-cache-bench/audric-identity-check' },
  });
  const elapsed = Date.now() - start;
  if (res.status !== 200) {
    console.warn(`[cache-bench] non-200 for ${handle}: ${res.status} body=${res.body.slice(0, 80)}`);
  }
  return { elapsed, status: res.status, body: res.body };
}

export default function () {
  const handle = `lt-bench-${Date.now()}`;

  console.log(`\n═══ Phase 1: COLD START — ${handle} ═══`);
  const cold = checkOnce(handle);
  coldLatency.add(cold.elapsed);
  console.log(`  cold-start latency: ${cold.elapsed}ms  status=${cold.status}`);

  sleep(0.5);

  console.log(`\n═══ Phase 2: WARM CACHE — same ${handle}, 10 repeats ═══`);
  const warm = [];
  for (let i = 0; i < 10; i++) {
    const r = checkOnce(handle);
    warmLatency.add(r.elapsed);
    warm.push(r.elapsed);
    sleep(0.3);
  }
  const warmMedian = [...warm].sort((a, b) => a - b)[Math.floor(warm.length / 2)];
  const warmMin = Math.min(...warm);
  const warmMax = Math.max(...warm);
  console.log(`  warm cache (10 reqs): min=${warmMin}ms  median=${warmMedian}ms  max=${warmMax}ms`);

  console.log(`\n═══ Phase 3: CROSS-LAMBDA (60s sleep, hope for cold container hit) ═══`);
  console.log(`  sleeping 60s to let the Lambda cool...`);
  sleep(60);
  const crossLambda = checkOnce(handle);
  crossLambdaLatency.add(crossLambda.elapsed);
  console.log(`  cross-lambda latency: ${crossLambda.elapsed}ms  status=${crossLambda.status}`);
  console.log(`  (if this is close to Phase 2 warm latency, S18-F12 Upstash sharing works.`);
  console.log(`   if it's close to Phase 1 cold latency, the cache isn't fleet-shared.)`);

  console.log(`\n═══ Summary ═══`);
  console.log(`  Cold start (full RPC):       ${cold.elapsed}ms`);
  console.log(`  Warm cache median (10x):     ${warmMedian}ms`);
  console.log(`  Cross-lambda (60s gap):      ${crossLambda.elapsed}ms`);
  const cacheBenefit = cold.elapsed - warmMedian;
  const crossLambdaBenefit = cold.elapsed - crossLambda.elapsed;
  console.log(`  Cache benefit (cold→warm):   ${cacheBenefit}ms (~${Math.round((cacheBenefit / cold.elapsed) * 100)}% reduction)`);
  console.log(`  Cross-lambda benefit:        ${crossLambdaBenefit}ms (~${Math.round((crossLambdaBenefit / cold.elapsed) * 100)}% reduction)`);
}
