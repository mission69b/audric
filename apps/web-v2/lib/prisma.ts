/**
 * Prisma client (web-v2) — bridges the chat shell to audric's NeonDB.
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 2 P2.0c) ---
 *
 * Per D-9 lock ("stay on Prisma; translate template Drizzle queries"),
 * web-v2 reads/writes the SAME NeonDB as audric/web. The schema +
 * generated client are owned by audric/web (`apps/web/prisma/schema.prisma`
 * + `apps/web/lib/generated/prisma/`). Both schema and generated client
 * are committed to git, so web-v2 imports the generated client directly
 * via a relative cross-package reference.
 *
 * **Why no symlink, no postinstall, no `prisma` devDep:**
 * audric/web owns the schema lifecycle (migrations, generate). web-v2
 * is a transient migration target — it CONSUMES the generated client,
 * it does not regenerate. This avoids:
 *  - schema drift (web-v2 can't accidentally generate a different shape)
 *  - migration ownership confusion (one app owns it; the other reads)
 *  - postinstall failures during web-v2 ci runs
 *
 * The cross-package import (`../../web/lib/generated/prisma/client`) is
 * an intentional + temporary coupling. v0.7c Phase 6 cuts audric/web
 * over to web-v2; when web-v2 becomes the canonical app, the prisma
 * schema + generated client move into web-v2 in the same diff. Until
 * then, the relative import is correct.
 *
 * --- NEON SERVERLESS ADAPTER ---
 *
 * Mirrors audric/web's pattern (see `apps/web/lib/prisma.ts` for the
 * full incident write-up). Vercel + Neon: use the WebSocket driver
 * instead of pooled `pg` because the pool's TCP connections die quietly
 * between Vercel's lambda freeze/thaw cycles. The Neon adapter opens a
 * fresh stateless WebSocket per query — no pool, no dead connections.
 */

import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../../web/lib/generated/prisma/client";
import { env } from "./env";

/**
 * Re-export the Prisma namespace so consumers can access type helpers
 * (e.g. `Prisma.InputJsonValue`) without reaching into the generated
 * client directly. Same "intentional + temporary cross-package coupling"
 * rationale as the `PrismaClient` import above — v0.7c Phase 6 cutover
 * collapses the schema + generated client into web-v2.
 */
export { Prisma } from "../../web/lib/generated/prisma/client";

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
