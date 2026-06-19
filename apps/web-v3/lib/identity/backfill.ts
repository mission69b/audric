import "server-only";

import { normalizeSuiAddress } from "@mysten/sui/utils";
import { fullHandle, resolveSuinsViaRpc } from "@t2000/sdk";
import postgres from "postgres";
import { getUserById, setUsername } from "@/lib/db/queries";
import { env } from "@/lib/env";

/**
 * Auto-backfill a returning v2 user's @audric handle at sign-in — so a v2 user's
 * first v3 sign-in "just has" their handle, no manual claim, no script babysitting.
 *
 * Best-effort + never throws (must not break sign-in). Address-keyed +
 * on-chain-verified — same safety as the bulk script: a handle is only adopted
 * when its leaf actually resolves to this address, so mislabeling is impossible.
 * No-op once the user has a handle, or when `V2_DATABASE_URL` is unset (a
 * migration-window coupling — drop the env once v2 is retired).
 */

let v2sql: ReturnType<typeof postgres> | null = null;

function v2db() {
  if (!env.V2_DATABASE_URL) {
    return null;
  }
  if (!v2sql) {
    v2sql = postgres(env.V2_DATABASE_URL, { max: 1 });
  }
  return v2sql;
}

export async function maybeBackfillHandle(address: string): Promise<void> {
  try {
    const sql = v2db();
    if (!sql) {
      return;
    }
    const me = await getUserById(address);
    if (me?.username) {
      return; // already has a handle
    }
    const rows = await sql<{ username: string }[]>`
      SELECT "username" FROM "User"
      WHERE "suiAddress" = ${address} AND "username" IS NOT NULL
      LIMIT 1`;
    const username = rows[0]?.username;
    if (!username) {
      return;
    }
    // Ground truth: only adopt if the leaf actually targets this address.
    const onChain = await resolveSuinsViaRpc(fullHandle(username));
    if (
      !onChain ||
      normalizeSuiAddress(onChain) !== normalizeSuiAddress(address)
    ) {
      return;
    }
    await setUsername(address, username, "backfilled");
  } catch (e) {
    console.error("[identity] auto-backfill skipped", e);
  }
}
