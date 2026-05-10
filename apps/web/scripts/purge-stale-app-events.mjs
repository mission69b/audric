#!/usr/bin/env node
/**
 * One-shot purge of stale `AppEvent` rows from production NeonDB.
 *
 * Background — why this exists
 * ----------------------------
 * The `AppEvent` table accumulated rows from features that have since
 * been retired (Suggestions, Schedules, Auto-compound, Pattern
 * proposals — all retired in S.7 / April 2026 simplification). After
 * the activity-rebuild ship (S.145 / S.146) the route's
 * `LIVE_APP_EVENT_TYPES` allowlist hides the rows from new requests,
 * but the rows are still in the DB and (a) burn storage budget,
 * (b) clutter analytics queries, (c) re-surface if a future filter
 * accidentally widens the allowlist.
 *
 * Live writers in the codebase TODAY (audited 2026-05-10):
 *   - `'pay'`         — `app/api/services/{prepare,complete}/route.ts`
 *   - `'pay_received'` — `app/api/payments/[slug]/verify/route.ts`
 *
 * Anything else in the table is stale.
 *
 * Usage
 * -----
 *   node apps/web/scripts/purge-stale-app-events.mjs            # AUDIT (no delete)
 *   node apps/web/scripts/purge-stale-app-events.mjs --confirm  # actually delete
 *
 * Requires `DATABASE_URL` in `.env.local` (the same NeonDB connection
 * string used by Prisma). Connects with `pg` directly so no Prisma
 * generate / build is required.
 *
 * Safety
 * ------
 * - Default mode is AUDIT: prints type counts + count of rows that
 *   WOULD be deleted, exits 0 without writing.
 * - `--confirm` is required to actually `DELETE`.
 * - The DELETE runs in a single transaction — every stale row is
 *   gone or none are.
 * - NeonDB has 30d point-in-time retention so a misfire is recoverable.
 */
import 'dotenv/config';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { Client } = pg;

const LIVE_APP_EVENT_TYPES = ['pay', 'pay_received'];

const envPath = new URL('../.env.local', import.meta.url);
if (existsSync(fileURLToPath(envPath))) {
  const envFile = readFileSync(envPath, 'utf8');
  for (const line of envFile.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL not set — abort.');
  process.exit(1);
}

const confirm = process.argv.includes('--confirm');

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require')
    ? { rejectUnauthorized: false }
    : undefined,
});
await c.connect();

const counts = await c.query(`
  SELECT type, COUNT(*)::int AS n
  FROM "AppEvent"
  GROUP BY type
  ORDER BY n DESC
`);

console.log('=== Current AppEvent row counts by type ===');
for (const row of counts.rows) {
  const label = LIVE_APP_EVENT_TYPES.includes(row.type) ? '   live' : '  STALE';
  console.log(`  ${label}  ${row.type.padEnd(28)} ${row.n}`);
}

const stale = counts.rows.filter((r) => !LIVE_APP_EVENT_TYPES.includes(r.type));
const totalStale = stale.reduce((s, r) => s + r.n, 0);

console.log('');
console.log(`Total stale rows: ${totalStale}`);

if (totalStale === 0) {
  console.log('Nothing to purge.');
  await c.end();
  process.exit(0);
}

if (!confirm) {
  console.log('');
  console.log('AUDIT mode — re-run with --confirm to actually delete.');
  console.log('Stale type breakdown:');
  for (const row of stale) {
    console.log(`  - ${row.type.padEnd(28)} ${row.n} rows`);
  }
  await c.end();
  process.exit(0);
}

console.log('');
console.log('Purging…');

await c.query('BEGIN');
try {
  const del = await c.query(
    `DELETE FROM "AppEvent" WHERE type NOT IN ($1, $2) RETURNING id`,
    [LIVE_APP_EVENT_TYPES[0], LIVE_APP_EVENT_TYPES[1]],
  );
  console.log(`Deleted ${del.rowCount} rows.`);
  await c.query('COMMIT');
  console.log('COMMIT complete.');
} catch (err) {
  await c.query('ROLLBACK');
  console.error('Error during purge — ROLLBACK:', err);
  process.exit(2);
}

await c.end();
