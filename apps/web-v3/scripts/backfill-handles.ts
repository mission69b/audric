/**
 * Backfill @audric handles from v2 → v3 so returning users see their handle on
 * first load (no manual re-claim).
 *
 * Mapping key = ADDRESS, never email: a handle's value is its on-chain
 * leaf→address binding, and v3 derives the same zkLogin address as v2. We only
 * write when v3 has a user with the exact address the leaf targets, AND the
 * on-chain leaf actually resolves to that address (ground truth). Mislabeling is
 * impossible — mismatches are skipped, not guessed.
 *
 * Efficient: only v2 handles whose address ALSO exists in v3 (and has no handle
 * yet) are candidates — the rest are skipped without an on-chain call. The
 * candidate set is verified on-chain in parallel batches.
 *
 * DRY-RUN by default. Review, then re-run with --apply.
 *   V2_POSTGRES_URL=<v2-url> POSTGRES_URL=<v3-url> pnpm backfill-handles
 *   V2_POSTGRES_URL=<v2-url> POSTGRES_URL=<v3-url> pnpm backfill-handles --apply
 */

import { normalizeSuiAddress } from "@mysten/sui/utils";
import { fullHandle, resolveSuinsViaRpc } from "@t2000/sdk";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user } from "../lib/db/schema";

dotenv.config({ path: ".env.local" });

const CONCURRENCY = 20;

async function main() {
  const v2Url = process.env.V2_POSTGRES_URL;
  const v3Url = process.env.POSTGRES_URL;
  if (!(v2Url && v3Url)) {
    console.error("✗ Set both V2_POSTGRES_URL and POSTGRES_URL.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");

  const v2 = postgres(v2Url);
  const v3db = drizzle(postgres(v3Url));

  // v2 handles + ALL v3 users (id + username). v3 is small (new app).
  const v2rows = await v2<{ suiAddress: string; username: string }[]>`
    SELECT "suiAddress", "username" FROM "User" WHERE "username" IS NOT NULL`;
  const v3rows = await v3db
    .select({ id: user.id, username: user.username })
    .from(user);
  const v3Username = new Map(v3rows.map((u) => [u.id, u.username]));

  // Candidate = a v2 handle whose address is a v3 user that has no handle yet.
  const candidates = v2rows.filter(
    (r) => v3Username.has(r.suiAddress) && !v3Username.get(r.suiAddress)
  );

  console.log(
    `v2 handles: ${v2rows.length} · v3 users: ${v3rows.length} · candidates: ${candidates.length} · mode: ${apply ? "APPLY" : "DRY-RUN"}`
  );

  let written = 0;
  let mismatch = 0;

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const verified = await Promise.all(
      batch.map(async (r) => {
        const address = String(r.suiAddress);
        const username = String(r.username);
        let onChain: string | null = null;
        try {
          onChain = await resolveSuinsViaRpc(fullHandle(username));
        } catch {
          // RPC hiccup — treat as unverified (skip); re-run later.
        }
        const ok =
          Boolean(onChain) &&
          normalizeSuiAddress(onChain as string) ===
            normalizeSuiAddress(address);
        return { address, username, ok };
      })
    );

    for (const res of verified) {
      if (!res.ok) {
        mismatch += 1;
        console.log(
          `  skip ${res.username}@audric (${res.address.slice(0, 10)}…): on-chain mismatch/unregistered`
        );
        continue;
      }
      if (apply) {
        try {
          await v3db
            .update(user)
            .set({
              username: res.username,
              usernameMintTxDigest: "backfilled",
              usernameUpdatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(user.id, res.address));
        } catch (e) {
          console.log(
            `  ✗ ${res.username}@audric: write failed (${(e as Error).message})`
          );
          continue;
        }
      }
      written += 1;
      console.log(
        `  ${apply ? "✓ set" : "would set"} ${res.username}@audric → ${res.address.slice(0, 10)}…`
      );
    }
  }

  console.log(
    `\nDone. ${apply ? "written" : "would write"}: ${written} · on-chain mismatch: ${mismatch} · skipped (no v3 user / already has handle): ${v2rows.length - candidates.length}.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ backfill failed:", e);
  process.exit(1);
});
