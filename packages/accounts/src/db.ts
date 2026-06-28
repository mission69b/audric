import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// The single runtime DB connection for the shared substrate. Both audric/web-v3
// and apps/console import THIS `db` (web-v3 no longer creates its own) → one
// connection pool, one source of truth. (SPEC_T2000_API_V2 §2.)
const client = postgres(process.env.POSTGRES_URL ?? "");
export const db = drizzle(client);
