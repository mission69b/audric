/**
 * Reporter — turns scenario results into:
 *   1. Human-readable console summary (passes/fails per category, p50/p95)
 *   2. JSON artifact written to scripts/regression-swaps/runs/ for trend
 *      analysis + Discord webhook payloads
 *   3. Process exit code (0 = clean, 1 = any happy-path regressed,
 *      2 = expected-error scenario regressed)
 *
 * Exit-code split is deliberate. CI surfaces happy-path regressions as
 * "swap broke for users" and error-path regressions as "our defensive
 * structure broke" — different blast radius, different on-call response.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ScenarioResult {
  id: string;
  category: 'tier12' | 'legacy' | 'cross-tier' | 'error';
  from: string;
  to: string;
  amount: number;
  ms: number;
  /** True if the scenario behaved as expected (success when expected, error when expected). */
  pass: boolean;
  /** Output amount when scenario succeeded. */
  toAmount?: number;
  /** Cetus route description when scenario succeeded. */
  route?: string;
  /** Price impact when scenario succeeded. */
  priceImpact?: number;
  /** T2000Error.code when scenario threw. */
  errorCode?: string;
  /** Error message when scenario threw. */
  errorMessage?: string;
  /** Reason the scenario failed (set only when pass=false). */
  failureReason?: string;
}

export interface RunSummary {
  startedAt: string;
  endedAt: string;
  durationMs: number;
  total: number;
  passed: number;
  failed: number;
  byCategory: Record<string, { total: number; passed: number; failed: number }>;
  latency: { p50: number; p95: number; max: number };
  failures: ScenarioResult[];
  results: ScenarioResult[];
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function summarize(results: ScenarioResult[], startedAt: Date, endedAt: Date): RunSummary {
  const byCategory: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const r of results) {
    byCategory[r.category] ??= { total: 0, passed: 0, failed: 0 };
    byCategory[r.category].total += 1;
    if (r.pass) byCategory[r.category].passed += 1;
    else byCategory[r.category].failed += 1;
  }

  const latencies = results.map((r) => r.ms);
  return {
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    total: results.length,
    passed: results.filter((r) => r.pass).length,
    failed: results.filter((r) => !r.pass).length,
    byCategory,
    latency: {
      p50: pct(latencies, 0.5),
      p95: pct(latencies, 0.95),
      max: Math.max(0, ...latencies),
    },
    failures: results.filter((r) => !r.pass),
    results,
  };
}

export function printSummary(summary: RunSummary, label: string): void {
  console.log(`\n=== ${label} ===`);
  console.log(`${summary.passed}/${summary.total} passed in ${summary.durationMs}ms`);
  console.log(`latency p50=${summary.latency.p50}ms p95=${summary.latency.p95}ms max=${summary.latency.max}ms`);

  console.log(`\nby category:`);
  for (const [cat, stats] of Object.entries(summary.byCategory)) {
    const status = stats.failed === 0 ? 'OK' : 'FAIL';
    console.log(`  [${status}] ${cat.padEnd(12)} ${stats.passed}/${stats.total}`);
  }

  if (summary.failures.length > 0) {
    console.log(`\nfailures:`);
    for (const f of summary.failures) {
      console.log(`  - ${f.id}`);
      console.log(`      ${f.from} → ${f.to} @ ${f.amount}`);
      console.log(`      reason: ${f.failureReason}`);
      if (f.errorCode) console.log(`      errorCode: ${f.errorCode}`);
      if (f.errorMessage) console.log(`      errorMessage: ${f.errorMessage.slice(0, 120)}`);
    }
  }
}

export function writeArtifact(summary: RunSummary, runTag: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const runsDir = join(here, 'runs');
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });

  const stamp = summary.startedAt.replace(/[:.]/g, '-');
  const file = join(runsDir, `swap-regression-${stamp}-${runTag}.json`);
  writeFileSync(file, JSON.stringify(summary, null, 2));
  return file;
}

/**
 * Exit code classifier.
 *   0 = all scenarios passed (CI clean, merge unblocked)
 *   1 = at least one happy-path failed (user-visible regression — block merge)
 *   2 = at least one error-path failed (defensive structure regressed — block merge,
 *       lower-severity Discord ping)
 *
 * Both 1 and 2 fail CI. Distinction is for on-call response priority.
 */
export function exitCodeFor(summary: RunSummary): number {
  if (summary.failed === 0) return 0;
  const happyFailed = summary.failures.some((f) => f.category !== 'error');
  if (happyFailed) return 1;
  return 2;
}
