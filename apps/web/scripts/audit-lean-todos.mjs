#!/usr/bin/env node
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
const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});
await c.connect();

const r = await c.query(`
  SELECT id, "sessionId", "userId", "modelUsed", "todoUpdateCount", "thinkingBlockCount",
         "wallTimeMs", "ttfvpMs", "harnessShape",
         jsonb_array_length(COALESCE("toolsCalled", '[]'::jsonb)) AS tool_count,
         "toolsCalled", "createdAt"
  FROM "TurnMetrics"
  WHERE "createdAt" >= NOW() - INTERVAL '48 hours'
    AND synthetic = false
    AND "harnessShape" = 'lean'
    AND "todoUpdateCount" > 0
  ORDER BY "createdAt" DESC
`);

console.log(`Found ${r.rows.length} LEAN turns with todoUpdateCount > 0:\n`);
for (const row of r.rows) {
  const tools = Array.isArray(row.toolsCalled)
    ? row.toolsCalled.map((t) => t.name || JSON.stringify(t)).join(', ')
    : '(none)';
  console.log(`id=${row.id}`);
  console.log(`  sessionId=${row.sessionId}  userId=${row.userId}`);
  console.log(`  model=${row.modelUsed}  shape=${row.harnessShape}  todos=${row.todoUpdateCount}  thinking=${row.thinkingBlockCount}`);
  console.log(`  wallMs=${row.wallTimeMs}  ttfvpMs=${row.ttfvpMs}  toolCount=${row.tool_count}`);
  console.log(`  tools=[${tools}]`);
  console.log(`  at=${row.createdAt.toISOString()}`);
  console.log('');
}
await c.end();
