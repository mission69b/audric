#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.7 — rollout regression-gate runner
//
// Pulls TurnMetrics from production Postgres (DATABASE_URL in .env.local)
// and runs the 6 hard-fail gates from `spec/SPEC_8_INTERACTIVE_HARNESS.md`
// § "Acceptance gates" against the rolling production traffic. Compares
// the v2 cohort (rows with `harnessShape IN ('lean','standard','rich','max')`)
// against the legacy cohort (rows with `harnessShape IS NULL OR = 'legacy'`)
// — same Postgres, same time window, real users.
//
// Usage:
//   node scripts/spec8-rollout-gates.mjs                 # 24h window (default)
//   node scripts/spec8-rollout-gates.mjs --hours=72      # custom window
//   node scripts/spec8-rollout-gates.mjs --json          # machine-readable output
//
// Exit codes:
//   0  — all gates PASS, safe to advance the rollout dial
//   1  — at least one HARD FAIL — rollback before advancing further
//   2  — script error (DB unreachable, missing env, etc.)
//
// Hard-fail gates from spec § "Acceptance gates":
//   1. TTFVP p50         > 1500ms
//   2. Final-text p50    > legacy p50 × 1.50 (terseness regression)
//   3. Total cost p50    > legacy p50 × 1.25 (cost regression)
//   4. Total latency p50 > legacy p50 × 1.20 (UX regression)
//   5. LEAN todo_update  > 0   (LEAN must NEVER emit todos)
//   6. LEAN thinking p95 > 1   (LEAN must hold ≤1 thinking block in 95%+)
//   7. RICH recipe-match todo emission rate < 50% (todo discipline)
//
// "Recipe match" = effortLevel='high' rows (audric's classifyEffort
// promotes recipes to `high`). When that mapping changes, update the
// SQL CTE below.
// ───────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { Client } = pg;

// Manual .env.local load — Next.js conventions don't auto-load it for
// plain Node scripts (matches the precedent in
// `run-turn-metrics-baseline.mjs`).
const envPath = new URL('../.env.local', import.meta.url);
if (existsSync(fileURLToPath(envPath))) {
  const envFile = readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

const args = process.argv.slice(2);
const hoursArg = args.find((a) => a.startsWith('--hours='));
const HOURS = hoursArg ? Math.max(1, Number.parseInt(hoursArg.slice(8), 10)) : 24;
const JSON_OUTPUT = args.includes('--json');

if (!process.env.DATABASE_URL) {
  console.error('ERROR — DATABASE_URL not set (looked for it in process.env + .env.local).');
  process.exit(2);
}

// ─── Gate thresholds (verbatim from spec § "Acceptance gates") ─────────
const GATES = {
  ttfvpP50MaxMs: 1500,
  finalTextP50MaxMultiplier: 1.5,
  costP50MaxMultiplier: 1.25,
  latencyP50MaxMultiplier: 1.2,
  leanTodoUpdateMax: 0,
  leanThinkingP95Max: 1,
  richRecipeTodoMinRate: 0.5,
};

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

await client.connect().catch((err) => {
  console.error('ERROR — Postgres connect failed:', err.message);
  process.exit(2);
});

// PostgreSQL doesn't have native percentile_cont in older versions, but
// Neon (>= PG 14) supports it. We use a single CTE-based query so we
// only round-trip once.
const SQL = `
  WITH window_rows AS (
    SELECT *
    FROM "TurnMetrics"
    WHERE "createdAt" >= NOW() - $1::interval
      AND synthetic = false        -- never measure synthetic / load-test traffic
      AND "turnPhase" = 'initial'  -- exclude resume rows (they double-count latency)
  ),
  v2 AS (
    SELECT * FROM window_rows
    WHERE "harnessShape" IN ('lean', 'standard', 'rich', 'max')
  ),
  legacy AS (
    SELECT * FROM window_rows
    WHERE "harnessShape" IS NULL OR "harnessShape" = 'legacy'
  )
  SELECT
    -- Cohort sizes
    (SELECT COUNT(*) FROM v2)                                         AS v2_count,
    (SELECT COUNT(*) FROM legacy)                                     AS legacy_count,

    -- Gate 1 — TTFVP p50 (v2 only)
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "ttfvpMs")
       FROM v2 WHERE "ttfvpMs" IS NOT NULL)                           AS v2_ttfvp_p50_ms,

    -- Gate 2 — Final-text p50 (v2 vs legacy)
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "finalTextTokens")
       FROM v2 WHERE "finalTextTokens" > 0)                           AS v2_final_text_p50,
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "outputTokens")
       FROM legacy WHERE "outputTokens" > 0)                          AS legacy_final_text_p50,

    -- Gate 3 — Total cost p50 (v2 vs legacy)
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "estimatedCostUsd")
       FROM v2)                                                       AS v2_cost_p50,
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "estimatedCostUsd")
       FROM legacy)                                                   AS legacy_cost_p50,

    -- Gate 4 — Total latency p50 (v2 vs legacy)
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "wallTimeMs")
       FROM v2)                                                       AS v2_latency_p50_ms,
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "wallTimeMs")
       FROM legacy)                                                   AS legacy_latency_p50_ms,

    -- Gate 5 — LEAN must NEVER emit todo_update
    (SELECT COUNT(*) FROM v2
       WHERE "harnessShape" = 'lean' AND "todoUpdateCount" > 0)       AS lean_todo_emissions,
    (SELECT COUNT(*) FROM v2 WHERE "harnessShape" = 'lean')           AS lean_total,

    -- Gate 6 — LEAN must hold ≤1 thinking block in 95%+ of turns
    (SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "thinkingBlockCount")
       FROM v2 WHERE "harnessShape" = 'lean')                         AS lean_thinking_p95,

    -- Gate 7 — RICH effort='high' rows must emit ≥1 todo on ≥50% of turns
    (SELECT COUNT(*) FROM v2
       WHERE "harnessShape" = 'rich' AND "todoUpdateCount" >= 1)      AS rich_with_todo,
    (SELECT COUNT(*) FROM v2 WHERE "harnessShape" = 'rich')           AS rich_total,

    -- Telemetry-only signals (logged, not gated)
    (SELECT SUM("evalSummaryViolationsCount") FROM v2)                AS eval_summary_violations,
    (SELECT SUM("interruptedMessageCount") FROM v2)                   AS interrupted_count,
    (SELECT SUM(CASE WHEN "pendingInputSeenOnLegacy" THEN 1 ELSE 0 END)
       FROM v2)                                                       AS pending_input_on_legacy
`;

const interval = `${HOURS} hours`;
const r = await client.query(SQL, [interval]).catch((err) => {
  console.error('ERROR — Postgres query failed:', err.message);
  process.exit(2);
});
await client.end();

const row = r.rows[0];
const num = (v) => (v === null || v === undefined ? null : Number(v));
const v2Count = num(row.v2_count) ?? 0;
const legacyCount = num(row.legacy_count) ?? 0;

// Build the gate evaluations. Each gate carries `pass` (boolean),
// `value` (the measured stat), `threshold` (what would have failed it),
// and `note` (one-line rationale or "skipped — no data").
const gates = [];

const v2TtfvpP50 = num(row.v2_ttfvp_p50_ms);
gates.push({
  id: 1,
  name: 'TTFVP p50 ≤ 1500ms',
  pass: v2Count === 0 ? null : v2TtfvpP50 === null ? null : v2TtfvpP50 <= GATES.ttfvpP50MaxMs,
  value: v2TtfvpP50,
  threshold: GATES.ttfvpP50MaxMs,
  unit: 'ms',
  note:
    v2Count === 0
      ? 'no v2 data — set NEXT_PUBLIC_INTERACTIVE_HARNESS=1 + advance the dial first'
      : v2TtfvpP50 === null
        ? 'no ttfvp samples (every v2 turn errored before yielding)'
        : `v2 cohort: ${v2Count} rows · p50 ${Math.round(v2TtfvpP50)}ms`,
});

const v2FinalP50 = num(row.v2_final_text_p50);
const legacyFinalP50 = num(row.legacy_final_text_p50);
const finalRatio =
  v2FinalP50 !== null && legacyFinalP50 !== null && legacyFinalP50 > 0
    ? v2FinalP50 / legacyFinalP50
    : null;
gates.push({
  id: 2,
  name: `Final-text p50 ≤ legacy × ${GATES.finalTextP50MaxMultiplier}`,
  pass: finalRatio === null ? null : finalRatio <= GATES.finalTextP50MaxMultiplier,
  value: finalRatio,
  threshold: GATES.finalTextP50MaxMultiplier,
  unit: 'ratio',
  note:
    finalRatio === null
      ? 'need both cohorts populated — v2 uses finalTextTokens (text_delta only); legacy uses outputTokens (proxy)'
      : `v2 ${Math.round(v2FinalP50)} tok vs legacy ${Math.round(legacyFinalP50)} tok = ${finalRatio.toFixed(2)}×`,
});

const v2Cost = num(row.v2_cost_p50);
const legacyCost = num(row.legacy_cost_p50);
const costRatio =
  v2Cost !== null && legacyCost !== null && legacyCost > 0 ? v2Cost / legacyCost : null;
gates.push({
  id: 3,
  name: `Total cost p50 ≤ legacy × ${GATES.costP50MaxMultiplier}`,
  pass: costRatio === null ? null : costRatio <= GATES.costP50MaxMultiplier,
  value: costRatio,
  threshold: GATES.costP50MaxMultiplier,
  unit: 'ratio',
  note:
    costRatio === null
      ? 'need both cohorts populated'
      : `v2 $${v2Cost.toFixed(5)} vs legacy $${legacyCost.toFixed(5)} = ${costRatio.toFixed(2)}×`,
});

const v2Latency = num(row.v2_latency_p50_ms);
const legacyLatency = num(row.legacy_latency_p50_ms);
const latencyRatio =
  v2Latency !== null && legacyLatency !== null && legacyLatency > 0
    ? v2Latency / legacyLatency
    : null;
gates.push({
  id: 4,
  name: `Total latency p50 ≤ legacy × ${GATES.latencyP50MaxMultiplier}`,
  pass: latencyRatio === null ? null : latencyRatio <= GATES.latencyP50MaxMultiplier,
  value: latencyRatio,
  threshold: GATES.latencyP50MaxMultiplier,
  unit: 'ratio',
  note:
    latencyRatio === null
      ? 'need both cohorts populated'
      : `v2 ${Math.round(v2Latency)}ms vs legacy ${Math.round(legacyLatency)}ms = ${latencyRatio.toFixed(2)}×`,
});

const leanTodoEmissions = num(row.lean_todo_emissions) ?? 0;
const leanTotal = num(row.lean_total) ?? 0;
gates.push({
  id: 5,
  name: 'LEAN never emits todo_update',
  pass: leanTotal === 0 ? null : leanTodoEmissions <= GATES.leanTodoUpdateMax,
  value: leanTodoEmissions,
  threshold: GATES.leanTodoUpdateMax,
  unit: 'turns',
  note:
    leanTotal === 0
      ? 'no LEAN turns yet'
      : `${leanTodoEmissions}/${leanTotal} LEAN turns emitted a todo (must be 0)`,
});

const leanThinkingP95 = num(row.lean_thinking_p95);
gates.push({
  id: 6,
  name: 'LEAN p95 thinking blocks ≤ 1',
  pass: leanTotal === 0 || leanThinkingP95 === null ? null : leanThinkingP95 <= GATES.leanThinkingP95Max,
  value: leanThinkingP95,
  threshold: GATES.leanThinkingP95Max,
  unit: 'blocks',
  note:
    leanTotal === 0
      ? 'no LEAN turns yet'
      : `${leanTotal} LEAN turns · p95 ${leanThinkingP95?.toFixed(1) ?? '?'} thinking blocks`,
});

const richWithTodo = num(row.rich_with_todo) ?? 0;
const richTotal = num(row.rich_total) ?? 0;
const richTodoRate = richTotal > 0 ? richWithTodo / richTotal : null;
gates.push({
  id: 7,
  name: `RICH todo emission rate ≥ ${(GATES.richRecipeTodoMinRate * 100).toFixed(0)}%`,
  pass: richTodoRate === null ? null : richTodoRate >= GATES.richRecipeTodoMinRate,
  value: richTodoRate,
  threshold: GATES.richRecipeTodoMinRate,
  unit: 'rate',
  note:
    richTodoRate === null
      ? 'no RICH turns yet'
      : `${richWithTodo}/${richTotal} RICH turns emitted a todo = ${(richTodoRate * 100).toFixed(0)}%`,
});

const failedGates = gates.filter((g) => g.pass === false);
const skippedGates = gates.filter((g) => g.pass === null);
const passedGates = gates.filter((g) => g.pass === true);

const summary = {
  windowHours: HOURS,
  v2Count,
  legacyCount,
  passed: passedGates.length,
  failed: failedGates.length,
  skipped: skippedGates.length,
  evalSummaryViolations: num(row.eval_summary_violations) ?? 0,
  interruptedCount: num(row.interrupted_count) ?? 0,
  pendingInputOnLegacy: num(row.pending_input_on_legacy) ?? 0,
};

if (JSON_OUTPUT) {
  console.log(
    JSON.stringify(
      {
        summary,
        gates,
      },
      null,
      2,
    ),
  );
} else {
  const banner = '─'.repeat(70);
  console.log(banner);
  console.log(`SPEC 8 rollout gates · last ${HOURS}h · ${new Date().toISOString()}`);
  console.log(banner);
  console.log(
    `Cohort sizes: v2=${v2Count}  legacy=${legacyCount}  total=${v2Count + legacyCount}`,
  );
  console.log('');
  for (const g of gates) {
    const flag = g.pass === true ? 'PASS' : g.pass === false ? 'FAIL' : 'SKIP';
    const pad = `[${flag}]`.padEnd(7);
    console.log(`${pad} Gate ${g.id} · ${g.name}`);
    console.log(`        ${g.note}`);
  }
  console.log('');
  console.log('Telemetry signals (informational, not gated):');
  console.log(
    `  eval_summary_violations:   ${summary.evalSummaryViolations} (LLM emitted ≥2 markers; should be ~0 in steady state)`,
  );
  console.log(
    `  interrupted_messages:      ${summary.interruptedCount} (>1% of v2 = rollback signal)`,
  );
  console.log(
    `  pending_input_on_legacy:   ${summary.pendingInputOnLegacy} (must be 0 — session-pinning regression if non-zero)`,
  );
  console.log('');
  if (failedGates.length > 0) {
    console.log(`❌ ${failedGates.length} HARD FAIL gate(s) breached. ROLLBACK before advancing.`);
  } else if (skippedGates.length === gates.length) {
    console.log(
      'ℹ️  No data in v2 cohort yet. Set NEXT_PUBLIC_INTERACTIVE_HARNESS=1 + advance the dial.',
    );
  } else {
    console.log(`✅ All ${passedGates.length} active gates passed. Safe to advance the dial.`);
  }
  console.log(banner);
}

process.exit(failedGates.length > 0 ? 1 : 0);
