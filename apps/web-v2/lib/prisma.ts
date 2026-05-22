/**
 * Prisma client (web-v2) — talks to audric's NeonDB.
 *
 * --- SCHEMA OWNERSHIP (post-v0.7e Phase 5 cutover, 2026-05-22) ---
 *
 * web-v2 is the canonical app. The prisma schema, migrations, and
 * generated client all live here:
 *  - schema:     `apps/web-v2/prisma/schema.prisma`
 *  - migrations: `apps/web-v2/prisma/migrations/`
 *  - client:     `apps/web-v2/lib/generated/prisma/`
 *
 * Lifecycle:
 *  - `pnpm install` runs `prisma generate` (postinstall) — regenerates
 *    the client from schema.prisma. The committed client in git is the
 *    fallback for any consumer that runs without postinstall.
 *  - `pnpm migrate` runs `prisma migrate deploy` — applies pending
 *    migrations to the connected DB (used by CI / production deploys).
 *
 * Earlier (v0.7c → v0.7e Phase 4) web-v2 imported the generated client
 * from apps/web via a relative cross-package reference. That coupling
 * is gone — schema + client moved into web-v2 atomically when apps/web
 * was archived in v0.7e Phase 5 (S.253).
 *
 * --- NEON SERVERLESS ADAPTER ---
 *
 * Vercel + Neon: use the WebSocket driver instead of pooled `pg`
 * because the pool's TCP connections die quietly between Vercel's
 * lambda freeze/thaw cycles. The Neon adapter opens a fresh stateless
 * WebSocket per query — no pool, no dead connections.
 */

import { PrismaNeon } from "@prisma/adapter-neon";
import { env } from "./env";
import { PrismaClient } from "./generated/prisma/client";

/**
 * Re-export the Prisma namespace so consumers can access type helpers
 * (e.g. `Prisma.InputJsonValue`) without reaching into the generated
 * client directly.
 */
export { Prisma } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = createClient();
}

export const prisma = globalForPrisma.prisma;
