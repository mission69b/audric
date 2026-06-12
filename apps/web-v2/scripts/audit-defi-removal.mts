/**
 * DeFi-removal position audit — SPEC_AUDRIC_DEFI_REMOVAL §2d step 1 (S.382).
 *
 * Sizes the wind-down problem BEFORE anything is cut. Two cohorts (a user
 * can be in both):
 *
 *   (a) Active NAVI positions — savings deposits AND/OR open borrows
 *       (pending rewards reported as an informational extra; the
 *       claim/harvest surface dies with the removal too).
 *   (b) Non-USDC wallet holdings — stranded value in a USDC-only
 *       top-up-and-spend app (SUI, GOLD, USDT, USDsui, vSUI, …).
 *
 * The combined count decides the §2d contact channel (in-app banner vs
 * direct email vs both).
 *
 * Reads go through the CANONICAL portfolio path (`getPortfolio`) per
 * single-source-of-truth.mdc — no parallel fetcher. One audit-specific
 * caveat: `getPortfolio` deliberately fail-OPENS on a NAVI registry
 * error (rejected `fetchPositions` degrades to zero positions with no
 * flag on the returned shape). For an audit that's a false-negative
 * risk, so this script intercepts the canonical fetcher's
 * "positions fetch failed" console.error, marks those wallets
 * INCONCLUSIVE, and retries them once sequentially at the end. Wallets
 * still failing are listed separately — never silently counted clean.
 *
 * Run (from apps/web-v2, .env.local must hold DATABASE_URL +
 * BLOCKVISION_API_KEY etc.). tsx can't be used (its CJS resolution path
 * chokes on the ESM-only @t2000/engine exports map); native Node +
 * the alias hooks in scripts/audit-register.mjs handles `@/` +
 * extensionless imports:
 *
 *   node --experimental-transform-types \
 *     --import ./scripts/audit-register.mjs \
 *     scripts/audit-defi-removal.mts
 *
 * Parallel workers (AUDIT_WORKERS, default 8) with light pacing;
 * rate-limit-degraded reads are fail-closed (inconclusive + retried).
 * Progress streams to audit-progress.jsonl in the output dir, so a
 * killed run RESUMES (conclusive reads are skipped).
 *
 * Output: human summary on stdout + JSON/markdown report files. Wallet
 * lists are sensitive — the report defaults into the founder-local
 * t2000 spec/ mount (gitignored internal repo), overridable via
 * AUDIT_OUT_DIR. Nothing is written into this repo.
 *
 * Read-only: SELECTs on User / UserPreferences / SessionUsage + live
 * BlockVision/NAVI reads. No writes, no on-chain calls.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(here, "..", ".env.local") });
loadEnv({ path: path.join(here, "..", ".env") });

// lib/env.ts validates the full server schema at first import — load env
// BEFORE importing anything that touches it (hence dynamic imports).
const { prisma } = await import("../lib/prisma.ts");
const { getPortfolio } = await import("../lib/portfolio.ts");
const { redactAddress } = await import("../lib/audric/log-redact.ts");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** USD floor below which a NAVI savings/borrow line is float noise. */
const NAVI_EPS_USD = 0.01;
/** USD floor for a non-USDC holding to count as cohort (b) stranded value. */
const COHORT_B_MIN_USD = 0.5;
/** Non-USDC holdings between $0.01 and the floor — tallied as dust, not cohort. */
const DUST_MIN_USD = 0.01;
/**
 * Concurrency vs rate limits: each getPortfolio fans out to BlockVision
 * `/account/coins` + 6+ per-protocol DeFi endpoints + Sui RPC fallback,
 * and 429 storms degrade wallet reads. That's SAFE here — degraded /
 * failed reads are marked inconclusive (fail-closed) and re-read by the
 * retry pass or a resumed run, never counted clean. The slow leg is the
 * ~4s NAVI positions read, so parallel workers cut wall-clock roughly
 * linearly. Tune via AUDIT_WORKERS (default 8).
 */
const WORKERS = Number(process.env.AUDIT_WORKERS ?? 8);
const PACING_MS = Number(process.env.AUDIT_PACING_MS ?? 50);

const OUT_DIR =
  process.env.AUDIT_OUT_DIR ??
  "/Users/funkii/dev/t2000/spec/active/defi-removal-audit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HoldingLine {
  amount: number;
  symbol: string;
  usdValue: number | null;
}

interface WalletAudit {
  address: string;
  borrows: { asset: string; amountUsd: number }[];
  cohortA: boolean;
  cohortB: boolean;
  defiSource: string;
  // Informational — external (non-NAVI) DeFi, NOT opened via Audric
  externalDefiUsd: number;
  hasUserRow: boolean;
  healthFactor: number | null;
  lastActiveAt: string | null;
  naviBorrowsUsd: number;
  naviPendingRewardsUsd: number;
  // Cohort (a) — NAVI
  naviSavingsUsd: number;
  nonUsdcDustUsd: number;
  // Cohort (b) — non-USDC wallet holdings
  nonUsdcHoldings: HoldingLine[];
  nonUsdcTotalUsd: number;
  positionsReadFailed: boolean;
  supplies: { asset: string; amountUsd: number }[];
  unpricedSymbols: string[];
  userCreatedAt: string | null;
  username: string | null;
  /**
   * Wallet (coins) read did not come from BlockVision — degraded reads
   * can under-report holdings, so cohort (b) is unreliable for this
   * wallet. Treated as inconclusive (retried; never counted clean).
   */
  walletReadDegraded: boolean;
  // Read quality
  walletSource: string;
}

function isConclusive(audit: WalletAudit): boolean {
  return !(audit.positionsReadFailed || audit.walletReadDegraded);
}

// ---------------------------------------------------------------------------
// NAVI-read failure detection (fail-closed audit)
// ---------------------------------------------------------------------------

const failedPositionReads = new Set<string>(); // redacted address keys
const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  const text = args.map(String).join(" ");
  if (text.includes("positions fetch failed for")) {
    // The canonical fetcher logs the redacted address — match on it.
    const match = text.match(/positions fetch failed for (\S+)/);
    if (match) {
      failedPositionReads.add(match[1]);
    }
  }
  originalConsoleError(...args);
};

// ---------------------------------------------------------------------------
// Enumerate wallets
// ---------------------------------------------------------------------------

console.log("[audit] enumerating wallets…");

const users = await prisma.user.findMany({
  select: { suiAddress: true, username: true, createdAt: true },
});
const userByAddress = new Map(users.map((u) => [u.suiAddress, u]));

// Safety-net union — addresses seen in prefs/usage but missing a User row
// (shouldn't happen under capture-on-login; report if it does).
const prefAddresses = await prisma.userPreferences.findMany({
  select: { address: true },
});
const usageAddresses = await prisma.sessionUsage.groupBy({
  by: ["address"],
  _max: { createdAt: true },
});
const lastActiveByAddress = new Map(
  usageAddresses.map((row) => [row.address, row._max.createdAt])
);

const allAddresses = new Set<string>([
  ...users.map((u) => u.suiAddress),
  ...prefAddresses.map((p) => p.address),
  ...usageAddresses.map((r) => r.address),
]);

const orphanAddresses = [...allAddresses].filter((a) => !userByAddress.has(a));

console.log(
  `[audit] ${userByAddress.size} User rows; ${allAddresses.size} distinct addresses total` +
    (orphanAddresses.length > 0
      ? ` (${orphanAddresses.length} without a User row — included)`
      : "")
);

// ---------------------------------------------------------------------------
// Audit one wallet
// ---------------------------------------------------------------------------

async function auditWallet(address: string): Promise<WalletAudit> {
  const redacted = redactAddress(address);
  failedPositionReads.delete(redacted);
  const portfolio = await getPortfolio(address);
  const user = userByAddress.get(address);

  const supplies = portfolio.positions.supplies
    .filter((s) => s.amountUsd >= NAVI_EPS_USD)
    .map((s) => ({ asset: s.asset, amountUsd: round2(s.amountUsd) }));
  const borrows = portfolio.positions.borrowsDetail
    .filter((b) => b.amountUsd >= NAVI_EPS_USD)
    .map((b) => ({ asset: b.asset, amountUsd: round2(b.amountUsd) }));

  const nonUsdcHoldings: HoldingLine[] = [];
  const unpricedSymbols: string[] = [];
  let nonUsdcTotalUsd = 0;
  let nonUsdcDustUsd = 0;
  for (const coin of portfolio.wallet) {
    const symbol = coin.symbol || "?";
    if (symbol === "USDC") {
      continue;
    }
    const amount = Number(coin.balance) / 10 ** coin.decimals;
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    const usd = coin.usdValue ?? null;
    if (usd === null) {
      unpricedSymbols.push(symbol);
      continue;
    }
    if (usd >= COHORT_B_MIN_USD) {
      nonUsdcHoldings.push({ symbol, amount, usdValue: round2(usd) });
      nonUsdcTotalUsd += usd;
    } else if (usd >= DUST_MIN_USD) {
      nonUsdcDustUsd += usd;
    }
  }
  nonUsdcHoldings.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));

  const positionsReadFailed = failedPositionReads.has(redacted);
  const walletReadDegraded = portfolio.source !== "blockvision";

  const cohortA =
    !positionsReadFailed &&
    (portfolio.positions.savings >= NAVI_EPS_USD ||
      portfolio.positions.borrows >= NAVI_EPS_USD);
  const cohortB =
    !walletReadDegraded &&
    (nonUsdcHoldings.length > 0 || unpricedSymbols.length > 0);

  return {
    address,
    username: user?.username ?? null,
    hasUserRow: Boolean(user),
    userCreatedAt: user?.createdAt.toISOString() ?? null,
    lastActiveAt: lastActiveByAddress.get(address)?.toISOString() ?? null,
    naviSavingsUsd: round2(portfolio.positions.savings),
    naviBorrowsUsd: round2(portfolio.positions.borrows),
    naviPendingRewardsUsd: round2(portfolio.positions.pendingRewards),
    healthFactor: portfolio.positions.healthFactor,
    supplies,
    borrows,
    nonUsdcHoldings,
    nonUsdcTotalUsd: round2(nonUsdcTotalUsd),
    nonUsdcDustUsd: round2(nonUsdcDustUsd),
    unpricedSymbols,
    externalDefiUsd: round2(portfolio.defiValueUsd),
    walletSource: portfolio.source,
    defiSource: portfolio.defiSource,
    positionsReadFailed,
    walletReadDegraded,
    cohortA,
    cohortB,
  };
}

function round2(n: number): number {
  // Reporting only — Math.round is fine here (no amount is ever fed to a
  // tx builder from this script; financial-amounts.mdc flooring applies
  // to actionable amounts, not audit aggregates).
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Run sequentially (paced) with JSONL resume + one retry for bad reads
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
const progressPath = path.join(OUT_DIR, "audit-progress.jsonl");

const results = new Map<string, WalletAudit>();
if (existsSync(progressPath)) {
  const lines = readFileSync(progressPath, "utf8")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const audit = JSON.parse(line) as WalletAudit;
    // Only resume CONCLUSIVE reads — inconclusive ones get re-read.
    if (isConclusive(audit)) {
      results.set(audit.address, audit);
    }
  }
  console.log(
    `[audit] resuming — ${results.size} conclusive wallet(s) loaded from ${progressPath}`
  );
}

function recordResult(audit: WalletAudit): void {
  results.set(audit.address, audit);
  appendFileSync(progressPath, `${JSON.stringify(audit)}\n`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pending = [...allAddresses].filter((a) => !results.has(a));
console.log(
  `[audit] reading ${pending.length} wallet(s) — ${WORKERS} workers, ${PACING_MS}ms pacing…`
);
let done = 0;
const queue = [...pending];

async function worker(): Promise<void> {
  for (;;) {
    const address = queue.shift();
    if (!address) {
      return;
    }
    try {
      recordResult(await auditWallet(address));
    } catch (error) {
      originalConsoleError(
        `[audit] FAILED for ${redactAddress(address)}:`,
        error
      );
    }
    done += 1;
    if (done % 25 === 0) {
      console.log(`[audit] ${done}/${pending.length} wallets read`);
    }
    await sleep(PACING_MS);
  }
}

await Promise.all(Array.from({ length: WORKERS }, () => worker()));

// Retry pass — wallets whose NAVI or wallet read was unreliable (or that
// errored entirely). Sequential + slower pacing to clear rate-limit
// pressure; anything still inconclusive lands in the report's
// `inconclusiveAddresses` and is picked up by a resumed run.
const retryAddresses = [...allAddresses].filter((a) => {
  const r = results.get(a);
  return !r || !isConclusive(r);
});
if (retryAddresses.length > 0) {
  console.log(
    `[audit] retrying ${retryAddresses.length} inconclusive wallet(s)…`
  );
  for (const address of retryAddresses) {
    await sleep(500);
    try {
      recordResult(await auditWallet(address));
    } catch (error) {
      originalConsoleError(
        `[audit] RETRY FAILED for ${redactAddress(address)}:`,
        error
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Aggregate + report
// ---------------------------------------------------------------------------

const audits = [...results.values()];
const cohortAWallets = audits.filter((a) => a.cohortA);
const cohortBWallets = audits.filter((a) => a.cohortB);
const bothCohorts = audits.filter((a) => a.cohortA && a.cohortB);
const inconclusive = [...allAddresses].filter((a) => {
  const r = results.get(a);
  return !r || !isConclusive(r);
});
const withExternalDefi = audits.filter((a) => a.externalDefiUsd >= 1);

const sum = (xs: number[]) => round2(xs.reduce((acc, x) => acc + x, 0));

const summary = {
  generatedAt: new Date().toISOString(),
  spec: "SPEC_AUDRIC_DEFI_REMOVAL §2d step 1 (S.382 wind-down audit)",
  thresholds: {
    naviEpsUsd: NAVI_EPS_USD,
    cohortBMinUsd: COHORT_B_MIN_USD,
    dustMinUsd: DUST_MIN_USD,
  },
  totals: {
    walletsEnumerated: allAddresses.size,
    userRows: userByAddress.size,
    orphanAddresses: orphanAddresses.length,
    walletsRead: audits.length,
    inconclusiveReads: inconclusive.length,
  },
  cohortA: {
    count: cohortAWallets.length,
    totalSavingsUsd: sum(cohortAWallets.map((a) => a.naviSavingsUsd)),
    totalBorrowsUsd: sum(cohortAWallets.map((a) => a.naviBorrowsUsd)),
    totalPendingRewardsUsd: sum(
      cohortAWallets.map((a) => a.naviPendingRewardsUsd)
    ),
    withOpenBorrow: cohortAWallets.filter(
      (a) => a.naviBorrowsUsd >= NAVI_EPS_USD
    ).length,
  },
  cohortB: {
    count: cohortBWallets.length,
    totalNonUsdcUsd: sum(cohortBWallets.map((a) => a.nonUsdcTotalUsd)),
    walletsWithUnpricedCoins: cohortBWallets.filter(
      (a) => a.unpricedSymbols.length > 0
    ).length,
    symbolBreakdown: breakdownBySymbol(cohortBWallets),
  },
  overlap: { inBothCohorts: bothCohorts.length },
  informational: {
    walletsWithExternalDefiOverUsd1: withExternalDefi.length,
    externalDefiTotalUsd: sum(withExternalDefi.map((a) => a.externalDefiUsd)),
  },
};

function breakdownBySymbol(
  wallets: WalletAudit[]
): Record<string, { wallets: number; totalUsd: number }> {
  const acc: Record<string, { wallets: number; totalUsd: number }> = {};
  for (const w of wallets) {
    for (const h of w.nonUsdcHoldings) {
      acc[h.symbol] ??= { wallets: 0, totalUsd: 0 };
      acc[h.symbol].wallets += 1;
      acc[h.symbol].totalUsd = round2(
        acc[h.symbol].totalUsd + (h.usdValue ?? 0)
      );
    }
  }
  return acc;
}

mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const jsonPath = path.join(OUT_DIR, `audit-${stamp}.json`);
writeFileSync(
  jsonPath,
  JSON.stringify(
    {
      summary,
      cohortA: cohortAWallets.sort(
        (a, b) =>
          b.naviSavingsUsd +
          b.naviBorrowsUsd -
          (a.naviSavingsUsd + a.naviBorrowsUsd)
      ),
      cohortB: cohortBWallets.sort(
        (a, b) => b.nonUsdcTotalUsd - a.nonUsdcTotalUsd
      ),
      inconclusiveAddresses: inconclusive,
      orphanAddresses,
    },
    null,
    2
  )
);

const md = [
  `# DeFi-removal audit — ${stamp}`,
  "",
  "> SPEC_AUDRIC_DEFI_REMOVAL §2d step 1. Generated by",
  "> `audric/apps/web-v2/scripts/audit-defi-removal.mts`. Wallet-level",
  `> detail in \`audit-${stamp}.json\` (same folder). Local-only.`,
  "",
  "| Metric | Value |",
  "|---|---|",
  `| Wallets enumerated | ${summary.totals.walletsEnumerated} (${summary.totals.userRows} User rows, ${summary.totals.orphanAddresses} orphan) |`,
  `| **Cohort (a) — active NAVI positions** | **${summary.cohortA.count}** |`,
  `| — total savings | $${summary.cohortA.totalSavingsUsd} |`,
  `| — total borrows | $${summary.cohortA.totalBorrowsUsd} (${summary.cohortA.withOpenBorrow} wallets with open borrow) |`,
  `| — pending rewards | $${summary.cohortA.totalPendingRewardsUsd} |`,
  `| **Cohort (b) — non-USDC holdings ≥ $${COHORT_B_MIN_USD}** | **${summary.cohortB.count}** |`,
  `| — total stranded value | $${summary.cohortB.totalNonUsdcUsd} |`,
  `| — wallets with unpriced coins | ${summary.cohortB.walletsWithUnpricedCoins} |`,
  `| In BOTH cohorts | ${summary.overlap.inBothCohorts} |`,
  `| Inconclusive reads (NAVI/wallet read unreliable after retry) | ${summary.totals.inconclusiveReads} |`,
  `| External (non-NAVI) DeFi ≥ $1 — informational | ${summary.informational.walletsWithExternalDefiOverUsd1} wallets / $${summary.informational.externalDefiTotalUsd} |`,
  "",
  "## Cohort (b) symbol breakdown",
  "",
  "| Symbol | Wallets | Total USD |",
  "|---|---|---|",
  ...Object.entries(summary.cohortB.symbolBreakdown)
    .sort((a, b) => b[1].totalUsd - a[1].totalUsd)
    .map(([sym, v]) => `| ${sym} | ${v.wallets} | $${v.totalUsd} |`),
  "",
].join("\n");
const mdPath = path.join(OUT_DIR, `audit-${stamp}.md`);
writeFileSync(mdPath, md);

console.log("\n================ DeFi-removal audit ================");
console.log(JSON.stringify(summary, null, 2));
console.log(`\n[audit] report written:\n  ${jsonPath}\n  ${mdPath}`);

await prisma.$disconnect();
