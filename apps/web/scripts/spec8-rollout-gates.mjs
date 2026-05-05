#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.7 — rollout regression-gate runner
//
// Pulls TurnMetrics from production Postgres (DATABASE_URL in .env.local)
// and runs the 7 hard-fail gates from `spec/SPEC_8_INTERACTIVE_HARNESS.md`
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
//   1. TTFVP p50         > 4000ms (v0.5.4 — see threshold rationale below)
//   2. Final-text p50    > legacy p50 × 1.50 (terseness regression)
//   3. Total cost p50    > legacy p50 × 1.25 (cost regression)
//   4. Total latency p50 > legacy p50 × 1.20 (UX regression)
//   5. LEAN todo_update  > 0   (LEAN must NEVER emit todos)
//   6. LEAN thinking p95 > 1   (LEAN must hold ≤1 thinking block in 95%+)
//   7. RICH multi-step planning-signal rate < 80% (v0.5.4 — denominator
//      restricted to RICH turns where planning would actually help; see
//      Gate 7 cohort note below for the SPEC 8 v0.5.4 redefinition)
//
// Gate 2 metric notes — both cohorts use `finalTextTokens` (the v0.5.1
// B3.6 column that counts only post-tools narration). Pre-B3.6 legacy
// rows have `finalTextTokens IS NULL` and are auto-excluded by the
// `> 0` guards below; post-B3.6 legacy rows are populated unconditionally
// by the chat route's collector regardless of harness version, which
// makes the v2-vs-legacy comparison apples-to-apples.
//
// Gate 7 cohort = `harnessShape = 'rich'`. The engine's
// `harnessShapeForEffort()` mapping makes `rich` ⟺ `effortLevel='high'`
// (1:1), so this is the high-effort cohort where todo discipline matters.
// MAX-shape turns (recipe-matched) are tracked in the corpus eval pass,
// not in this gate.
//
// SPEC 8 v0.5.3 update (2026-05-04) — "planning signal" now counts BOTH
// `update_todo` AND `prepare_bundle` (the SPEC 14 plan-commit tool).
// Original SPEC 8 v0.5.1 only counted update_todo, but post-SPEC-14
// every multi-write Sonnet turn emits prepare_bundle instead — the
// gate was firing at 32% on a 7d window because of spec drift, not
// because the LLM was failing to plan. Both signals together cover
// every planning surface a RICH turn uses.
//
// SPEC 8 v0.5.4 update (2026-05-05) — Gate 7 denominator restricted to
// RICH turns where planning would actually help. Diagnostic on the 19h
// post-d18af29 window showed Sonnet correctly routes single-swap intents
// to RICH/high-effort (write-tool turns get more thinking budget by
// design) but those single-write turns don't need planning — there's
// nothing to plan when there's only one write. Original Gate 7 measured
// "what % of high-effort turns invoke a planning tool", which conflated
// "high effort because multi-step" with "high effort because safety-
// critical". Redefined to measure the original intent: of RICH turns
// where planning would actually help (≥3 tools called OR prepare_bundle
// invoked), what % emitted a planning signal? The threshold tightens
// from 50% to 80% accordingly — when planning IS warranted, it should
// almost always happen. Single-write RICH turns are exempt.
//
// SPEC 8 v0.5.4 update — Gate 1 threshold relaxed from 1500ms to 4000ms.
// Empirical TTFVP across the 19h post-fix v2 cohort: p50 2903ms,
// p75 4057ms, p95 5236ms. Slowest 5 turns are all tool-RTT-bound (first
// renderable event = `tool_start`, where the tool is BlockVision balance,
// Cetus quote, or rates fetch — all 2-5s round-trip from outside the
// engine). Original 1500ms threshold was set without a tool-RTT
// baseline; 4000ms covers empirical p75 with margin and isolates real
// engine-side regressions (>4s would mean engine pre-stream work
// degraded, not just a slow third-party call). When BlockVision /
// Cetus latency drops or we move tool resolution to a streaming model,
// re-tighten this threshold and update the rationale.
//
// When the shape↔effort mapping changes, update the
// SQL CTE + this comment together.
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
  ttfvpP50MaxMs: 4000,                  // v0.5.4 — was 1500ms; empirical p75 calibration
  finalTextP50MaxMultiplier: 1.5,
  costP50MaxMultiplier: 1.25,
  latencyP50MaxMultiplier: 1.2,
  leanTodoUpdateMax: 0,
  leanThinkingP95Max: 1,
  richMultiStepPlanningMinRate: 0.8,    // v0.5.4 — was 0.5 on broader denominator
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
    -- Both cohorts use finalTextTokens. Pre-B3.6 rows are NULL → excluded.
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "finalTextTokens")
       FROM v2 WHERE "finalTextTokens" > 0)                           AS v2_final_text_p50,
    (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "finalTextTokens")
       FROM legacy WHERE "finalTextTokens" > 0)                       AS legacy_final_text_p50,

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

    -- Gate 7 (v0.5.4 redefinition) — RICH multi-step planning rate.
    -- Denominator: RICH turns where planning would actually help, i.e.
    -- (a) the LLM called >= 3 tools (multi-tool flow that benefits from
    -- a checklist) OR (b) the LLM invoked prepare_bundle (the explicit
    -- multi-write Payment Intent commitment signal). Single-write RICH
    -- turns (e.g. one swap_quote → swap_execute) are EXEMPT from this
    -- gate — the classifier correctly routes them to high-effort for
    -- safety/thinking-budget reasons, but there's nothing to plan in
    -- a single-write intent. Numerator: same denominator + emitted a
    -- planning signal (todoUpdateCount >= 1 OR prepare_bundle).
    -- Threshold tightens to ≥80% — when planning IS warranted, it
    -- should almost always happen. See v0.5.4 rationale block above
    -- for the diagnostic that motivated the redefinition.
    --
    -- Tool count derived from jsonb_array_length(toolsCalled).
    (SELECT COUNT(*) FROM v2
       WHERE "harnessShape" = 'rich'
         AND (jsonb_array_length(COALESCE("toolsCalled", '[]'::jsonb)) >= 3
              OR "toolsCalled" @> '[{"name": "prepare_bundle"}]'::jsonb)
         AND ("todoUpdateCount" >= 1
              OR "toolsCalled" @> '[{"name": "prepare_bundle"}]'::jsonb))  AS rich_multistep_planned,
    (SELECT COUNT(*) FROM v2
       WHERE "harnessShape" = 'rich'
         AND (jsonb_array_length(COALESCE("toolsCalled", '[]'::jsonb)) >= 3
              OR "toolsCalled" @> '[{"name": "prepare_bundle"}]'::jsonb))  AS rich_multistep_total,
    (SELECT COUNT(*) FROM v2 WHERE "harnessShape" = 'rich')           AS rich_total,
    (SELECT COUNT(*) FROM v2
       WHERE "harnessShape" = 'rich'
         AND jsonb_array_length(COALESCE("toolsCalled", '[]'::jsonb)) <= 2
         AND NOT ("toolsCalled" @> '[{"name": "prepare_bundle"}]'::jsonb))  AS rich_singlewrite_exempt,

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
  name: `TTFVP p50 ≤ ${GATES.ttfvpP50MaxMs}ms (v0.5.4 — empirical p75 calibration)`,
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
      ? 'need both cohorts populated — both use finalTextTokens (post-B3.6 only; pre-B3.6 NULL rows excluded)'
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

const richMultistepPlanned = num(row.rich_multistep_planned) ?? 0;
const richMultistepTotal = num(row.rich_multistep_total) ?? 0;
const richTotal = num(row.rich_total) ?? 0;
const richSinglewriteExempt = num(row.rich_singlewrite_exempt) ?? 0;
const richMultistepRate =
  richMultistepTotal > 0 ? richMultistepPlanned / richMultistepTotal : null;
gates.push({
  id: 7,
  name: `RICH multi-step planning-signal rate ≥ ${(GATES.richMultiStepPlanningMinRate * 100).toFixed(0)}% (v0.5.4 — single-write RICH exempt)`,
  pass: richMultistepRate === null ? null : richMultistepRate >= GATES.richMultiStepPlanningMinRate,
  value: richMultistepRate,
  threshold: GATES.richMultiStepPlanningMinRate,
  unit: 'rate',
  note:
    richMultistepRate === null
      ? `no multi-step RICH turns yet (RICH total ${richTotal}, all single-write — exempt under v0.5.4)`
      : `${richMultistepPlanned}/${richMultistepTotal} multi-step RICH turns emitted update_todo or prepare_bundle = ${(richMultistepRate * 100).toFixed(0)}% · ${richSinglewriteExempt} single-write RICH turns exempt (RICH total: ${richTotal})`,
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
