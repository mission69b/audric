import "dotenv/config";

import { defineConfig } from "prisma/config";

/**
 * Prisma 7 config — required because `datasource.url` is no longer
 * allowed in `schema.prisma`.
 *
 * Why we read `process.env` directly instead of prisma's `env()` helper:
 * the `env()` helper THROWS at config-load time if the variable is
 * missing, but `prisma generate` (which runs as `postinstall` in CI)
 * doesn't actually need a DB connection — it only generates the client
 * from the schema. Forcing every CI environment to set `DATABASE_URL`
 * just so `generate` can succeed adds a foot-gun for no benefit.
 *
 * The placeholder URL is intentionally invalid so any accidental
 * `prisma migrate ...` / `prisma db ...` invocation without a real
 * `DATABASE_URL` set fails with a clear connection error rather than
 * silently using a wrong DB.
 *
 * For Neon: prefer `DIRECT_URL` (non-pooled) for migrations. The
 * runtime client (`lib/prisma.ts`) uses `DATABASE_URL` (pooled) via
 * `@prisma/adapter-neon`'s WebSocket driver — this config only affects
 * the Prisma CLI.
 */
const PLACEHOLDER_URL =
  "postgresql://placeholder:placeholder@placeholder.invalid:5432/placeholder";

const migrateUrl =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? PLACEHOLDER_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: migrateUrl,
  },
});
