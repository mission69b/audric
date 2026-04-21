# Audric Codebase Audit — Findings

**Date:** 2026-04-21
**Branch:** `claude/codebase-audit-review-NjTO2`
**Scope:** Full repo — apps/web (Next.js 15), brand/, patches/, root config

This report is the deliverable of a findings-only audit. Each finding was produced by an exploration agent and then spot-verified against the codebase; verification notes are included where the agent's recommendation differed from ground truth.

Action tags:
- **[DELETE]** — verified safe to remove
- **[REFACTOR]** — worth simplifying, low risk
- **[KEEP-BUT-FLAG]** — leave as-is, but worth knowing
- **[INVESTIGATE-FURTHER]** — needs human judgement
- **[FALSE-POSITIVE]** — agent flagged it; verification shows no action needed

---

## Executive summary

Audric is a single-app Next.js 15 repo (apps/web) with 341 TypeScript files. The post-simplification state (S.5–S.22) is clean: no zombie features, schema is tight (15 live Prisma models, no orphans), all routes are live.

The audit agent's initial list of "safe cleanups" contained **significant errors** — several files it recommended deleting are intentional design artifacts per the project's own "Hard Rule 10". Verification trimmed the list substantially.

- **Verified safe cleanups applied in this PR:** 0 code deletions. (See Section 1 for what was considered and why none met the bar.)
- **Real cleanups worth considering (need your call):** ~3 — mostly around 106MB of brand video assets and a completed one-off script.
- **Agent false positives caught in verification:** 3 high-impact ones (the mock stubs, the navi patch, the "stale" engine-factory comment).

The main story: **you have not over-engineered audric.** The one flagged abstraction (`suggested-actions.ts`) is borderline but defensible. The rest of the codebase is appropriately sized for a Next.js app of this scope.

---

## 1. Verified safe cleanups considered

None of the agent's "safe" recommendations survived verification as pure deletes. The candidates and why each was rejected:

| Candidate | Agent rec | Verification result |
|---|---|---|
| `lib/mocks/activity.ts` | DELETE | **Intentional** — design stub per "Hard Rule 10 of IMPLEMENTATION_PLAN.md"; renders a UI surface the design shows until the backend catches up. |
| `lib/mocks/contacts.ts` | DELETE | **Intentional** — same Hard Rule 10 pattern, for contact notes UI. |
| `patches/@naviprotocol__lending@1.4.0.patch` | DELETE | **Required** — `pnpm-lock.yaml` shows `@naviprotocol/lending@1.4.0` as a transitive dep of `@t2000/sdk`. Deleting would break `pnpm install`. |
| `lib/engine/engine-factory.ts` line 197 comment | DELETE | **Decision documentation** — explains why `pendingProposals` is always `[]`; not a stale reference. |

The remaining candidates (videos, one-off script) are real cleanup opportunities but either (a) I don't want to auto-delete 106MB of marketing assets or (b) the decision has side effects. Listed in Section 2.

---

## 2. Real issues (not auto-fixed — need your call)

### [INVESTIGATE] `brand/weekly-*.{mp4,mov}` — 106MB of unreferenced video

- **Files:**
  - `brand/weekly-31.mov` — 41MB
  - `brand/weekly-recap.mp4` — 64MB
  - `brand/weekly-31-cream.mp4` — 2.0MB
  - `brand/weekly-recap-cream.mp4` — 2.7MB
  - `brand/weekly-recap-formatted.mp4` — 2.7MB
- **Verification:** zero references in source code or in `brand/social-assets.html`. Files were committed the same day as the rest of the repo.
- **Problem:** 106MB in `git` history means every clone pays that cost forever. The uncompressed `.mov` sources are especially wasteful — if you need these for marketing, they probably live on Drive/Dropbox already.
- **Recommended:** if these are weekly social-media assets that you re-generate, move them to external storage and `.gitignore` the pattern. If they're archival, same. Deleting them from the working tree removes them going forward but the git history still holds them — a `git filter-repo` or BFG pass would fully reclaim the space.
- **Not auto-applied because:** deleting marketing assets without confirming they live somewhere else is risky. Your call.

### [INVESTIGATE] `apps/web/scripts/send-simplification-comms.ts` — completed one-off

- **File:** `apps/web/scripts/send-simplification-comms.ts`
- **Verification:** header comment confirms this is the S.15 Appendix A email send, with idempotency via `scripts/.simplification-comms-sent.json`. If that JSON exists, the job has run.
- **Problem:** not harmful to leave, but it's a finished one-off with a clear "done" state. Git history preserves it.
- **Recommended:** delete the script and the idempotency JSON once you're sure the send is complete. Or move to `apps/web/scripts/archive/` if you want a pattern-reference for future migration comms.
- **Not auto-applied because:** you may want to keep it as a reference for future comms.

### [REFACTOR] `apps/web/lib/suggested-actions.ts` — borderline over-engineering

- **File:** `apps/web/lib/suggested-actions.ts` (~147 lines)
- **Called from:** only `UnifiedTimeline.tsx`.
- **Shape:** static `STATIC_FOLLOWUPS` map (10 entries) plus a `deriveWriteToolChips` switch (10 cases). Pure data with no algorithmic logic.
- **Problem:** the indirection doesn't earn its keep — a plain `Record<string, SuggestedAction[]>` used directly in the consumer would be ~half the lines and trivially grep-able.
- **Recommended:** flatten to a data table. Low risk because there's exactly one caller and types stay the same.
- **Not auto-applied because:** refactors deserve a more focused commit than a mass-cleanup PR.

### [INVESTIGATE] `apps/web/lib/intent-parser.ts` — 80% coverage, unclear usage %

- **File:** `apps/web/lib/intent-parser.ts` (~80 lines of regex matchers)
- **Problem:** the module's own comment says "Coverage: ~80% of typed inputs. Most users won't type at all (chips)." If real usage is dominated by chip clicks and LLM fallback, this is 80 lines of pattern-matching for <10% of traffic.
- **Recommended:** check analytics (how often does `parseIntent` return a match vs. miss?). Delete if `<5%` of input paths exercise it; keep if it's absorbing real user typing.
- **Not auto-applied because:** requires analytics data I don't have.

### [KEEP-BUT-FLAG] `apps/web/app/litepaper/page.tsx` + `litepaper.module.css`

- **Files:** `apps/web/app/litepaper/page.tsx`, `apps/web/app/litepaper/litepaper.module.css`
- **Problem:** not a problem mechanically — it's a marketing one-pager. But a consumer-app source tree isn't the natural home for a litepaper that rarely changes and has no product dependency. If you ever version it (v2 litepaper), having it alongside product code makes the diff noisy.
- **Recommended:** leave for now. When it needs a rewrite, consider moving to `t2000.ai`-adjacent marketing repo.

---

## 3. Agent false positives (verified — no action needed)

### [FALSE-POSITIVE] `lib/mocks/activity.ts` and `lib/mocks/contacts.ts`

- **Agent claim:** dead mock code, safe to delete.
- **Ground truth:** both files carry a clear header explaining they implement "Hard Rule 10 of IMPLEMENTATION_PLAN.md" — when the design shows a UI element with no data source, it ships as a typed mock stub with a `// TODO: wire to real source` marker. They're consumed by `ActivityFeed.tsx` and `ContactsPanel.tsx` to render the design surface today. Deleting them would break the UI.

### [FALSE-POSITIVE] `patches/@naviprotocol__lending@1.4.0.patch`

- **Agent claim:** `@naviprotocol/lending` is never imported directly; patch is dead.
- **Ground truth:** it's a transitive dep of `@t2000/sdk@0.40.4` (which audric does import directly). `pnpm-lock.yaml` confirms. The patch is applied at install time; deleting it would cause `pnpm install` to fail with a "referenced patch does not exist" error.

### [FALSE-POSITIVE] `app/api/internal/notification-users/route.ts`

- **Agent claim:** "single-purpose bridge" that could become orphaned.
- **Ground truth:** actively called by t2000 cron jobs (profile-inference, memory-extraction, chain-memory, portfolio-snapshot). The agent correctly noted this in its own investigation. Deleting would break four t2000 crons.

### [FALSE-POSITIVE] `engine-factory.ts` line 197 comment

- **Agent claim:** stale reference to deleted `ScheduledAction` table.
- **Ground truth:** the comment documents *why* `pendingProposals` is now always `[]` (the table was dropped, the path is retained as an empty array so callers don't need to handle `undefined`). This is exactly the kind of "WHY" comment that should exist and stay.

### [FALSE-POSITIVE] `CLAUDE.md` stale "Autonomous features" table

- **Agent claim:** CLAUDE.md contains a stale table describing deleted copilot/briefing/schedule features.
- **Ground truth:** re-reading the file, the old table has already been removed; the current "Silent intelligence layer (post-simplification)" section accurately describes the current architecture. Agent double-counted.

---

## 4. Confirmed healthy areas (not actions — observations)

- **Pages & routes.** All 13 pages and 45 API routes are live and have active implementations. No orphaned routes.
- **Prisma schema.** 15 models, all actively queried. Migration history shows 4 destructive drops that were executed cleanly; no leftover models.
- **Component tree.** 21 rich cards + 8 canvas cards, each unique. `ProductPage.tsx` is the correct shell-abstraction pattern (6 call sites, not duplication).
- **Dependencies.** All `package.json` entries are imported somewhere. `@cetusprotocol/aggregator-sdk` is used in `/api/swap/quote`. No zombie deps.
- **`.cursor/rules/`.** All 3 rules (design-system, usdc-only-saves, financial-amounts) are current and referenced.
- **Server vs client component split.** Spot-checked correctly — `'use client'` is applied where hooks/state are used, server components used where DB access happens.

---

## 5. Cross-repo note

Audric imports `@t2000/engine` and `@t2000/sdk` from npm. The canonical product docs (`audric-roadmap.md`, `audric-build-tracker.md`) live in the *t2000* repo — that is intentional and documented in t2000's `CLAUDE.md` as the Key Documents for feature planning and status checks. Not a defect.

---

## 6. Recommended next steps (ranked)

1. **Decide the fate of `brand/weekly-*.{mp4,mov}`.** 106MB of binary bloat is the single highest-value cleanup available. Move to external storage if possible.
2. **Delete `apps/web/scripts/send-simplification-comms.ts`** once you're certain the send is done.
3. **Flatten `suggested-actions.ts` into a data table** in a dedicated small refactor commit.
4. **Check usage of `lib/intent-parser.ts`** — delete if `<5%` traffic, keep otherwise.

No urgent issues. The core concern ("over-engineered, legacy, stale") is largely unfounded for audric — the simplification you already ran did its job.
