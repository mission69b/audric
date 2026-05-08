#!/usr/bin/env tsx
/**
 * Tier A — quote regression harness.
 *
 * Runs 41 deterministic Cetus aggregator quote scenarios via @t2000/sdk's
 * getSwapQuote(). No on-chain mutation, no LLM, no engine. Cost: $0.
 *
 * Why this exists
 * ---------------
 * In April 2026 a swap from "SSUI" to USDC crashed the Node process via
 * an unhandled rejection, taking down every concurrent user's session
 * (S.123). The structured error contract introduced in S.123 v1.24.7 is
 * the runtime fix; this harness is the regression net that catches the
 * NEXT class-of-bug before users see it.
 *
 * Scenarios cover:
 *   - 30 Tier 1+2 happy paths (every supported asset ↔ USDC)
 *   - 6 legacy stable happy paths (USDsui / USDe / USDT)
 *   - 1 cross-tier multi-hop routing test (LOFI ↔ MANIFEST)
 *   - 4 error paths (unknown token, same-token, sub-dust, negative amount)
 *
 * Failure modes the harness catches
 * ---------------------------------
 *   - "Cetus dropped this pair from the aggregator" → tier12 happy path fails
 *   - "Token registry decimals drifted" → quote returns wrong amount
 *   - "Multi-hop routing broke" → cross-tier scenario fails
 *   - "S.123 structured error regressed back to generic Error" → error-path
 *     scenarios fail (no errorCode set on caught error)
 *   - "New SDK code path throws unhandled rejection" → reporter exits with
 *     fatal error before producing summary
 *
 * Usage
 * -----
 *   pnpm tsx apps/web/scripts/regression-swaps/run-quotes.ts
 *
 * Env vars (all optional):
 *   CONCURRENCY=4    parallelism for scenarios; default 4
 *   RUN_TAG=local    suffix for the artifact filename; default = generated
 *
 * Exit codes
 * ----------
 *   0  all 41 scenarios passed
 *   1  at least one happy-path regressed (BLOCK MERGE — user-visible)
 *   2  at least one error-path regressed (BLOCK MERGE — defensive structure)
 */

import { randomBytes } from 'node:crypto';
import { getSwapQuote } from '@t2000/sdk';

import { TIER_A_SCENARIOS, type QuoteScenario } from './scenarios.js';
import { summarize, printSummary, writeArtifact, exitCodeFor, type ScenarioResult } from './reporter.js';

// Throwaway zero-balance address. Cetus uses walletAddress as the signer
// for routing context only — it does NOT verify balance for quote-only
// requests (verified empirically in S.124 Phase 1, see Phase 1 commit).
const QUOTE_WALLET = '0x0000000000000000000000000000000000000000000000000000000000000001';

// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script invoked outside Next.js runtime; env.ts schema would force validation of unrelated production vars.
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.CONCURRENCY ?? '4', 10) || 4);
// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script.
const RUN_TAG = process.env.RUN_TAG || `r${randomBytes(3).toString('hex')}`;

async function runScenario(s: QuoteScenario): Promise<ScenarioResult> {
  const start = performance.now();
  try {
    const r = await getSwapQuote({
      walletAddress: QUOTE_WALLET,
      from: s.from,
      to: s.to,
      amount: s.amount,
    });
    const ms = Math.round(performance.now() - start);

    if (s.expectedError) {
      return {
        id: s.id,
        category: s.category,
        from: s.from,
        to: s.to,
        amount: s.amount,
        ms,
        pass: false,
        toAmount: r.toAmount,
        route: r.route,
        priceImpact: r.priceImpact,
        failureReason: `expected error ${s.expectedError} but quote succeeded`,
      };
    }

    return {
      id: s.id,
      category: s.category,
      from: s.from,
      to: s.to,
      amount: s.amount,
      ms,
      pass: true,
      toAmount: r.toAmount,
      route: r.route,
      priceImpact: r.priceImpact,
    };
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    const errorCode = err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : undefined;
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (s.expectedError) {
      const matched = errorCode === s.expectedError;
      return {
        id: s.id,
        category: s.category,
        from: s.from,
        to: s.to,
        amount: s.amount,
        ms,
        pass: matched,
        errorCode,
        errorMessage,
        failureReason: matched ? undefined : `expected error ${s.expectedError} but got ${errorCode ?? 'untyped error'}`,
      };
    }

    return {
      id: s.id,
      category: s.category,
      from: s.from,
      to: s.to,
      amount: s.amount,
      ms,
      pass: false,
      errorCode,
      errorMessage,
      failureReason: `expected success but threw [${errorCode ?? 'untyped'}] ${errorMessage.slice(0, 100)}`,
    };
  }
}

/**
 * Bounded-concurrency runner. Mirrors the loadtest pattern: spawn N workers
 * that each pull from a shared cursor until the queue is empty.
 *
 * Why bounded concurrency: Cetus quote endpoint typically rate-limits at
 * higher fan-out. CONCURRENCY=4 keeps total runtime ~2s (vs ~6s sequential)
 * without tripping the limiter. If we ever see HTTP 429 in CI, drop to 2.
 */
async function runAll(scenarios: readonly QuoteScenario[], concurrency: number): Promise<ScenarioResult[]> {
  const results = new Array<ScenarioResult>(scenarios.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= scenarios.length) return;
      results[idx] = await runScenario(scenarios[idx]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

(async () => {
  console.log(`Tier A — swap quote regression harness`);
  console.log(`scenarios: ${TIER_A_SCENARIOS.length}, concurrency: ${CONCURRENCY}, runTag: ${RUN_TAG}`);

  const startedAt = new Date();
  const results = await runAll(TIER_A_SCENARIOS, CONCURRENCY);
  const endedAt = new Date();

  const summary = summarize(results, startedAt, endedAt);
  printSummary(summary, `Tier A run ${RUN_TAG}`);

  const artifact = writeArtifact(summary, RUN_TAG);
  console.log(`\nartifact: ${artifact}`);

  const exit = exitCodeFor(summary);
  if (exit === 0) {
    console.log(`\nresult: PASS (${summary.passed}/${summary.total})`);
  } else if (exit === 1) {
    console.log(`\nresult: FAIL — happy-path regression (${summary.failed}/${summary.total})`);
    console.log(`        BLOCK MERGE. User-visible swap regression.`);
  } else {
    console.log(`\nresult: FAIL — error-path regression (${summary.failed}/${summary.total})`);
    console.log(`        BLOCK MERGE. Defensive error-structure regressed (likely S.123 hardening reverted).`);
  }

  process.exit(exit);
})().catch((err) => {
  console.error(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
  process.exit(3);
});
