# Post-Mortem: SPEC 30 IDOR + cache + JWT-expiry class (2026-05-14)

> Blameless engineering post-mortem. Captures what went wrong in
> CI / review / process — not who. Public-facing summary lives in
> `SECURITY_ADVISORY_2026-05-IDOR.md`.

## Timeline (UTC)

| Time | Event |
|---|---|
| 2026-05 (early) | External reporter files initial GitHub Security Advisory describing IDOR on `/api/portfolio?address=` |
| 2026-05-14 ~14:00 | SPEC 30 v1.0 LOCKED — 12 D-questions resolved (10 locked + 2 deferred), Phase 1A + 1B already shipped |
| 2026-05-14 ~17:10 | Phase 1A.5 SHIPPED — `assertOwnsOrWatched` + `authFetch` + 12 read routes hardened + 9 client sites migrated |
| 2026-05-14 ~17:30 | Pre-commit Read 2 surfaces 6 `/api/user/*` routes still using forgeable `x-sui-address` header — Phase 1A.6 added unplanned |
| 2026-05-14 ~18:00 | Phase 1A.6 SHIPPED — 6 user-namespace routes hardened (incl. CRITICAL `permissionPreset` POST money-loss vector) |
| 2026-05-14 ~18:30 | Production deploy of 1A.5 + 1A.6 |
| 2026-05-14 ~18:35 | User reports app inaccessible (401 on every API call) — Phase 1A.7 self-found |
| 2026-05-14 ~18:50 | Phase 1A.7 SHIPPED — `isJwtExpired` enforces Google OIDC 1h TTL on client; auto-logout triggers re-login |
| 2026-05-14 ~19:05 | Production smoke matrix — `/api/portfolio` returns 200 without JWT (CDN cache-poisoning self-found) |
| 2026-05-14 ~19:20 | Phase 1A.8 SHIPPED — `Cache-Control: public` → `private` on `/api/portfolio` + regression test |
| 2026-05-14 ~19:30 | All smokes green; SPEC 30 v1.1 IMPLEMENTING |

Total response time from reporter notification → all sub-classes
fixed in production: ~24 hours.

## Why these bugs existed

**Root cause** is shared across all four sub-classes: the auth model
evolved organically without a centralised gate. Specifically:

1. The middleware at `audric/apps/web/middleware.ts` runs in
   "permissive mode" by design — it's there to populate
   `x-sui-address` from JWT for forgeable-header convenience; it does
   NOT enforce auth. Per-route enforcement was assumed.
2. As routes proliferated, "per-route enforcement" became
   "per-route eyeballed". Read routes that returned data based on a
   query-param address were assumed safe-by-virtue-of-being-read-only
   — wrong, because the data is private even if not mutated.
3. The forgeable `x-sui-address` header was a convenience pattern
   from early development (pre-zkLogin); it was never audited after
   zkLogin landed. The middleware-populated value was correctly
   derived from JWT, but routes ALSO accepted client-supplied values
   without distinguishing.
4. `Cache-Control: public, s-maxage=…` was added to the
   `/api/portfolio` route in an earlier performance optimisation —
   correct under the pre-fix unauthenticated model, dangerous under
   the post-fix authenticated model. The fix never re-audited cache
   semantics.
5. JWT decoding was using `decodeJwt` (no signature/exp check) for
   convenience until SPEC 30 forced full validation via
   `jose.jwtVerify`. The client-side session model was never updated
   to match.

## Why these bugs weren't caught earlier

**CI gaps:**
- No regression test for the IDOR class. CodeQL doesn't catch
  business-logic auth bypasses.
- No regression test for `Cache-Control: public` on auth-gated routes.
  This is now a lint, but should also be a structural test.
- No regression test for `x-sui-address` accepted as input. ESLint
  rule `no-forgeable-headers` could have caught this — added now.
- No production smoke matrix as part of CI. The 1A.8 cache-poisoning
  bug was structurally invisible to unit tests because Vercel's CDN
  doesn't exist in test environment.

**Review gaps:**
- Pre-1A.6 review didn't enforce "Read 2: same-class neighbours".
  When fixing one IDOR, the reviewer should check every route that
  shares the same shape (`?address=` query param, or
  `x-sui-address` header consumer). 1A.6 was caught at this step but
  only because the reviewer was the same engineer who shipped 1A.5
  and knew the pattern; in a normal multi-engineer flow it could
  have been missed.

**Process gaps:**
- No incident response runbook existed before this incident. The
  layered approach (1A.5 → 1A.8) was invented mid-incident. Worked
  out fine; would have been faster with a pre-defined playbook.
- No security-advisory template — the advisory text was drafted
  fresh.

## What we changed (commits)

- `assertOwnsOrWatched` helper centralises auth in
  `audric/apps/web/lib/auth.ts`.
- `authFetch` client wrapper centralises JWT-bearing requests in
  `audric/apps/web/lib/auth-fetch.ts`.
- `isJwtExpired` enforces Google OIDC TTL in
  `audric/apps/web/lib/zklogin.ts` + `useZkLogin.ts`.
- `Cache-Control: private` on every auth-gated route.
- 18 IDOR regression tests in
  `audric/apps/web/__tests__/spec30-idor-regression.test.ts`.
- 1 cache-header regression test in
  `audric/apps/web/__tests__/spec30-cache-header-regression.test.ts`.
- 8 JWT-expiry unit tests in
  `audric/apps/web/lib/zklogin-jwt-expiry.test.ts`.
- `RUNBOOK_incident_response.md` codifies the playbook for next time.

## What we'll do differently

**Process:**
1. Every security fix runs the 3-Read review (does this fix the bug?
   does the same bug class exist elsewhere? did this introduce a new
   bug class?). Already in the runbook.
2. Every fix ships with a regression test that fails on the bug and
   passes on the fix. Already in the runbook.
3. Production smoke matrix runs after every security deploy, NOT
   instead of unit tests. The smoke catches what unit tests
   structurally cannot (CDN, real Vercel runtime, real JWT lifetime).

**Structural:**
4. Cache-header lint: ESLint rule rejecting `Cache-Control: public` /
   `s-maxage` on any route file matching `app/api/**` unless
   explicitly allowlisted. (Follow-up; not urgent — the regression
   test covers the most-exposed route.)
5. Forgeable-header lint: ESLint rule rejecting
   `request.headers.get('x-sui-address')` outside the middleware
   itself. (Follow-up.)
6. SDK-style boundary on auth: every API route that touches
   user-private data MUST start with one of `authenticateRequest`,
   `assertOwns`, or `assertOwnsOrWatched`. Lint is the long-term
   answer; for now, the runbook + 3-Read review is the gate.

**Cultural:**
7. The reporter found this. Zero-bounty disclosures with patience for
   layered fixes are a gift. Recognition (with consent) is the only
   reward we can offer at this stage; document the path to that
   recognition in `/security`.

## What we did right

- Acknowledged the report within hours, not days.
- Shipped a structural fix (server-side auth helper), not a
  whack-a-mole patch on the reported route only.
- Caught 6 misses before merge via self-review (Phase 1A.6).
- Caught 2 self-found regressions (Phase 1A.7 prod-found, Phase 1A.8
  smoke-found) before any external probe.
- Layered the response so each phase was independently reviewable.
- Notified the reporter on each phase, not just at the end.
- Wrote this post-mortem same day.
