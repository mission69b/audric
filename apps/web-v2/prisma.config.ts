import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 config — required for `prisma migrate deploy` because the
 * `datasource.url` property is no longer allowed in `schema.prisma`.
 *
 * For Neon: prefer `DIRECT_URL` (non-pooled) for migrations and fall
 * back to `DATABASE_URL` if it's not set. The pooled URL works for
 * one-off migrations but Neon's docs recommend a direct connection for
 * schema operations to avoid pgBouncer prepared-statement issues.
 *
 * Runtime client (`lib/prisma.ts`) keeps using `DATABASE_URL` via the
 * `@prisma/adapter-neon` WebSocket driver — this config only affects
 * the Prisma CLI (`prisma migrate ...`, `prisma db ...`).
 */
const migrateUrlVar = process.env.DIRECT_URL ? "DIRECT_URL" : "DATABASE_URL";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env(migrateUrlVar),
  },
});
