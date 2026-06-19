/**
 * One-time migration of @audric handles from v2 → v3. v2 is FROZEN, so the v2
 * handle set is complete + permanent — loading it once into v3 covers every
 * returning user with no runtime coupling (no V2_DATABASE_URL at runtime).
 *
 * Mapping key = ADDRESS, never email: a handle's value is its on-chain
 * leaf→address binding, and v3 derives the same zkLogin address as v2. Each
 * handle is verified on-chain (the leaf must resolve to that address) before it
 * is written — mislabeling is impossible. Users who haven't signed into v3 get
 * an identity-only row (id + username, no email); their email is captured when
 * they actually sign in (upsertUser). A v3 user who already set a handle is
 * never clobbered.
 *
 * DRY-RUN by default. Review, then re-run with --apply.
 *   V2_POSTGRES_URL=<v2-url> POSTGRES_URL=<v3-url> pnpm backfill-handles
 *   V2_POSTGRES_URL=<v2-url> POSTGRES_URL=<v3-url> pnpm backfill-handles --apply
 */

import { normalizeSuiAddress } from "@mysten/sui/utils";
import { fullHandle, resolveSuinsViaRpc } from "@t2000/sdk";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user } from "../lib/db/schema";

dotenv.config({ path: ".env.local" });

const CONCURRENCY = 12;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve a handle's on-chain address with one retry, distinguishing a true
 * wrong-address from a transient RPC failure (so throttling never masquerades
 * as a mismatch and silently drops a legit handle).
 */
async function resolveWithRetry(
  handle: string
): Promise<{ resolved: boolean; address: string | null }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const addr = await resolveSuinsViaRpc(handle);
      return { resolved: true, address: addr };
    } catch {
      if (attempt === 0) {
        await sleep(400);
      }
    }
  }
  return { resolved: false, address: null };
}

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

  const v2rows = await v2<{ suiAddress: string; username: string }[]>`
    SELECT "suiAddress", "username" FROM "User" WHERE "username" IS NOT NULL`;
  const v3rows = await v3db
    .select({ id: user.id, username: user.username })
    .from(user);
  const v3HasHandle = new Set(
    v3rows.filter((u) => u.username).map((u) => u.id)
  );

  // Migrate every v2 handle whose owner doesn't already have a v3 handle set
  // (so we never clobber a handle a user picked in v3).
  const todo = v2rows.filter((r) => !v3HasHandle.has(r.suiAddress));

  console.log(
    `v2 handles: ${v2rows.length} · v3 already-set: ${v3HasHandle.size} · to migrate: ${todo.length} · mode: ${apply ? "APPLY" : "DRY-RUN"}`
  );

  let written = 0;
  let wrongAddr = 0; // resolved, but to a DIFFERENT address (truly stale)
  let unresolved = 0; // RPC failed both tries OR leaf no longer exists
  const wrongExamples: string[] = [];
  const unresolvedExamples: string[] = [];

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);
    const verified = await Promise.all(
      batch.map(async (r) => {
        const address = String(r.suiAddress);
        const username = String(r.username);
        const { resolved, address: onChain } = await resolveWithRetry(
          fullHandle(username)
        );
        const ok =
          Boolean(onChain) &&
          normalizeSuiAddress(onChain as string) ===
            normalizeSuiAddress(address);
        const status: "ok" | "wrong" | "unresolved" = ok
          ? "ok"
          : resolved
            ? "wrong"
            : "unresolved";
        return { address, username, status };
      })
    );

    for (const res of verified) {
      if (res.status === "wrong") {
        wrongAddr += 1;
        if (wrongExamples.length < 10) {
          wrongExamples.push(`${res.username}@audric`);
        }
        continue;
      }
      if (res.status === "unresolved") {
        unresolved += 1;
        if (unresolvedExamples.length < 10) {
          unresolvedExamples.push(`${res.username}@audric`);
        }
        continue;
      }
      if (apply) {
        try {
          await v3db
            .insert(user)
            .values({
              id: res.address,
              username: res.username,
              usernameMintTxDigest: "migrated",
              usernameUpdatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: user.id,
              set: {
                username: res.username,
                usernameMintTxDigest: "migrated",
                usernameUpdatedAt: new Date(),
                updatedAt: new Date(),
              },
            });
        } catch (e) {
          console.log(
            `  ✗ ${res.username}@audric: write failed (${(e as Error).message})`
          );
          continue;
        }
      }
      written += 1;
    }
    if (todo.length > CONCURRENCY) {
      console.log(`  …${Math.min(i + CONCURRENCY, todo.length)}/${todo.length}`);
    }
  }

  console.log(
    `\nDone. ${apply ? "migrated" : "would migrate"}: ${written} · wrong-address (stale, skipped): ${wrongAddr} · unresolved/RPC (skipped): ${unresolved} · already-set in v3 (skipped): ${v2rows.length - todo.length}.`
  );
  if (wrongExamples.length > 0) {
    console.log(`  wrong-address e.g.: ${wrongExamples.join(", ")}`);
  }
  if (unresolvedExamples.length > 0) {
    console.log(`  unresolved e.g.: ${unresolvedExamples.join(", ")}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("✗ backfill failed:", e);
  process.exit(1);
});
