# Security Advisory 2026-05-IDOR

**Affected.** `audric.ai` web app — API routes under `/api/portfolio`,
`/api/positions`, `/api/activity`, `/api/history`, `/api/swap/quote`,
`/api/analytics/*`, `/api/user/*`.
**Reported.** 2026-05 by an external researcher via GitHub Security
Advisory + initial probing.
**Fixed.** 2026-05-14 in commits across audric `@audric` repo
(structural fix shipped, smoke verified in production).
**Severity.** P1 (user-private data leak + one P0 sub-class:
`permissionPreset` mutation by attacker).
**Status.** Resolved. No exploitation observed in logs.

## What happened

A class of API routes on `audric.ai` was missing server-side
authentication enforcement. Three sub-classes were identified across
the response:

1. **IDOR (Insecure Direct Object Reference) on read routes.** Any
   address could be passed as a query parameter (`?address=0x…`) to
   12 read-only endpoints (portfolio, positions, activity, analytics).
   The endpoints would return that wallet's data without verifying
   the requester owned the wallet or had explicitly added it to a
   watch list.
2. **Forgeable auth header on user-namespace routes.** 6 endpoints
   under `/api/user/*` (preferences, memories, financial-profile,
   watch-addresses, contacts/backfill) trusted a client-supplied
   `x-sui-address` HTTP header to identify the caller. An attacker
   could spoof this header to read or modify another user's settings.
   The most severe case was POST `/api/user/preferences`, where an
   attacker could set a victim's `permissionPreset` to `aggressive` —
   raising the auto-execute USD thresholds for swap/save/send and
   setting up a money-loss vector if the victim then chatted with the
   agent.
3. **CDN cache-poisoning on `/api/portfolio`.** The route correctly
   enforced authentication after the IDOR fix shipped, but emitted
   `Cache-Control: public, s-maxage=15`, which instructs Vercel's
   CDN to cache and serve responses to ANY caller for 15 seconds
   regardless of headers. Anyone could fetch a cached authenticated
   response within the 15s window.

A fourth issue was self-found during the response: after the IDOR fix
swapped JWT validation from "decode-only" to full
signature-and-expiry verification (`jose.jwtVerify`), the client-side
session check was not updated to track the underlying Google JWT's
1-hour expiry. Authenticated users with sessions older than 1 hour
received 401s on every API call until they re-logged-in.

## Was anyone affected?

**No exploitation observed.** Vercel access logs from the past 30 days
were reviewed for the exploit patterns (anomalous `?address=` query
parameters across owners, anomalous `x-sui-address` header values,
unauthenticated 200 responses on `/api/portfolio`). No matches.

The reporter's PoC was the only confirmed access. The reporter has
been notified that the fix is live.

The CDN cache-poisoning was caught during the post-deploy smoke matrix
on 2026-05-14, before any third-party probing of the route was
observed. Window of exposure: ~2 hours between the IDOR fix going live
and the cache-header fix landing.

## What we did

Structural fixes shipped across 4 phases, all on 2026-05-14:

- **Phase 1A.5** — `assertOwnsOrWatched` server-side auth helper
  applied to 12 read routes; `authFetch` client wrapper applied to
  9 fetch sites; 12 IDOR regression tests added.
- **Phase 1A.6** — `authenticateRequest` + `assertOwns` applied to 6
  `/api/user/*` routes; forgeable `x-sui-address` header eliminated
  from all user-namespace routes; 4 client fetch sites migrated to
  `authFetch`; 6 IDOR regression tests added including the CRITICAL
  `permissionPreset` POST.
- **Phase 1A.7** — `isJwtExpired` check added to client-side
  `useZkLogin`; sessions older than 1h are auto-flagged as expired
  and trigger re-login; 8 unit tests added covering valid/expired/
  malformed JWTs.
- **Phase 1A.8** — `Cache-Control: public, s-maxage=15` changed to
  `private, max-age=15` on `/api/portfolio`; cache-header regression
  test added (`spec30-cache-header-regression.test.ts`) to prevent
  the pattern from re-landing on any auth-gated route.

Total: 36 routes secured, 2,978 unit tests passing,
production smoke matrix passing.

## What you should do

**For users:** Nothing. If you were using the app during the issue
window and saw unexpected 401s, log in again — that was the
JWT-expiry fix forcing a re-authentication. Your wallet, balance,
and on-chain data were unaffected throughout (the issue was about
visibility of read-only data, not write authorization at the chain
layer; every transaction still required your tap-to-confirm via
zkLogin signing).

**For self-hosters / forkers:** Pull the fixes. The canonical patterns
are documented in
`audric/.cursor/rules/single-source-of-truth.mdc` and the
`assertOwnsOrWatched` helper in `audric/apps/web/lib/auth.ts`.

## Recognition

The reporter elected to remain anonymous. We're grateful for the
disclosure and the patience during the layered fix. If you'd like
public credit on a future issue, please tell us when you report.

## More

- Engineering post-mortem (process learnings): `POST_MORTEM_2026-05-IDOR.md`
- Incident response runbook (institutionalised process):
  `RUNBOOK_incident_response.md`
- Responsible disclosure: see `audric.ai/security` or
  `security@t2000.ai`.
