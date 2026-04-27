#!/usr/bin/env node
// ---------------------------------------------------------------------------
// canonical-source-scan.mjs — single-source-of-truth static scanner.
//
// Walks `apps/web/{lib,app,hooks,components}` and fails on any forbidden
// import that bypasses the canonical portfolio fetchers in
// `apps/web/lib/portfolio.ts` / `transaction-history.ts` / `rates.ts`.
//
// ESLint enforces the same rules at dev time; this script is the
// redundant CI gate for cases where lint is skipped (e.g. fast Vercel
// preview deploys, ad-hoc `pnpm build` runs that don't `next lint`).
//
// Self-contained: no `@t2000/*` imports, no Next.js context, no TS
// compiler. Runs anywhere `node` runs.
//
// Invocation (from `apps/web`):
//   node scripts/canonical-source-scan.mjs
//
// Exits 0 on clean, 1 on any violation.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

const CANONICAL_FILES = new Set(
  [
    'lib/portfolio.ts',
    'lib/portfolio-data.ts',
    'lib/transaction-history.ts',
    'lib/rates.ts',
    'lib/protocol-registry.ts',
    'lib/sui-rpc.ts',
  ].map((p) => p.split('/').join(sep).split(sep).join('/')),
);

const CANONICAL_PREFIXES = ['lib/__tests__/', 'lib/generated/prisma/'];

const SCAN_DIRS = ['lib', 'app', 'hooks', 'components'];
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.turbo',
  'dist',
  'build',
  '__tests__',
  'generated',
]);

const FORBIDDEN_IMPORTS = [
  {
    id: 'no-direct-portfolio-data-import',
    pattern: /from\s+['"]@\/lib\/portfolio-data['"]/,
    explain:
      'Import `getPortfolio` / `getWalletSnapshot` from `@/lib/portfolio` ' +
      'instead — `portfolio-data.ts` is a private dependency of the canonical fetcher.',
  },
  {
    id: 'no-direct-engine-fetchAddressPortfolio',
    pattern:
      /import\s+(?:[^;]*\b)?(?:fetchAddressPortfolio|fetchWalletCoins)\b[^;]*from\s+['"]@t2000\/engine['"]/,
    explain:
      'Use `getPortfolio` / `getWalletSnapshot` from `@/lib/portfolio` so ' +
      'the dashboard, cron, and engine see identical numbers.',
  },
  {
    id: 'no-direct-engine-fetchTokenPrices',
    pattern: /import\s+(?:[^;]*\b)?fetchTokenPrices\b[^;]*from\s+['"]@t2000\/engine['"]/,
    explain:
      'Use `getTokenPrices` from `@/lib/portfolio` so price chunking, ' +
      'timeouts, and stable allow-list behaviour live in one place.',
  },
];

const violations = [];

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
    } else if (s.isFile() && (entry.endsWith('.ts') || entry.endsWith('.tsx'))) {
      const relPath = relative(ROOT, full).split(sep).join('/');
      if (CANONICAL_FILES.has(relPath)) continue;
      if (CANONICAL_PREFIXES.some((p) => relPath.startsWith(p))) continue;

      let src;
      try {
        src = readFileSync(full, 'utf8');
      } catch {
        continue;
      }

      const lines = src.split('\n');
      for (const rule of FORBIDDEN_IMPORTS) {
        for (let i = 0; i < lines.length; i++) {
          if (rule.pattern.test(lines[i])) {
            violations.push({
              id: rule.id,
              relPath,
              line: i + 1,
              explain: rule.explain,
            });
          }
        }
      }
    }
  }
}

for (const d of SCAN_DIRS) {
  walk(join(ROOT, d));
}

if (violations.length === 0) {
  console.log('[canonical-source-scan] OK — no forbidden imports outside canonical files.');
  process.exit(0);
}

console.error(`[canonical-source-scan] FAIL — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  ✗ ${v.relPath}:${v.line}  [${v.id}]`);
  console.error(`      ${v.explain}\n`);
}
process.exit(1);
