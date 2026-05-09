#!/usr/bin/env tsx
/**
 * One-shot test wallet generator for Tier B execute regression.
 *
 * Generates a fresh Ed25519 keypair, prints the address + Bech32 private
 * key, and prints the funding instructions. Run ONCE during S.124 Tier B
 * setup; never run again unless the wallet is drained or compromised.
 *
 * Usage:
 *   pnpm --filter web exec tsx scripts/regression-swaps/gen-test-wallet.ts
 *
 * The Bech32 private key is printed to stdout so it can be redirected
 * into a sealed file or pasted into the GitHub Actions secret. The script
 * does NOT persist it anywhere.
 *
 * Security model:
 *   - The wallet's private key is a low-value credential — the wallet
 *     holds at most ~$10 of test funds at any time and cannot move
 *     anything outside its own balance.
 *   - The keypair lives in GitHub Actions encrypted secrets
 *     (REGRESSION_TEST_WALLET_PRIVKEY). Only the cron / dispatch
 *     workflows read it; never exposed to PRs or push CI.
 *   - If compromised, rotate by re-running this script and updating the
 *     secret. Drain the old wallet by running run-executes.ts in DRAIN
 *     mode (TODO Phase 7).
 */

import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const kp = Ed25519Keypair.generate();
const address = kp.toSuiAddress();
const privkey = kp.getSecretKey();

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('S.124 Tier B — Test Wallet Generated');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('  Sui Address:');
console.log(`  ${address}`);
console.log('');
console.log('  Bech32 Private Key (treat as a low-value credential):');
console.log(`  ${privkey}`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Setup steps');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(`  1. Send  $5.00 USDC  to  ${address}`);
console.log(`     (covers 5 round-trips/night × ~$0.012 drift × 30 nights ≈ $1.80/mo);`);
console.log(`     $5 covers ~3 months before refill.`);
console.log('');
console.log(`  2. Send  $2.00 worth of SUI  to  ${address}  for gas`);
console.log(`     (10 swaps/night × ~$0.005 gas × 30 nights ≈ $1.50/mo);`);
console.log(`     $2 covers ~1 month with safety margin. Top up monthly.`);
console.log('');
console.log('  3. Add to GitHub Actions repo secrets:');
console.log('       Name:  REGRESSION_TEST_WALLET_PRIVKEY');
console.log('       Value: (the suiprivkey... string above)');
console.log('     Repo settings → Secrets and variables → Actions → New repository secret');
console.log('');
console.log(`  4. Verify funding by running locally (replace with your own privkey export):`);
console.log(`       export REGRESSION_TEST_WALLET_PRIVKEY=${privkey}`);
console.log(`       pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts --dry-run`);
console.log(`     Expected: pre-flight balance check passes; no swaps executed.`);
console.log('');
console.log(`  5. First real run:`);
console.log(`       pnpm --filter web exec tsx scripts/regression-swaps/run-executes.ts`);
console.log(`     Expected: 5 round-trips complete, ~$0.06 spent, all assertions pass.`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Security reminders');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('  • This script does NOT persist the private key. If you lose this');
console.log('    output, the wallet is unrecoverable — rotate and refund.');
console.log('  • Never paste this key into Slack/Discord/email. Only into the');
console.log('    GitHub Actions secret form.');
console.log('  • The wallet holds <=$10 in test funds; if compromised, drain via');
console.log('    run-executes.ts --drain and rotate by rerunning this script.');
console.log('  • The address above is permanent. Once funded, do not lose it.');
console.log('    Consider saving it to 1Password or similar.');
console.log('');
