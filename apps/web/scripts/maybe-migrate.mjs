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
 * Retry semantics (TD.4 — added 2026-04-30, budget bumped 2026-05-04)
 * -------------------------------------------------------------------
 * `prisma migrate deploy` acquires a Postgres advisory lock with a
 * Prisma-side timeout of 10s (not configurable via the CLI). On Neon,
 * that timeout is regularly exceeded during cold-start wake-ups OR
 * when a previous deploy was killed mid-migrate and orphaned the lock
 * (Postgres only releases the lock when the holding session
 * disconnects, which on Neon's pooler can take several minutes via
 * idle-connection TCP timeout).
 *
 * History
 * - 2026-04-30: Hit `P1002` 3× in 24h, including a single-line UI
 *   revert (commit `cc2c9ea`). Initial fix: 3 attempts, 5s/15s/30s
 *   backoff, 50s total budget.
 * - 2026-05-04: Hit P1002 again on commit `7592344` (BlockVision
 *   telemetry — schema-touchless code change). All 3 attempts failed
 *   in ~53s. Retriggered via empty commit `d426bb5` and the next
 *   deploy succeeded first try. Pattern: lock contention can persist
 *   beyond our 50s budget (orphaned lock case, not just cold-start).
 *   Bumped to 5 attempts with 5s/15s/30s/60s backoff between attempts
 *   (110s total wait + ~50s of Prisma's own per-attempt timeouts ≈
 *   2.7min end-to-end budget). Still well inside Vercel's 45min build
 *   limit. The 60s tail intentionally pushes the final retry past
 *   Neon's typical idle-connection TCP timeout window so an orphaned
 *   lock from a killed earlier deploy has time to release.
 *
 * The fix is to retry — `prisma migrate deploy` is idempotent (if
 * migrations 1..N are applied and N+1 fails, retrying picks up at
 * N+1). On final failure we still abort the build (preserves the
 * fail-closed semantic — we never ship code expecting a schema that
 * isn't there). On any successful attempt we log the attempt count so
 * a flaky-Neon trend is visible in build logs.
 *
 * What we deliberately do NOT do: forcibly break the advisory lock
 * (e.g. `pg_advisory_unlock_all()` from a side connection). If a
 * legitimate concurrent migrate is mid-flight, breaking its lock
 * would race the migration table writes. Better to fail loudly after
 * an extended retry budget and let a human investigate than to
 * silently corrupt a partial migration.
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

const MAX_ATTEMPTS = 5;
// Sleep happens between attempts only (not after the last), so this has
// MAX_ATTEMPTS - 1 entries. Total wait budget: 5+15+30+60 = 110s, plus
// ~5×10s of Prisma's own lock-acquisition timeouts ≈ 160s end-to-end.
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

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
