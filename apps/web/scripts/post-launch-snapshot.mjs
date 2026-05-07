#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Post-launch snapshot — one-shot read across the showcase window.
//
// Pulls user signups + TurnMetrics outcomes + cost rollup so we can pair the
// SPEC 8 acceptance gates with a "did the burst behave?" view.
//
// Usage:
//   node scripts/post-launch-snapshot.mjs           # 8h window (default)
//   node scripts/post-launch-snapshot.mjs --hours=24
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { Client } = pg;

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
const HOURS = hoursArg ? Math.max(1, Number.parseInt(hoursArg.slice(8), 10)) : 8;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

await client.connect();

const interval = `${HOURS} hours`;

const r = (sql, params = []) => client.query(sql, params).then((x) => x.rows);

// ─── Users ───────────────────────────────────────────────────────────────────
const [totalUsers] = await r(`SELECT COUNT(*)::int AS n FROM "User"`);
const [windowSignups] = await r(
  `SELECT COUNT(*)::int AS n FROM "User" WHERE "createdAt" >= NOW() - $1::interval`,
  [interval],
);
const [withUsername] = await r(
  `SELECT COUNT(*)::int AS n FROM "User" WHERE username IS NOT NULL`,
);
const [windowMinted] = await r(
  `SELECT COUNT(*)::int AS n FROM "User"
   WHERE username IS NOT NULL AND "createdAt" >= NOW() - $1::interval`,
  [interval],
);

// Signup curve — rough hourly histogram
const signupsByHour = await r(
  `SELECT
     date_trunc('hour', "createdAt") AS hour,
     COUNT(*)::int AS signups,
     COUNT(*) FILTER (WHERE username IS NOT NULL)::int AS minted
   FROM "User"
   WHERE "createdAt" >= NOW() - $1::interval
   GROUP BY 1
   ORDER BY 1`,
  [interval],
);

// ─── TurnMetrics ─────────────────────────────────────────────────────────────
const [turnTotals] = await r(
  `SELECT
     COUNT(*)::int                                      AS total,
     COUNT(*) FILTER (WHERE "interruptedMessageCount" > 0)::int AS interrupted,
     COUNT(*) FILTER (WHERE "pendingActionYielded" = true)::int AS write_yields,
     COUNT(*) FILTER (WHERE "evalSummaryViolationsCount" > 0)::int AS eval_summary_violations,
     SUM("estimatedCostUsd")::float                     AS cost_total_usd,
     SUM("cacheSavingsUsd")::float                      AS cache_savings_usd,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "estimatedCostUsd")::float AS cost_p50,
     PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "estimatedCostUsd")::float AS cost_p95,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "wallTimeMs")::float       AS latency_p50_ms,
     PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "wallTimeMs")::float      AS latency_p95_ms,
     PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "ttfvpMs")::float          AS ttfvp_p50_ms,
     SUM("inputTokens")::int                            AS input_tokens_total,
     SUM("outputTokens")::int                           AS output_tokens_total,
     SUM(COALESCE("cacheReadTokens", 0))::int           AS cache_read_total,
     SUM(COALESCE("cacheWriteTokens", 0))::int          AS cache_write_total,
     COUNT(DISTINCT "userId")::int                      AS distinct_users
   FROM "TurnMetrics"
   WHERE "createdAt" >= NOW() - $1::interval
     AND synthetic = false`,
  [interval],
);

// Effort-level distribution (proxy for turn complexity)
const effortDist = await r(
  `SELECT
     "harnessShape" AS shape,
     COUNT(*)::int AS n,
     ROUND(AVG("wallTimeMs"))::int AS avg_latency_ms,
     ROUND(SUM("estimatedCostUsd")::numeric, 4)::float AS total_cost
   FROM "TurnMetrics"
   WHERE "createdAt" >= NOW() - $1::interval
     AND synthetic = false
   GROUP BY 1
   ORDER BY 2 DESC`,
  [interval],
);

// Top tool calls (parsed from toolsCalled jsonb)
const topTools = await r(
  `SELECT name, COUNT(*)::int AS n
   FROM "TurnMetrics", jsonb_array_elements("toolsCalled") AS t(name_obj),
        LATERAL (SELECT name_obj->>'name' AS name) AS x
   WHERE "createdAt" >= NOW() - $1::interval
     AND synthetic = false
   GROUP BY name
   ORDER BY n DESC
   LIMIT 15`,
  [interval],
);

// Pending-action outcomes (write tools)
const writeOutcomes = await r(
  `SELECT
     "pendingActionOutcome" AS outcome,
     COUNT(*)::int          AS n
   FROM "TurnMetrics"
   WHERE "createdAt" >= NOW() - $1::interval
     AND synthetic = false
     AND "pendingActionOutcome" IS NOT NULL
   GROUP BY 1
   ORDER BY 2 DESC`,
  [interval],
);

// ─── Output ──────────────────────────────────────────────────────────────────
const fmt = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
const usd = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(4)}`);
const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '—');

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  POST-LAUNCH SNAPSHOT — last ${HOURS}h                                  `);
console.log(`╚══════════════════════════════════════════════════════════════════════╝\n`);

console.log(`USERS`);
console.log(`  Total in DB:             ${fmt(totalUsers.n)}`);
console.log(`  With minted username:    ${fmt(withUsername.n)}`);
console.log(`  Signups in window:       ${fmt(windowSignups.n)}`);
console.log(`  Minted in window:        ${fmt(windowMinted.n)}  (${pct(windowMinted.n, windowSignups.n)} of signups)`);

console.log(`\nSIGNUP CURVE (hourly, UTC)`);
for (const row of signupsByHour) {
  const dt = new Date(row.hour).toISOString();
  const bucket = `${dt.slice(5, 10)} ${dt.slice(11, 13)}h`;
  const bar = '█'.repeat(Math.min(60, Math.ceil(row.signups / 2)));
  console.log(`  ${bucket}  ${String(row.signups).padStart(4)} signups, ${String(row.minted).padStart(4)} minted  ${bar}`);
}

console.log(`\nAGENT TURNS (TurnMetrics)`);
console.log(`  Total turns:             ${fmt(turnTotals.total)}`);
console.log(`  Distinct chatters:       ${fmt(turnTotals.distinct_users)}`);
console.log(`  Yielded a write:         ${fmt(turnTotals.write_yields)}  (${pct(turnTotals.write_yields, turnTotals.total)})`);
console.log(`  Interrupted:             ${fmt(turnTotals.interrupted)}  (${pct(turnTotals.interrupted, turnTotals.total)})`);
console.log(`  Eval-summary violations: ${fmt(turnTotals.eval_summary_violations)}`);

console.log(`\nLATENCY`);
console.log(`  TTFVP p50:               ${turnTotals.ttfvp_p50_ms ? Math.round(turnTotals.ttfvp_p50_ms) + 'ms' : '—'}`);
console.log(`  Wall p50:                ${turnTotals.latency_p50_ms ? Math.round(turnTotals.latency_p50_ms) + 'ms' : '—'}`);
console.log(`  Wall p95:                ${turnTotals.latency_p95_ms ? Math.round(turnTotals.latency_p95_ms) + 'ms' : '—'}`);

console.log(`\nCOST`);
console.log(`  Total spend:             ${usd(turnTotals.cost_total_usd)}`);
console.log(`  Cache savings:           ${usd(turnTotals.cache_savings_usd)}`);
console.log(`  Per-turn p50:            ${usd(turnTotals.cost_p50)}`);
console.log(`  Per-turn p95:            ${usd(turnTotals.cost_p95)}`);
console.log(`  Input tokens:            ${fmt(turnTotals.input_tokens_total)}`);
console.log(`  Output tokens:           ${fmt(turnTotals.output_tokens_total)}`);
console.log(`  Cache READ:              ${fmt(turnTotals.cache_read_total)}`);
console.log(`  Cache WRITE:             ${fmt(turnTotals.cache_write_total)}`);

console.log(`\nHARNESS-SHAPE DISTRIBUTION`);
for (const row of effortDist) {
  console.log(`  ${(row.shape ?? '(legacy)').padEnd(12)}  ${String(row.n).padStart(5)} turns · avg ${row.avg_latency_ms}ms · ${usd(row.total_cost)}`);
}

if (writeOutcomes.length) {
  console.log(`\nWRITE-TOOL OUTCOMES (pending_action)`);
  for (const row of writeOutcomes) {
    console.log(`  ${row.outcome.padEnd(20)}  ${fmt(row.n)}`);
  }
}

console.log(`\nTOP TOOLS CALLED`);
for (const row of topTools) {
  console.log(`  [${String(row.n).padStart(4)}×]  ${row.name}`);
}

console.log(``);

await client.end();
