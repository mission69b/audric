#!/usr/bin/env tsx
/**
 * Tier B — execute regression harness.
 *
 * Runs 5 round-trip swaps (USDC → asset → USDC) via @t2000/sdk's agent.swap()
 * against a pre-funded test wallet. Costs ~$0.50/day. Runs nightly cron + manual
 * dispatch only — never on PRs (would burn gas on every fork push).
 *
 * Why round-trip vs one-way
 * -------------------------
 * USDC → asset → USDC keeps the wallet topology stable across nights (no asset
 * accumulates or drains over time), doubles assertion surface (both directions
 * exercised per scenario), and the small drift per night (~slippage + 2× overlay
 * fee + 2× gas) compounds slowly enough that monthly top-ups stay under $2/mo.
 *
 * What this catches that Tier A doesn't
 * -------------------------------------
 *   - "swap_quote returns ok but swap_execute fails on-chain" (Cetus quote/exec
 *     contract mismatch — happened in production once before)
 *   - "buildSwapTx produces a tx that simulates ok but reverts on chain"
 *   - "balance change parsing regressed" (S.123 had a brush with this)
 *   - "fee collection breaks for a specific asset"
 *
 * What this DOES NOT catch (intentional gaps)
 * -------------------------------------------
 *   - Audric prepare/route + Enoki sponsorship — covered by manual smoke test
 *     on production audric.ai (founder workflow). When this harness alerts,
 *     the natural follow-up is one manual "swap 0.10 USDC for SUI" on prod
 *     to verify the sponsored flow still works. SDK-direct here, Enoki on prod.
 *   - harvest_rewards compound bundle — needs claimable NAVI rewards;
 *     deferred until the test wallet has a stable reward stream.
 *
 * Usage
 * -----
 *   # Real run (executes 5 round-trips, ~$0.06 spent on slippage+fees+gas)
 *   REGRESSION_TEST_WALLET_PRIVKEY=suiprivkey... \
 *     pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts
 *
 *   # Pre-flight check only — verifies wallet exists, has balance, no swaps
 *   REGRESSION_TEST_WALLET_PRIVKEY=suiprivkey... \
 *     pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts --dry-run
 *
 *   # Drain mode — sweep all USDC + SUI to a recovery address, leave wallet empty
 *   REGRESSION_TEST_WALLET_PRIVKEY=suiprivkey... \
 *   DRAIN_TO_ADDRESS=0x... \
 *     pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts --drain
 *
 * Required env
 * ------------
 *   REGRESSION_TEST_WALLET_PRIVKEY — Bech32 private key (suiprivkey...)
 *
 * Optional env
 * ------------
 *   DRAIN_TO_ADDRESS — required only with --drain flag
 *   RUN_TAG          — suffix for the artifact filename
 *
 * Exit codes
 * ----------
 *   0  all 5 round trips passed
 *   1  at least one happy-path regressed (BLOCK MERGE — would-be-user-visible)
 *   3  pre-flight failed (wallet drained, missing privkey, etc.) — operator action
 *   4  drain succeeded (special exit code; not a failure)
 */

import { randomBytes } from 'node:crypto';
import { T2000, T2000Error } from '@t2000/sdk';
import { Transaction } from '@mysten/sui/transactions';

import { TIER_B_SCENARIOS } from './scenarios.js';
import { summarize, printSummary, writeArtifact, exitCodeFor, type ScenarioResult } from './reporter.js';

const USDC_TYPE = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
const SUI_TYPE = '0x2::sui::SUI';

// Pre-flight thresholds. The wallet must hold at least these amounts in human
// units BEFORE any execute scenario runs. Below these → abort cleanly with
// exit 3 (pre-flight failed, not a regression). The numbers are 2× the
// expected daily spend to give 1 extra day of headroom for monitoring.
const MIN_USDC_PREFLIGHT = 1.0; // 2× daily budget ($0.50/day)
const MIN_SUI_PREFLIGHT = 0.1;  // 2× daily gas budget (~$0.10/day at SUI ~$1)

// Drift tolerance per round trip. A round trip should lose at most ~3% of its
// trip amount to slippage + 2× overlay fee + 2× gas. Allow 5% to absorb
// occasional volatility spikes; a >5% drift means the SDK or Cetus is doing
// something pathological and the night should fail.
const MAX_DRIFT_FRACTION = 0.05;

// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script.
const PRIVKEY = process.env.REGRESSION_TEST_WALLET_PRIVKEY;
// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script.
const DRAIN_TO_ADDRESS = process.env.DRAIN_TO_ADDRESS;
// eslint-disable-next-line no-restricted-syntax -- PROCESS-ENV-BYPASS: standalone CLI script.
const RUN_TAG = process.env.RUN_TAG || `r${randomBytes(3).toString('hex')}`;

const argv = process.argv.slice(2);
const isDryRun = argv.includes('--dry-run');
const isDrain = argv.includes('--drain');

interface PreflightResult {
  ok: boolean;
  usdcHuman: number;
  suiHuman: number;
  reason?: string;
}

async function preflight(agent: T2000): Promise<PreflightResult> {
  const usdcBal = await agent.suiClient.getBalance({ owner: agent.address(), coinType: USDC_TYPE });
  const suiBal = await agent.suiClient.getBalance({ owner: agent.address(), coinType: SUI_TYPE });
  const usdcHuman = Number(BigInt(usdcBal.totalBalance)) / 1e6;
  const suiHuman = Number(BigInt(suiBal.totalBalance)) / 1e9;

  if (usdcHuman < MIN_USDC_PREFLIGHT) {
    return {
      ok: false,
      usdcHuman,
      suiHuman,
      reason: `USDC balance ${usdcHuman.toFixed(4)} below minimum ${MIN_USDC_PREFLIGHT}. Refill the test wallet.`,
    };
  }
  if (suiHuman < MIN_SUI_PREFLIGHT) {
    return {
      ok: false,
      usdcHuman,
      suiHuman,
      reason: `SUI balance ${suiHuman.toFixed(4)} below gas minimum ${MIN_SUI_PREFLIGHT}. Refill SUI for gas.`,
    };
  }
  return { ok: true, usdcHuman, suiHuman };
}

async function runRoundTrip(
  agent: T2000,
  scenario: { id: string; asset: string; amountUsdc: number },
): Promise<ScenarioResult> {
  const start = performance.now();

  let usdcPreRaw = BigInt(0);
  try {
    const pre = await agent.suiClient.getBalance({ owner: agent.address(), coinType: USDC_TYPE });
    usdcPreRaw = BigInt(pre.totalBalance);
  } catch {
    // ignore — caught by post-trip diff
  }

  let outResult: Awaited<ReturnType<T2000['swap']>>;
  try {
    outResult = await agent.swap({ from: 'USDC', to: scenario.asset, amount: scenario.amountUsdc });
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    const errorCode = err instanceof T2000Error ? err.code : err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : undefined;
    return {
      id: scenario.id,
      category: 'execute',
      from: 'USDC',
      to: scenario.asset,
      amount: scenario.amountUsdc,
      ms,
      pass: false,
      errorCode,
      errorMessage: err instanceof Error ? err.message : String(err),
      failureReason: `OUTBOUND leg failed: USDC → ${scenario.asset}`,
    };
  }

  // [Tier B] settle delay before reverse leg — gives Cetus pool state time to refresh.
  await new Promise((r) => setTimeout(r, 1500));

  let backResult: Awaited<ReturnType<T2000['swap']>>;
  try {
    backResult = await agent.swap({ from: scenario.asset, to: 'USDC', amount: outResult.toAmount });
  } catch (err) {
    const ms = Math.round(performance.now() - start);
    const errorCode = err instanceof T2000Error ? err.code : err instanceof Error && 'code' in err ? String((err as { code: unknown }).code) : undefined;
    return {
      id: scenario.id,
      category: 'execute',
      from: scenario.asset,
      to: 'USDC',
      amount: outResult.toAmount,
      ms,
      pass: false,
      txDigestOut: outResult.tx,
      errorCode,
      errorMessage: err instanceof Error ? err.message : String(err),
      failureReason: `REVERSE leg failed: ${scenario.asset} → USDC. Outbound succeeded (${outResult.tx}); wallet now holds ${outResult.toAmount} ${scenario.asset} that needs manual recovery.`,
    };
  }

  await new Promise((r) => setTimeout(r, 1500));

  const post = await agent.suiClient.getBalance({ owner: agent.address(), coinType: USDC_TYPE });
  const usdcPostRaw = BigInt(post.totalBalance);
  const usdcDeltaHuman = Number(usdcPostRaw - usdcPreRaw) / 1e6;
  const driftFraction = Math.abs(usdcDeltaHuman) / scenario.amountUsdc;

  const ms = Math.round(performance.now() - start);
  const totalGas = outResult.gasCost + backResult.gasCost;

  const pass = driftFraction <= MAX_DRIFT_FRACTION;
  return {
    id: scenario.id,
    category: 'execute',
    from: 'USDC',
    to: `${scenario.asset} → USDC (round trip)`,
    amount: scenario.amountUsdc,
    ms,
    pass,
    txDigestOut: outResult.tx,
    txDigestBack: backResult.tx,
    gasCostSui: totalGas,
    usdcDelta: usdcDeltaHuman,
    failureReason: pass
      ? undefined
      : `Round trip drift ${(driftFraction * 100).toFixed(2)}% exceeds ${(MAX_DRIFT_FRACTION * 100).toFixed(0)}% tolerance. Cetus pricing or fee collection may have regressed.`,
  };
}

async function drainWallet(agent: T2000, recoveryAddress: string): Promise<void> {
  console.log(`Draining wallet to ${recoveryAddress}…`);
  const usdcBal = await agent.suiClient.getBalance({ owner: agent.address(), coinType: USDC_TYPE });
  const usdcRaw = BigInt(usdcBal.totalBalance);
  const suiBal = await agent.suiClient.getBalance({ owner: agent.address(), coinType: SUI_TYPE });
  const suiRaw = BigInt(suiBal.totalBalance);

  console.log(`  pre-drain: ${Number(usdcRaw) / 1e6} USDC, ${Number(suiRaw) / 1e9} SUI`);

  if (usdcRaw > BigInt(0)) {
    // eslint-disable-next-line no-restricted-syntax -- CANONICAL-BYPASS: standalone operator script outside the Audric request path; sweeps a low-value test wallet via direct keypair signing, never sponsored by Enoki.
    const tx = new Transaction();
    tx.setSender(agent.address());
    const allUsdc = await agent.suiClient.getAllCoins({ owner: agent.address() });
    const usdcCoins = allUsdc.data.filter((c) => c.coinType === USDC_TYPE).map((c) => c.coinObjectId);
    if (usdcCoins.length > 0) {
      const [primary, ...rest] = usdcCoins;
      const target = tx.object(primary);
      if (rest.length > 0) tx.mergeCoins(target, rest.map((id) => tx.object(id)));
      tx.transferObjects([target], recoveryAddress);
      const result = await agent.suiClient.signAndExecuteTransaction({
        signer: agent.keypair,
        transaction: tx,
        options: { showEffects: true },
      });
      console.log(`  USDC drained → ${result.digest}`);
    }
  }

  // Leave 0.05 SUI for the gas of the SUI-drain tx itself; sweep the rest.
  const reserveSui = BigInt(50_000_000); // 0.05 SUI in mist
  const reserveDoubled = reserveSui * BigInt(2);
  if (suiRaw > reserveDoubled) {
    const sweepRaw = suiRaw - reserveDoubled;
    // eslint-disable-next-line no-restricted-syntax -- CANONICAL-BYPASS: standalone operator script; SUI sweep via direct keypair signing.
    const tx = new Transaction();
    tx.setSender(agent.address());
    const [coin] = tx.splitCoins(tx.gas, [sweepRaw]);
    tx.transferObjects([coin], recoveryAddress);
    const result = await agent.suiClient.signAndExecuteTransaction({
      signer: agent.keypair,
      transaction: tx,
      options: { showEffects: true },
    });
    console.log(`  SUI drained (left ${Number(reserveSui) / 1e9} for gas) → ${result.digest}`);
  }

  console.log('Drain complete. The test wallet is now empty (modulo dust).');
}

(async () => {
  if (!PRIVKEY) {
    console.error('error: REGRESSION_TEST_WALLET_PRIVKEY env var is required');
    console.error('   Generate via: pnpm tsx scripts/regression-swaps/gen-test-wallet.ts');
    process.exit(3);
  }

  const agent = T2000.fromPrivateKey(PRIVKEY);
  console.log(`Tier B — swap execute regression harness`);
  console.log(`wallet: ${agent.address()}`);
  console.log(`mode: ${isDrain ? 'DRAIN' : isDryRun ? 'DRY-RUN' : 'LIVE'}`);
  console.log(`runTag: ${RUN_TAG}`);

  if (isDrain) {
    if (!DRAIN_TO_ADDRESS) {
      console.error('error: --drain requires DRAIN_TO_ADDRESS env var');
      process.exit(3);
    }
    await drainWallet(agent, DRAIN_TO_ADDRESS);
    process.exit(4);
  }

  const pf = await preflight(agent);
  console.log(`pre-flight: USDC=${pf.usdcHuman.toFixed(4)} SUI=${pf.suiHuman.toFixed(4)}`);
  if (!pf.ok) {
    console.error(`pre-flight FAILED: ${pf.reason}`);
    process.exit(3);
  }

  if (isDryRun) {
    console.log('dry-run: pre-flight passed; no scenarios executed.');
    process.exit(0);
  }

  console.log(`scenarios: ${TIER_B_SCENARIOS.length}, runs SERIAL (each scenario blocks on chain confirmation)`);

  const startedAt = new Date();
  const results: ScenarioResult[] = [];
  for (const s of TIER_B_SCENARIOS) {
    console.log(`\n[${s.id}] USDC → ${s.asset} → USDC ($${s.amountUsdc})`);
    const r = await runRoundTrip(agent, s);
    if (r.pass) {
      console.log(`  PASS  drift ${r.usdcDelta?.toFixed(6)} USDC, gas ${r.gasCostSui?.toFixed(6)} SUI, ${r.ms}ms`);
      console.log(`        out=${r.txDigestOut}`);
      console.log(`        back=${r.txDigestBack}`);
    } else {
      console.log(`  FAIL  ${r.failureReason}`);
      if (r.errorCode) console.log(`        errorCode=${r.errorCode}`);
      if (r.errorMessage) console.log(`        errorMessage=${r.errorMessage.slice(0, 150)}`);
    }
    results.push(r);
  }
  const endedAt = new Date();

  const summary = summarize(results, startedAt, endedAt);
  printSummary(summary, `Tier B run ${RUN_TAG}`);

  const totalDrift = results.reduce((acc, r) => acc + (r.usdcDelta ?? 0), 0);
  const totalGas = results.reduce((acc, r) => acc + (r.gasCostSui ?? 0), 0);
  console.log(`\ntotal drift this run: ${totalDrift.toFixed(6)} USDC`);
  console.log(`total gas this run:   ${totalGas.toFixed(6)} SUI`);

  const artifact = writeArtifact(summary, RUN_TAG);
  console.log(`\nartifact: ${artifact}`);

  const exit = exitCodeFor(summary);
  if (exit === 0) {
    console.log(`\nresult: PASS (${summary.passed}/${summary.total})`);
  } else {
    console.log(`\nresult: FAIL (${summary.failed}/${summary.total})`);
    console.log(`        BLOCK MERGE. Manual smoke test on audric.ai recommended:`);
    console.log(`          → Try one swap (e.g. 0.10 USDC → SUI) via the chat to verify`);
    console.log(`            the Enoki-sponsored Audric flow still works.`);
  }
  process.exit(exit);
})().catch((err) => {
  console.error(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  console.error(err);
  process.exit(3);
});
