#!/usr/bin/env tsx
/**
 * Companion cleanup for mint-load-test.ts.
 *
 * Reads the audit JSON written by the load test and:
 *   1. Deletes test User rows from the prod DB (identified by
 *      googleSub LIKE "LOADTEST_<runTag>_*" — a tag the seed step
 *      stamped on each row, deterministic per run)
 *   2. (OPTIONAL) Revokes each successfully-minted leaf via
 *      buildRevokeLeafTx + signAndExecuteTransaction with the same
 *      AUDRIC_PARENT_NFT_PRIVATE_KEY the prod route uses
 *
 * Why revoke is OPTIONAL
 * ----------------------
 * The mint-load-test handles use the `lt-<runTag>-NNN` prefix so a
 * real user would never collide. Revoking costs another ~$0.008 per
 * leaf in gas. For a 200-mint test, that's ~$1.60 to clean up vs $0
 * to leave them as identifiable on-chain garbage.
 *
 * Recommended: skip revoke after small smoke runs, do revoke after
 * any 50+ mint run to keep the registry tidy.
 *
 * Usage
 * -----
 *   # Just delete DB rows (fast, free)
 *   pnpm tsx apps/web/scripts/loadtest/mint-cleanup.ts <audit-file>
 *
 *   # Delete DB rows AND revoke on-chain leaves (slow, costs gas)
 *   REVOKE=1 pnpm tsx apps/web/scripts/loadtest/mint-cleanup.ts <audit-file>
 */

/* eslint-disable no-console */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { SuinsClient } from '@mysten/suins';
import { buildRevokeLeafTx } from '@t2000/sdk';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '../../lib/generated/prisma/client';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(here, '../../.env.local') });

const auditPath = process.argv[2];
if (!auditPath) {
  console.error('Usage: mint-cleanup.ts <audit-file>');
  process.exit(1);
}

interface AuditFile {
  runTag: string;
  profile: string;
  results: Array<{
    handle: string;
    ok: boolean;
    txDigest: string | null;
  }>;
  summary: {
    successful: number;
  };
}

const audit = JSON.parse(readFileSync(auditPath, 'utf-8')) as AuditFile;
const REVOKE = process.env.REVOKE === '1' || process.env.REVOKE === 'true';

console.log('━'.repeat(70));
console.log(`CLEANUP — runTag=${audit.runTag} profile=${audit.profile}`);
console.log('━'.repeat(70));
console.log(`Successful mints to handle: ${audit.summary.successful}`);
console.log(`Revoke on-chain?            ${REVOKE ? 'YES' : 'NO (set REVOKE=1 to revoke)'}`);
console.log('━'.repeat(70));
console.log('');

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL missing from env (expected in apps/web/.env.local).');
    process.exit(1);
  }
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: dbUrl }),
  });

  console.log(`[1/2] Deleting test User rows tagged LOADTEST_${audit.runTag}_*...`);
  const dbT0 = Date.now();
  const deleted = await prisma.user.deleteMany({
    where: { displayName: { startsWith: `LOADTEST_${audit.runTag}_` } },
  });
  console.log(`  → deleted ${deleted.count} rows in ${Date.now() - dbT0}ms\n`);

  if (!REVOKE) {
    console.log('[2/2] Skipping on-chain revoke (set REVOKE=1 to revoke).');
    console.log(`  Note: ${audit.summary.successful} leaves remain on-chain as identifiable garbage`);
    console.log(`        (handles "lt-${audit.runTag}-NNN.audric.sui").`);
    await prisma.$disconnect();
    return;
  }

  const rawKey = process.env.AUDRIC_PARENT_NFT_PRIVATE_KEY;
  if (!rawKey) {
    console.error(
      'REVOKE=1 set but AUDRIC_PARENT_NFT_PRIVATE_KEY missing from env. Aborting revoke step.',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const { scheme, secretKey } = decodeSuiPrivateKey(rawKey);
  if (scheme !== 'ED25519') {
    console.error(`Expected ED25519 keypair, got "${scheme}"`);
    await prisma.$disconnect();
    process.exit(1);
  }
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);

  const network = (process.env.NEXT_PUBLIC_SUI_NETWORK || 'mainnet') as 'mainnet' | 'testnet' | 'devnet' | 'localnet';
  const suiRpcUrl = process.env.SUI_RPC_URL || getJsonRpcFullnodeUrl(network);
  const suiClient = new SuiJsonRpcClient({ url: suiRpcUrl, network });
  const suinsClient = new SuinsClient({ client: suiClient as never, network });

  const successful = audit.results.filter((r) => r.ok);
  console.log(`[2/2] Revoking ${successful.length} on-chain leaves...`);
  console.log(`  Estimated cost: ~$${(successful.length * 0.008).toFixed(2)}`);
  console.log('');

  let revoked = 0;
  let failed = 0;
  for (const r of successful) {
    try {
      const tx = buildRevokeLeafTx(suinsClient, { label: r.handle });
      await suiClient.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: false },
      });
      revoked += 1;
      console.log(`  [${revoked + failed}/${successful.length}] ✓ revoked ${r.handle}`);
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `  [${revoked + failed}/${successful.length}] ✗ revoke failed for ${r.handle}: ${msg.slice(0, 80)}`,
      );
    }
  }

  console.log('');
  console.log(`  → revoked ${revoked}/${successful.length} (${failed} failed)`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
