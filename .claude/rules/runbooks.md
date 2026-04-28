# Runbooks (apps/web)

Operational runbooks. Read before acting on the corresponding incident class.

## zkLogin env-var parity

**File:** `apps/web/RUNBOOK_zklogin_env_parity.md`

**Run when:**
- Rotating Google OAuth credentials.
- Adding a new Vercel environment.
- A user reports "EMAIL IS ALREADY REGISTERED TO ANOTHER ACCOUNT" (the 409 from `/api/user/email`).

**Why it matters.** zkLogin derives the Sui address deterministically from `(Google sub + JWT aud + Enoki app)`. If `NEXT_PUBLIC_GOOGLE_CLIENT_ID` differs between deployments, the same Gmail account produces different Sui addresses, and existing users get locked out of their wallets.

## Portfolio regression matrix

**File:** `PORTFOLIO_REGRESSION_MATRIX.md`

**Run when:**
- Changing `lib/portfolio.ts` or `lib/portfolio-data.ts`.
- Bumping `@t2000/engine` to a new version that touches BlockVision or DeFi aggregation.
- Investigating an SSOT regression (different surfaces showing different numbers for the same wallet).

A test wallet matrix that asserts identical numbers across:
- `balance_check` (engine)
- `portfolio_analysis` (engine)
- `/api/portfolio` (audric)
- `FullPortfolioCanvas` render
- Settings → Portfolio screen

If any cell disagrees, **stop.** Don't ship until it's green.

## BlockVision degradation

**Symptom:** Multiple users report "the LLM thinks I have no DeFi positions" or wallet totals look wrong.

**Steps:**
1. Check Vercel logs for `[blockvision] 429` spam → BlockVision rate-limited. Engine's circuit breaker opens automatically; outage usually self-recovers in 30s–5min.
2. Confirm `BLOCKVISION_API_KEY` is non-empty in production: `pnpm vercel env pull .env.tmp --environment=production --yes && grep BLOCKVISION .env.tmp`.
3. If the env var is empty/whitespace, the boot gate (`lib/env.ts`) should have prevented the deploy from going live. If it shipped, that's an env-validation-gate regression — `.cursor/rules/env-validation-gate.mdc` exists to prevent this.
4. If BV is genuinely down for >15 min, file an incident with BlockVision support and badge the affected canvas as "approximate values."

## Resume regression (Spec 1)

**Symptom:** Users report "Audric forgets I just sent / saved / swapped X."

**Steps:**
1. Query `prisma.turnMetrics.count({ where: { pendingActionOutcome: 'resume_failed' } })` — has the rate climbed?
2. Bisect by `engineVersion` — find when it climbed.
3. Verify the resume route is keying on `attemptId` (not `(sessionId, turnIndex)`).
4. Verify `/api/engine/chat` is persisting `attemptId` on the TurnMetrics row at chat-time.
5. Reproduce locally with a small turn that yields a pending action.

See `.cursor/rules/write-tool-pending-action.mdc` for the full protocol.

## Cron job failure

**Symptom:** Cron CloudWatch logs show `errors > 0` for a `/api/internal/*` endpoint.

**Steps:**
1. Check the audric Vercel function logs for the corresponding endpoint — find the stack trace.
2. Check if it's a transient (429 / 503 / Sui RPC timeout) — retry tomorrow may resolve.
3. If it's an idempotency violation (unique constraint, duplicate row), the endpoint isn't using upsert correctly. Fix at the root.
4. If it's a sharding hash mismatch, verify the t2000 cron is sending `{ shard, total }` and audric is filtering correctly.
