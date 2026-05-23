# 🚀 Next Agent Kickoff Prompt — Copy/Paste

> Paste the block below into a fresh Cursor agent session. It's calibrated for a fast pickup with zero archaeology.
> Authored 2026-05-23 ~15:50 AEST as the prior agent slowed.

---

## The prompt (copy from here)

```
You're picking up Audric mid-stream from a slowing agent. Read these in order before you write any code:

1. /Users/funkii/dev/audric/HANDOFF_NEXT_AGENT.md
2. /Users/funkii/dev/t2000/spec/SPEC_INVENTORY_SSOT.md
3. The most recent ~3 entries in /Users/funkii/dev/t2000/audric-build-tracker.md (search for S.275, S.274, S.273 — they reconcile the backlog).

Audric.ai serves apps/web-v2 end-to-end on @t2000/{sdk,engine}@2.17.0. v0.7c + v0.7d + v0.7e are all substantially shipped (most via S.253 apps/web archive 2026-05-22). The 7d soak gate closes 2026-05-28; the MemWal stability checkpoint is 2026-05-29. Both are now mostly cosmetic per the v0.7d phase audits (S.219 + S.220 + S.221).

The active backlog has 7 agent-ownable items in priority order. Pick #1 unless founder redirects:

1. S.274 — "Earns Its Keep" tool/feature audit (~1d audit + ~1d cuts).
   • Trigger: founder asked why we have BRAVE_API_KEY + web_search if we're a financial agent.
   • Same lens applies to skills, canvas templates (9), guards (14), crons (5), env vars.
   • Format: 1-page audit doc + 3 buckets (KEEP / CUT NOW / WATCH-with-telemetry) + 1 concrete recommendation. Use spec/archive/v07e/AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md as the shape reference.
   • Output target: t2000/spec/active/AUDIT_V07E_EARNS_ITS_KEEP_<date>.md.
   • Initial triage on 31 tools: 25 clearly KEEP, 6 SUSPECT (web_search + BRAVE_API_KEY · protocol_deep_dive · explain_tx · volo_stats + volo_stake + volo_unstake).
   • Read-only first pass. Surface findings to founder. Do not delete anything until founder picks scope from your recommendation.

2. S.272 — BlockVision/DeFi cron rate-limits (~1d, 3 levers).
   • Logs from the 02:30 UTC financial-context-snapshot cron show circuit breaker OPEN events + 9-protocol DeFi adapter HTTP 429 storms + AbortError flurries + final Vercel 300s timeout. ~6 user snapshots skipped per cron run.
   • Sticky-positive cache + circuit breaker prevent bad data poisoning user-facing chat. Cron-skip messages are observable.
   • 3-lever fix: (a) cron user-batching with intra-batch delay (10/5s instead of fanout); (b) per-adapter Retry-After header propagation to cache TTL; (c) AbortController coordination — when BV circuit opens, abort already-inflight DeFi calls for the same address.
   • Standalone SPEC needed before code touches.

3. PIPELINE-AUDIT-PHASE-2 (~4-5d).
   • Phase 1 audit shipped at t2000/spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md.
   • Recommended Phase 3 tracks: S1 split 2009-LoC blockvision-prices.ts into 6-7 files; S2 audit + collapse 3 audric lib/portfolio*.ts files; S3 wire canvases to usePortfolio SWR; S5 drop dead BV per-protocol normalizers.
   • Coordinate with S.272 since both touch blockvision-prices.ts.

4. B1 — Marketing landing shadcn redesign (~6-10h).
   • 15 components ported at S.253 (apps/web-v2/components/landing/) excluded from Biome lint.
   • L-4 lock applies (copy is legal-vetted, only UI changes).
   • Drop !components/landing from biome.jsonc once done.

5. SPEC 31 — CSP polish (~6-9h + 24-48h Report-Only soak).
   • Per spec/active/SPEC_31_SCOPING.md.
   • Founder triage required to lock SPEC scope before any code touch.

6. SPEC 39 — MCP remote migration (~1 week).
   • Deploy @t2000/mcp as remote HTTP-streamable MCP at mcp.t2000.ai/api/mcp with OAuth (or zkLogin per Audric Passport alignment).
   • No SPEC doc exists yet. Founder triage to lock scope.

7. D8 — V07E_STALE_FINCONTEXT_WRITE_REFUSAL Phase 2 (~20 min impl + Prisma migration).
   • Cleanup tail of Phase 1 (S.242). The financial-context-snapshot cron still writes 2-3 dead Prisma columns nothing reads. ~6 wasted DB writes per user per day. No correctness impact.
   • Spec at t2000/spec/active/V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md. Q2 (migration timing) + Q3 (regression-test coverage) need founder lock first.
   • Lowest priority work in the list — slot any-time, no dependencies.

NOT a backlog item (RETIRED 2026-05-23): D7 first-session memory-reset banner. Founder formally retired the D-14 mitigation — cold-start window has been live since 2026-05-21 with zero complaints, ½d engineering cost not justified. The TODO comment at apps/web-v2/components/settings/memory-section.tsx:16 should be deleted opportunistically next time you touch that file. v0.7d Phase 7 is now formally fully closed.

Two founder-owned smokes are pending verification (~5 min each):
- S.265-SMOKE: heatmap tooltip clamp on the right-most ~6 columns.
- S.266-SMOKE: Receive chip + receive_address canvas vs payment-link routing.

Founder ops still pending (NOT agent work):
- OPS-1 (5 min, 🔴 NOW): delete the audric-web Vercel project. It's domainless since 2026-05-22 but still firing 5 dead crons against prod Neon.
- OPS-2/3/4: ECS retire, Neon table drops, regression-swap CI re-port.

CRITICAL constraints to internalize:

A. apps/web is GONE (deleted S.253 2026-05-22). Schema + migrations + Prisma client live in apps/web-v2/prisma/. If a SPEC or doc references apps/web/<path>, run `rg "<path>" apps/web-v2/` first — most references are stale.

B. Header-based zkLogin auth, NOT cookies. Every authed fetch from a Client Component MUST forward useZkLogin().session.jwt via the x-zklogin-jwt header. Forgetting this is the most common P1 bug — surfaces as 401 on every read. Canonical pattern in apps/web-v2/components/settings/memory-section.tsx.

C. Server Actions are BANNED in web-v2. Biome rule + Vitest contract test enforce this. Server Actions silently strip custom headers (broke chat visibility toggle pre-S.269). Use API routes + authFetch instead.

D. Every required env var goes through lib/env.ts (Zod schema). Direct process.env.X reads are blocked by Biome. T2000_INTERNAL_KEY + AUDRIC_INTERNAL_API_URL are both requiredString — Vercel deploys fail loud if they're unset.

E. Engine release process: gh workflow run release.yml --field bump=patch (or minor/major). Never bump versions or run pnpm publish locally. The workflow bumps all 4 packages (sdk/engine/cli/mcp) together.

F. Verifiable goals before code. Every change must trace directly to the user's request — no "while I'm here" refactors, no speculative abstraction. See t2000/.cursor/rules/coding-discipline.mdc + goal-driven-execution.mdc.

G. The 4 Audric Intelligence systems (post-Block-A): Agent Harness · Reasoning Engine · Memory (MemWal) · AdviceLog. NOT 5. If a doc says 5, it's stale.

H. The 5 Audric products: Passport · Intelligence · Finance · Pay · Store. Don't add a 6th. Don't bring back Invest. See t2000/CLAUDE.md.

When you've finished item 1 (S.274), come back to founder with the read-only audit findings + recommendation. Don't proceed to cuts without explicit founder approval on scope. After S.274 ships, refresh SPEC_INVENTORY_SSOT.md + audric/HANDOFF_NEXT_AGENT.md per the refresh discipline at the bottom of the SSOT.

Ask the founder one clarifying question if anything's ambiguous. Otherwise: start S.274.
```

---

## Why this prompt

- **3 reads to fully oriented.** Handoff (current state) → SSOT (what's where) → tracker tail (what just shipped).
- **Numbered priority list, no ambiguity.** Agent doesn't have to figure out what to do first.
- **Constraints are concrete.** "apps/web is GONE", "Server Actions are BANNED", "header-based auth". The most common landmines have been called out so the agent doesn't step on them.
- **One starter task.** Item 1 (S.274) is read-only. Low blast radius. Surfaces findings to founder before any cuts. Good first move for a fresh agent.
- **Founder ops are explicitly NOT agent work.** Prevents the new agent from trying to "fix" OPS-1 by writing code.

## Operational notes for the founder

After pasting the prompt:
1. Watch for the agent's first move. It should read the 3 docs in order before writing anything.
2. If the agent asks about session length / older context, point them at the agent-transcript folder (`/Users/funkii/.cursor/projects/Users-funkii-dev-t2000/agent-transcripts/`) but tell them they don't need it — the handoff has everything.
3. The 2026-05-23 spec/ cleanup pass is DONE. 19 files moved to `archive/<version>/`, 1 stub deleted, SSOT updated. The next agent inherits a clean working set: 5 active files + 3 harness + 1 shipping. Refresh discipline (per the SSOT footer) kicks in only when the next ship-event lands.
