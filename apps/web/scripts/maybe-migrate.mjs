#!/usr/bin/env node
/**
 * Apply pending Prisma migrations on production Vercel builds, skip
 * everywhere else.
 *
 * Why this exists
 * ---------------
 * `apps/web/package.json` has had a `migrate` script (`prisma migrate
 * deploy`) since the project was created, but no Vercel hook ever
 * called it. Migrations were applied manually — until on 2026-04-27 the
 * `walletUsdsui` / `savingsUsdsui` columns got added to the schema, a
 * migration file landed in the repo, the prod deploy went out, and
 * every chat request started failing the `getUserFinancialContext`
 * Prisma read with P2022 ("column does not exist") because the
 * migration never ran against the prod DB.
 *
 * Wiring `prisma migrate deploy` into the build closes this gap: every
 * production deploy applies pending migrations *before* `next build`,
 * so a migration drift cannot survive a deploy.
 *
 * Why gate on production only
 * ---------------------------
 * Audric uses a single Neon DB shared across `Production`, `Preview`,
 * and `Development` Vercel environments (see `vercel env ls`). If we
 * ran migrations on every build, a feature-branch preview push with a
 * new migration would mutate the prod schema before the PR is even
 * reviewed — and if that migration is later reverted/edited, prod
 * would be wedged.
 *
 * `VERCEL_ENV === 'production'` is set on production deploys only —
 * `Preview` deploys get `'preview'`, local `vercel dev` gets
 * `'development'`. Local `pnpm build` has it unset, so this script is
 * a no-op there too.
 *
 * Failure semantics
 * -----------------
 * - Migration failure → exit non-zero → the build aborts. We'd rather
 *   keep running the previous deployment than ship an app whose
 *   Prisma client expects a schema the DB doesn't have.
 * - Missing `DATABASE_URL` on a production build → fail-fast (it's
 *   already a hard requirement of `lib/env.ts`, but failing here gives
 *   a clearer error in the build log).
 */
import { spawnSync } from 'node:child_process';

const isProductionDeploy = process.env.VERCEL_ENV === 'production';

if (!isProductionDeploy) {
  console.log(
    `[maybe-migrate] skipping prisma migrate deploy (VERCEL_ENV=${
      process.env.VERCEL_ENV ?? '<unset>'
    }, only runs on VERCEL_ENV=production)`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error(
    '[maybe-migrate] VERCEL_ENV=production but DATABASE_URL is missing — refusing to build a deploy that cannot connect to its DB',
  );
  process.exit(1);
}

console.log('[maybe-migrate] VERCEL_ENV=production, applying pending migrations…');

const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  console.error(
    `[maybe-migrate] prisma migrate deploy exited with code ${result.status} — aborting build`,
  );
  process.exit(result.status ?? 1);
}

console.log('[maybe-migrate] migrations applied successfully');
