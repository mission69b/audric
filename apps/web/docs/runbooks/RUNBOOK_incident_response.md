# Runbook: Security Incident Response

> Established 2026-05-14 from SPEC 30 Phase 1C. The first time we'll
> use this in anger is the second incident; this file exists so that
> response is muscle memory, not a panic-driven invention.

**Scope.** External vulnerability reports against `audric.ai`,
`mpp.t2000.ai`, the t2000 packages on npm, or the GitHub repos
(`mission69b/audric`, `mission69b/t2000`). Both bug-bounty-style
disclosures and accidental discovery (e.g. a journalist, a competitor's
audit) follow the same playbook.

**Out of scope.** Internal bug reports, CodeQL alerts (those have their
own triage in SPEC 30 Phase 1B), Dependabot CVEs (auto-PR'd).

---

## Step 0 — When a report arrives

Reports come in via:

1. **GitHub Security Advisories** — `audric/security/advisories/new`
   (preferred path; surfaces in the Security tab).
2. **`security@t2000.ai`** — listed in `apps/web/public/.well-known/security.txt`.
3. **DM / informal** — happens; treat the same as formal channels.

**Acknowledge within 2h.** A two-line reply ("got it, looking now,
will update by EOD") is enough. Silence is the worst response.

---

## Step 1 — Triage (target: 24h)

1. **Reproduce.** Don't trust the report blind; the reporter's PoC
   may not match what's actually live (different deployment, different
   user role, etc.).
2. **Classify severity.**
   | Tier | Trigger | Response window |
   |---|---|---|
   | P0 | Direct fund theft / impersonation / mass IDOR | < 24h to ship structural fix |
   | P1 | User-private data leak / auth bypass / cache poisoning | < 72h |
   | P2 | Aggregate data leak / hardening gap / missing defense-in-depth | < 1 week |
   | P3 | Theoretical / requires unrealistic preconditions | next sprint |
3. **Containment first, then fix.** If P0 and a structural fix is
   not 24h-shippable, deploy a stop-gap: feature-flag the route, IP
   block, or temporary 503 — buy time. Don't ship a half-fix that
   the reporter then has to re-validate.

---

## Step 2 — Fix + Self-review

1. **Branch off `main`.** Don't ship straight to `main` for security
   fixes — keep the diff readable for post-mortem.
2. **Add a regression test BEFORE the fix.** Test must reproduce the
   exploit, fail on current code, pass on the fix. This is the only
   thing that prevents recurrence at refactor time. Use the smoke
   matrix pattern in `audric/__tests__/spec30-idor-regression.test.ts`
   as the template for IDOR/auth tests.
3. **Self-review the diff THREE times before merge:**
   - **Read 1**: does it fix the reported bug?
   - **Read 2**: does it leave any neighbour route with the SAME bug
     class? (SPEC 30 Phase 1A.6 was caught at this step — pre-commit
     review surfaced 6 routes that 1A.5 missed.)
   - **Read 3**: does it introduce a new bug class? (SPEC 30 Phase
     1A.7 was prod-found because Phase 1A.5/1A.6 swapped from
     `decodeJwt` → `jose.jwtVerify` which enforces `exp` — every
     authenticated user older than 1h got 401'd. Read 3 should ask
     "what semantics changed?")
4. **Run the smoke matrix in production after deploy.** SPEC 30 Phase
   1A.8 was caught at this step (the smoke fired at the cache-poisoning
   bug that the unit tests couldn't see, because Vercel's CDN doesn't
   exist in tests).

---

## Step 3 — Notify (within 48h of fix shipping)

1. **Reporter.** Email or GitHub Advisory comment confirming fix +
   timeline + thanks. Per D-4 (no formal bounty program), recognition
   is the only reward — name them in the public advisory if they
   consent.
2. **Public advisory.** New file at
   `apps/web/SECURITY_ADVISORY_<YYYY-MM>-<SHORT-NAME>.md`. Linked from
   `/security` page on `audric.ai`. Template at end of this runbook.
3. **Internal post-mortem.** New file at
   `apps/web/POST_MORTEM_<YYYY-MM>-<SHORT-NAME>.md`. NOT linked from
   the public site — captures the engineering-side learnings without
   second-guessing the reporter's framing.

---

## Step 4 — Post-mortem (within 1 week)

**Format: 1 page, ~600 words. Don't over-engineer this.**

Sections:
1. **What happened.** Plain-language description.
2. **Timeline.** UTC timestamps from report → fix shipped.
3. **Why it wasn't caught earlier.** What CI / review / smoke missed.
4. **What we changed.** Specific commits, regression tests, lints.
5. **What we'll do differently.** Process tweaks, not vague aspirations.

**The post-mortem is blameless.** This is engineering hygiene, not
performance review. The whole point is to make the same bug class
impossible-by-construction next time.

---

## Step 5 — Update this runbook

After every incident, update this file:
- Add a "Lessons" entry to the bottom of the Lessons section.
- Update the severity table if the incident introduced a new tier.
- Update the smoke matrix template if the smoke missed something.

---

## Public advisory template

```markdown
# Security Advisory <YYYY-MM>-<SHORT-NAME>

**Affected.** <product / API / package>
**Reported.** <date> by <reporter or "internal review">
**Fixed.** <date> in commit <sha>
**Severity.** <P0 | P1 | P2 | P3>
**Status.** Resolved.

## What happened

<2-3 sentences plain-language>

## Was anyone affected?

<exploitation evidence: yes/no/unknown + details>

## What we did

<bullet list of structural fixes>

## What you should do

<usually: nothing; or: re-login if JWT expired, etc.>

## Recognition

<reporter name + link, with consent>
```

---

## Lessons (chronological)

### 2026-05 IDOR + cache + JWT-expiry class (SPEC 30)

- **Layered fixes work.** 4 phases (1A → 1A.8) each caught a different
  failure mode in the same surface. One PR doing all 4 would have been
  unreviewable. The smoke matrix (post-deploy, against prod) caught
  what unit tests structurally cannot.
- **Self-review caught 6 misses.** Phase 1A.6 wasn't planned — it came
  out of pre-commit Read 2. The CRITICAL `permissionPreset` POST
  money-loss vector would have shipped without it. Read 2 is mandatory.
- **Cache headers are an auth boundary too.** `Cache-Control: public,
  s-maxage` on an auth-gated route is equivalent to no auth. Added
  `__tests__/spec30-cache-header-regression.test.ts` to prevent the
  pattern from re-landing.
- **JWT-exp ≠ session-exp.** zkLogin sessions have a Sui-epoch expiry
  (~7d) AND an underlying Google JWT expiry (~1h). `useZkLogin` now
  enforces both; pre-fix only the longer one was checked.
