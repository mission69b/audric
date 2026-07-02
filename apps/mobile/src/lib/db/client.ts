import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Transient-failure retry. In this WSL2 dev setup, outbound HTTPS to Neon's IPs
// intermittently drops (ETIMEDOUT / ENETUNREACH — undici exhausts every resolved
// address in one fetch, yet the very NEXT request succeeds). The endpoint is fine;
// the network path flaps. Wrap Neon's fetch so each query retries a few times with
// a short backoff — smooths ~50%-flaky dev connectivity to effectively 100%. Harmless
// in production (a healthy path never retries). Only network *throws* are retried;
// a returned Response (even a 4xx/5xx from Postgres) passes straight through.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
neonConfig.fetchFunction = async (input: unknown, init: unknown) => {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fetch(input as RequestInfo, init as RequestInit);
    } catch (e) {
      lastErr = e;
      await sleep(150 * (attempt + 1));
    }
  }
  throw lastErr;
};

// The DB seam — the ONE place the Neon connection is opened, the native analogue of
// web-v3's `lib/db/queries.ts` client. SERVER-ONLY: `POSTGRES_URL` deliberately has
// NO `EXPO_PUBLIC_` prefix, so it never enters the client bundle. Imported only from
// Expo Router API routes (which run in Node), never from a screen/component.
//
// Driver: `@neondatabase/serverless` in HTTP mode (`neon()` → one fetch per query).
// Chosen over web-v3's `postgres` (postgres-js) because that opens a raw TCP socket,
// which Metro does not bundle for the Expo server target; the HTTP driver is pure
// `fetch` and Just Works. The Drizzle query layer above it is identical to web-v3.
//
// Lazy + memoized: if `POSTGRES_URL` is unset, `getDb()` returns null so every route
// degrades to "no persistence" instead of crashing at import — AI chat keeps working
// with the DB entirely absent.

let cached: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> | null {
  if (cached) return cached;
  const url = process.env.POSTGRES_URL;
  if (!url) return null;
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
