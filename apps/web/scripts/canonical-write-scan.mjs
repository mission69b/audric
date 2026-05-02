#!/usr/bin/env node
// ---------------------------------------------------------------------------
// canonical-write-scan.mjs — single-source-of-truth WRITE-side scanner.
//
// Walks `apps/web/app/api/transactions/` and `apps/web/app/api/services/`
// and asserts every PTB-building route either calls `composeTx` from
// `@t2000/sdk` or has a `// CANONICAL-BYPASS:` comment justifying the
// exception. Mirrors `canonical-source-scan.mjs` (read-side portfolio
// scanner) for SPEC 7 v0.4 Layer 0 / Gate B #6.
//
// Why this exists alongside the ESLint rule (Gate B #5):
//   ESLint forbids `new Transaction()` outside canonical files at dev /
//   CI time. This script is the redundant CI gate for cases where lint
//   is skipped (e.g. fast Vercel preview deploys, ad-hoc `pnpm build`
//   runs that don't `next lint`). Both gates target the same invariant
//   from different angles — defense in depth.
//
// Self-contained: no `@t2000/*` imports, no Next.js context, no TS
// compiler. Runs anywhere `node` runs.
//
// Invocation (from `apps/web`):
//   node scripts/canonical-write-scan.mjs
//   pnpm scan:canonical-write
//
// Exits 0 on clean, 1 on any violation.
//
// Spec: SPEC 7 v0.4 § "Layer 0 acceptance gates" #6.
// Build-tracker row: P2.6 Gate B closeout.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

// Canonical surface — files allowed to construct `new Transaction()`
// directly. Empty for now: every PTB outside `composeTx` must be inside
// `@t2000/sdk` (which is in `node_modules`, naturally excluded by the
// `SCAN_DIRS` allow-list below). If a future canonical bypass becomes
// necessary, list it here and document why in the bypass-comment grammar.
const CANONICAL_FILES = new Set([]);

const SCAN_DIRS = ['app/api/transactions', 'app/api/services'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '__tests__',
  'generated',
]);

const violations = [];
const surveyed = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full);
    } else if (s.isFile() && entry === 'route.ts') {
      // Skip integration / unit tests — they often build raw `Transaction`
      // for assertions and the eslint config exempts them via the
      // shared `**/*.test.ts` ignore.
      if (full.includes('.test.') || full.includes('.spec.')) continue;
      auditFile(full);
    }
  }
}

function auditFile(full) {
  const relPath = relative(ROOT, full).split(sep).join('/');
  if (CANONICAL_FILES.has(relPath)) return;

  let src;
  try {
    src = readFileSync(full, 'utf8');
  } catch {
    return;
  }
  const lines = src.split('\n');

  // Scan signals — three independent classifiers:
  //   - directConstruction[]: line numbers with `new Transaction(`
  //   - composeTxCall: any line with composeTx invocation or import
  //   - bypassComments[]: line numbers with the bypass marker
  const directConstruction = [];
  const bypassComments = [];
  let composeTxCall = false;

  // Match patterns:
  //   `new Transaction(`         — direct PTB construction (the bug class).
  //   `from '@t2000/sdk'`        — must contain composeTx in the import list.
  //   `composeTx(`               — actual call site.
  //   `// CANONICAL-BYPASS:`     — exception marker (must include rationale).
  const RE_NEW_TX = /\bnew\s+Transaction\s*\(/;
  const RE_COMPOSE_CALL = /\bcomposeTx\s*\(/;
  const RE_COMPOSE_IMPORT = /import[\s\S]{0,200}\bcomposeTx\b[\s\S]{0,200}from\s*['"]@t2000\/sdk['"]/;
  const RE_BYPASS = /\/\/\s*CANONICAL-BYPASS\s*:/;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (RE_NEW_TX.test(ln)) directConstruction.push(i + 1);
    if (RE_COMPOSE_CALL.test(ln)) composeTxCall = true;
    if (RE_BYPASS.test(ln)) bypassComments.push(i + 1);
  }
  // Multi-line import scan (composeTx import may span lines).
  if (RE_COMPOSE_IMPORT.test(src)) composeTxCall = true;

  surveyed.push({
    relPath,
    composeTxCall,
    directConstructionCount: directConstruction.length,
    bypassCount: bypassComments.length,
  });

  // Verdict logic:
  //   1. PTB-building route (has `new Transaction(`) → MUST have composeTx
  //      OR a CANONICAL-BYPASS comment.
  //   2. Non-PTB-building route → no obligation. Skip.
  //   3. PTB-building route with both composeTx AND `new Transaction(`
  //      → still allowed (e.g. mixed flow). Already covered by ESLint
  //      ignore rules in canonical files; we don't double-flag here.
  if (directConstruction.length === 0) return;
  if (composeTxCall) return;
  if (bypassComments.length > 0) return;

  for (const lineNum of directConstruction) {
    violations.push({
      relPath,
      line: lineNum,
      explain:
        'Direct PTB construction (`new Transaction()`) without `composeTx` ' +
        'or a `// CANONICAL-BYPASS:` comment. Every Audric Enoki-sponsored ' +
        'write must go through `composeTx({ steps })` from `@t2000/sdk`. ' +
        'See `audric/.cursor/rules/audric-canonical-write.mdc` and SPEC 7 ' +
        'v0.4 § "Layer 0 — Canonical Write Architecture".',
    });
  }
}

for (const d of SCAN_DIRS) {
  walk(join(ROOT, d));
}

// Survey output — useful for first-time runs, hidden in clean CI output.
const SURVEY_VERBOSE = process.env.CANONICAL_WRITE_SCAN_VERBOSE === '1';
if (SURVEY_VERBOSE) {
  console.log(`[canonical-write-scan] surveyed ${surveyed.length} route file(s):`);
  for (const s of surveyed) {
    const ptb = s.directConstructionCount > 0 ? `PTB×${s.directConstructionCount}` : 'no-PTB';
    const compose = s.composeTxCall ? 'composeTx✓' : 'composeTx✗';
    const bypass = s.bypassCount > 0 ? `bypass×${s.bypassCount}` : '';
    console.log(`  ${ptb}  ${compose}  ${bypass}  ${s.relPath}`);
  }
  console.log('');
}

if (violations.length === 0) {
  console.log(
    `[canonical-write-scan] OK — ${surveyed.length} route file(s) checked, ` +
      'every PTB-building route routes through `composeTx` (or has a ' +
      'documented bypass).',
  );
  process.exit(0);
}

console.error(`[canonical-write-scan] FAIL — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ✗ ${v.relPath}:${v.line}`);
  console.error(`      ${v.explain}\n`);
}
process.exit(1);
