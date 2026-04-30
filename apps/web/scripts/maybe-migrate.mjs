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
 *
 * Retry semantics (TD.4 — added 2026-04-30)
 * -----------------------------------------
 * `prisma migrate deploy` acquires a Postgres advisory lock with a
 * default timeout of 10s. On Neon, that timeout is regularly exceeded
 * during cold-start wake-ups or when a previous deploy's connection
 * orphaned the lock. We hit `P1002` ("timed out trying to acquire a
 * postgres advisory lock") 3× in 24h on 2026-04-30 — including for
 * deploys whose code change had nothing to do with the schema (e.g.
 * a single-line UI revert, commit `cc2c9ea`).
 *
 * The fix is to retry. `prisma migrate deploy` is idempotent — if
 * migrations 1..N are applied and N+1 fails, retrying picks up at N+1.
 * We retry up to 3 times with 5s/15s/30s backoff (50s total budget).
 * On the third failure we still abort the build (preserves the
 * fail-closed semantic — we never ship code expecting a schema that
 * isn't there). On any successful attempt we log the attempt count so
 * a flaky-Neon trend is visible in build logs.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

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

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5_000, 15_000, 30_000];

function runMigrate() {
  const result = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

let lastExitCode = 0;
let succeededOnAttempt = 0;

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(
    `[maybe-migrate] VERCEL_ENV=production, applying pending migrations (attempt ${attempt}/${MAX_ATTEMPTS})…`,
  );

  lastExitCode = runMigrate();

  if (lastExitCode === 0) {
    succeededOnAttempt = attempt;
    break;
  }

  if (attempt < MAX_ATTEMPTS) {
    const waitMs = BACKOFF_MS[attempt - 1];
    console.warn(
      `[maybe-migrate] attempt ${attempt} exited with code ${lastExitCode} — retrying in ${
        waitMs / 1000
      }s (likely Neon cold-start / advisory-lock contention; see TD.4 in build tracker)`,
    );
    await sleep(waitMs);
  }
}

if (succeededOnAttempt === 0) {
  console.error(
    `[maybe-migrate] all ${MAX_ATTEMPTS} attempts failed (last exit code ${lastExitCode}) — aborting build`,
  );
  process.exit(lastExitCode);
}

if (succeededOnAttempt > 1) {
  console.log(
    `[maybe-migrate] migrations applied successfully on attempt ${succeededOnAttempt}/${MAX_ATTEMPTS} (recorded for trend tracking)`,
  );
} else {
  console.log('[maybe-migrate] migrations applied successfully');
}
