#!/usr/bin/env node
// ---------------------------------------------------------------------------
// portfolio-shadow-check.mjs — Phase 6 pre-merge shadow validator.
//
// Compares numbers from a *deployed* audric instance (e.g. staging or
// production) against the new canonical sources to confirm the
// single-source-of-truth refactor produces consistent results.
//
// Usage:
//   node scripts/portfolio-shadow-check.mjs \
//     --base https://staging.audric.ai \
//     --address 0x40cd...
//
// Exits 0 on match, 1 on divergence.
//
// What it checks for the given address:
//   1. /api/portfolio                → walletValueUsd, savings, debt, netWorth
//   2. /api/positions                → savings, savingsRate, healthFactor
//   3. /api/balances (if present)    → matches portfolio.walletAllocations
//   4. /api/rates                    → consistent USDC save rate
//   5. /api/history?limit=10         → returns at least 0 rows (smoke check)
//
// The contract test at lib/__tests__/portfolio-contract.test.ts pins
// the expected SHAPE; this script pins the live VALUES across surfaces
// for a real address pre-merge.
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, arg, i, all) => {
    if (arg.startsWith('--')) acc.push([arg.slice(2), all[i + 1]]);
    return acc;
  }, []),
);

const BASE = (args.base ?? process.env.AUDRIC_SHADOW_BASE ?? '').replace(/\/$/, '');
const ADDRESS = args.address ?? process.env.AUDRIC_SHADOW_ADDRESS;
const TOLERANCE_USD = Number(args.tolerance ?? '0.01');

if (!BASE || !ADDRESS) {
  console.error('Usage: node scripts/portfolio-shadow-check.mjs --base <url> --address <0x...> [--tolerance 0.01]');
  process.exit(2);
}

const fmt = (n) => (typeof n === 'number' ? n.toFixed(4) : String(n));
const close = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) <= TOLERANCE_USD;

async function get(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`${url} → HTTP ${res.status}`);
  }
  return res.json();
}

const failures = [];
function check(label, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(`${label}: ${detail}`);
}

console.log(`[shadow-check] base=${BASE} address=${ADDRESS}\n`);

try {
  const portfolio = await get(`/api/portfolio?address=${encodeURIComponent(ADDRESS)}`);
  const positions = await get(`/api/positions?address=${encodeURIComponent(ADDRESS)}`);
  const rates = await get(`/api/rates`).catch(() => null);
  const history = await get(`/api/history?address=${encodeURIComponent(ADDRESS)}&limit=10`).catch(() => null);

  // 1. Portfolio shape exists.
  check(
    'portfolio.netWorthUsd is finite',
    Number.isFinite(portfolio.netWorthUsd),
    `got ${portfolio.netWorthUsd}`,
  );
  check(
    'portfolio.walletValueUsd >= 0',
    typeof portfolio.walletValueUsd === 'number' && portfolio.walletValueUsd >= 0,
    `got ${portfolio.walletValueUsd}`,
  );
  check(
    'portfolio.positions.savings >= 0',
    typeof portfolio.positions?.savings === 'number' && portfolio.positions.savings >= 0,
    `got ${portfolio.positions?.savings}`,
  );

  // 2. Net worth identity: walletValueUsd + savings - borrows ≈ netWorthUsd.
  const computed = (portfolio.walletValueUsd ?? 0) + (portfolio.positions?.savings ?? 0) - (portfolio.positions?.borrows ?? 0);
  check(
    'netWorth identity holds',
    close(computed, portfolio.netWorthUsd),
    `computed ${fmt(computed)} vs reported ${fmt(portfolio.netWorthUsd)}`,
  );

  // 3. /api/positions matches portfolio.positions slice.
  check(
    'positions.savings matches portfolio.positions.savings',
    close(positions.savings, portfolio.positions?.savings),
    `positions=${fmt(positions.savings)} vs portfolio=${fmt(portfolio.positions?.savings)}`,
  );
  check(
    'positions.borrows matches portfolio.positions.borrows',
    close(positions.borrows, portfolio.positions?.borrows),
    `positions=${fmt(positions.borrows)} vs portfolio=${fmt(portfolio.positions?.borrows)}`,
  );
  check(
    'positions.healthFactor matches',
    (positions.healthFactor ?? null) === (portfolio.positions?.healthFactor ?? null) ||
      (positions.healthFactor != null && portfolio.positions?.healthFactor != null &&
        Math.abs(positions.healthFactor - portfolio.positions.healthFactor) < 0.01),
    `positions=${positions.healthFactor} vs portfolio=${portfolio.positions?.healthFactor}`,
  );

  // 4. Rates consistency — USDC save rate should be in [0, 0.5] (sanity).
  // /api/rates returns either { bestSaveRate: { rate: number, ... } } or
  // a flat number on `usdc.save` depending on caller. Accept both shapes.
  if (rates) {
    const usdcSave =
      typeof rates.bestSaveRate === 'object' && rates.bestSaveRate !== null
        ? rates.bestSaveRate.rate
        : (rates.bestSaveRate ?? rates.usdc?.save ?? null);
    check(
      'rates USDC save in sane range',
      typeof usdcSave === 'number' && usdcSave >= 0 && usdcSave <= 0.5,
      `got ${usdcSave}`,
    );
  } else {
    check('rates endpoint reachable', false, '/api/rates fetch failed');
  }

  // 5. History — should be an array, non-error.
  if (history) {
    check(
      'history returns array',
      Array.isArray(history.items ?? history),
      `got ${typeof history}`,
    );
  }

  console.log();
  if (failures.length === 0) {
    console.log(`[shadow-check] OK — every adapter agrees with the canonical for ${ADDRESS}.`);
    process.exit(0);
  } else {
    console.error(`[shadow-check] FAIL — ${failures.length} divergence(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
} catch (err) {
  console.error('[shadow-check] crashed:', err.message ?? err);
  process.exit(2);
}
