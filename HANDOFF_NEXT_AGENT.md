# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> First written 2026-05-18 during v0.7c Phase 1; rewritten 2026-05-21 at v0.7d
> Phase 6 Block B close to reflect the MemWal migration as the active SPEC.

---

## 🎯 Active SPEC — v0.7d MemWal

[`t2000/spec/active/BENEFITS_SPEC_v07d.md`](../t2000/spec/active/BENEFITS_SPEC_v07d.md) — in flight; SHIPPED ahead of schedule.

The v0.7d SPEC retires the legacy SQL-backed memory pipeline (`UserMemory` + `UserFinancialProfile` + chain-classifier cron) and replaces it with `@mysten-incubation/memwal` vector memory. Phase 6 Block A + B closed in two consecutive sessions on 2026-05-21; Block C is the last remaining code work.

### Status snapshot (2026-05-21 ~16:30 AEST)

| Phase | SPEC budget | Actual | Status | Where it landed |
|---|---|---|---|---|
| 0 — Baseline + D-lock | ~1d | ~1h | ✅ CLOSED | S.214 |
| 1 — Adapter + engine wire | ~1d | ~1h 45m | ✅ G2 PASSED | S.215 + S.216 |
| 2 — Recall non-empty | ~½d | ~40m | ✅ G3 PASSED | S.217 |
| 3 LITE — Settings Memory UI | ~2d | ~35m | ✅ G4 PASSED | S.218 |
| 4 — Classifier migration | ~2d | ~10m audit | ✅ FOLDED into Phase 6 | S.219 |
| 5 — SPEC 40 HITL native | ~3d | ~25m audit | ✅ FOLDED into v0.7e | S.220 |
| 6 Block A — Memory pipeline retirement | part of ~2d | ~1h 45m + ~30m post-ship review | ✅ G10 PARTIAL | S.221 |
| 6 Block B — Vercel cron migration + structural vercel.json fix | part of ~2d | ~45m impl + ~15m smoke | ✅ G10 SMOKE GREEN (soak skipped per founder lock; subsumed by Block C wholesale delete) | S.222 |
| 6 Block C.1 — `t2000.ai/api/stats` refactor (Prisma → static + Sui RPC) | part of ~2d | ~35m | ✅ SHIPPED | S.223 (t2000 `8aa394e4`) |
| 6 Block C.2 — `apps/server` + `infra/` + Prisma stack wholesale delete | part of ~2d | ~50m | ✅ SHIPPED — **42 files deleted, −3,804 LoC net** | **S.224 (t2000 `5e04154f`)** |
| 6 Block C.3 — Dead receiver routes + docs + v0.7e+ backlog stamps | part of ~2d | ~45m | ✅ SHIPPED — **6 dead `/api/internal/*` routes deleted, env doc consolidated, 2 new backlog rows** | **S.224 (this session, audric commit TBD)** |
| 7 — Cutover + 7d soak | ~7d | TBD | ⏳ NEXT — audit-first | — |
| 8 — v0.7e unblock | ~½d | TBD | ⏳ | — |
| **Code time so far** | **~12d budget** | **~9h 30m actual** | **Ahead by ~10.5 days** | — |

Three audit-saves in one day (Phases 4 + 5 + Block A revision) compressed the SPEC budget by ~7 days. The pattern: v0.7d was scoped before v0.7c chat-flip + S.173 intent-dispatcher lock + the chain-memory statistical refactor + the AI SDK v6 HITL migration closed. Each phase audit collapses 2-3 days of stale SPEC work into minutes-to-hours of focused deletion. **Continue audit-first cadence on Block C + Phase 7.**

---

## ⏭️ What's left — clear next tasks

### 1. ✅ DONE — Block B + Block C (all 3 sub-blocks) shipped 2026-05-21

Block B soak was **skipped** per founder lock (S.224, 2026-05-21 ~16:00 AEST). Justification: ECS cron deletion was subsumed by Block C.2 wholesale `apps/server` delete, so dual-write conflict risk became moot (only one writer remains: the Vercel cron). Block C audit-first confirmed all indexer-owned Prisma models had zero non-`apps/server` consumers + 6 of 7 `/api/internal/*` routes had zero callers.

| Step | Status | Where |
|---|---|---|
| Block B step 4 — retire ECS cron job files | ✅ SUBSUMED by Block C.2 wholesale delete | S.224 t2000 `5e04154f` |
| Block C.1 — `/api/stats` refactor | ✅ SHIPPED (Sui RPC + static marketing) | S.223 t2000 `8aa394e4` |
| Block C.2 — `apps/server` + `infra/` + t2000 Prisma stack delete | ✅ SHIPPED (42 files, −3,804 LoC) | S.224 t2000 `5e04154f` |
| Block C.3 — 6 dead `/api/internal/*` route deletes + docs + backlog stamps | ✅ SHIPPED | S.224 audric `a6a17e8` + t2000 `2d031d2b` |
| Founder ops: retire ECS task defs + ECR repos + ALB | ⏳ founder action via AWS console | — |
| Founder ops: drop indexer NeonDB tables (Position / Transaction / ProtocolFeeLedger / IndexerCursor / YieldSnapshot + Agent.lastSeen) | ⏳ founder action via Neon console | — |

### 2. Phase 7 — cutover + 7d soak (NEXT IMPLEMENTABLE)

Per BENEFITS_SPEC_v07d L530+. **Audit-first cadence required** — read the SPEC's Phase 7 section, then verify what's actually still in `apps/web` vs what the SPEC assumes. Phases 4 / 5 / Block A / Block C each compressed multi-day SPEC budgets into ~hours of audit-driven work; expect Phase 7 to follow the same pattern.

### 3. Phase 8 — v0.7e unblock (~½d)

Per BENEFITS_SPEC_v07d. Sets up the v0.7e SPEC which archives all of `audric/apps/web` (the legacy chat shell). Two new backlog rows landed in S.224 that should be SPEC'd into v0.7e+:
- `engine-fn-injection-refactor` (~1-2d) — eliminate engine→audric HTTP self-fetches via function injection. Removes the v0.7d-load-bearing `T2000_INTERNAL_KEY` env var bridge.
- `engine-internal-key-final-delete` (~30 min) — finalize env var retirement once function injection ships.

See the backlog table below for full descriptions.

---

## 🚨 Block B side-finding — backlog item to investigate

**`fincontext-zero-bug-backlog` (P2, NOT urgent).** Pre-existing bug (predates Block B; ported from ECS as-is).

**Symptom:** The financial-context-snapshot cron writes all-zero rows (`walletUsdc=0, walletUsdsui=0, savingsUsdc=0, savingsUsdsui=0, healthFactor=null`) for users whose `PortfolioSnapshot` row for the same day had real positive numbers.

**Root cause:** The fin-ctx job consumes different fields of the `Portfolio` shape than the portfolio-snapshot job:
- portfolio-snapshot uses `walletValueUsd` + `positions.savings` (top-line aggregates — populated even on partial degradation)
- fin-ctx uses `walletAllocations.USDC` + `positions.supplies.find(s => s.asset === 'USDC')` (detail breakdowns — empty when the source returns degraded)

If BlockVision degrades partway through the per-user loop, the detail side returns empty while the top-line side stays positive. The fin-ctx job writes zeros without checking degradation flags.

**Fix (when you get to it):** Gate the upsert on `portfolio.walletSource !== 'degraded'` AND `portfolio.defiSource !== 'degraded'`, OR adopt the sticky-positive cache pattern from `packages/engine/src/cache/defi.ts`. Code lives at `apps/web/lib/jobs/financial-context-snapshot.ts`.

**Not blocking v0.7d close.** Surfaces because Block B's smoke was the first end-to-end verification of the cron in ~7 days. Schedule as a separate hotfix after Block C.

---

## 🚧 Block B structural fix — KNOW THIS BEFORE TOUCHING `vercel.json`

**The Vercel project (`prj_YD47kPlh4PAH8YaaA02bXi1w4KkR`) has `Root Directory: apps/web` per project settings.**

This means `vercel.json` MUST live at `apps/web/vercel.json`, NOT at the repo root. Adding a `vercel.json` at the repo root looks correct in git but Vercel silently ignores it.

**How this bit us in Block B:** the pre-Block-B `vercel.json` had lived at `/audric/vercel.json` since the day it was created. ALL 5 cron entries (the 3 long-standing retention/sweep jobs + the 2 Block B snapshot crons) had been silently never registered with Vercel cron. The `stale-fincontext-backlog` item that had been open for ~7 days was the first visible symptom (a row that should have refreshed daily was 169h stale).

**Validation commands (run any time you touch `vercel.json`):**

```bash
cd /Users/funkii/dev/audric
vercel project inspect  # Confirms Root Directory == "apps/web"
vercel crons list       # Ground-truth of what's actually registered
```

If `vercel crons list` returns "No cron jobs found" but you have a `crons:` array in your config, the file is at the wrong layer.

The same root-directory rule applies to `next.config.js`, `tsconfig.json` overrides, env-file scoping, etc. Always confirm `Root Directory` in `vercel project inspect` before placing config files.

---

## 📋 v0.7d backlog items (carry forward to next session)

| Item | State | Owner |
|---|---|---|
| `stale-fincontext-backlog` | ✅ CLOSED 2026-05-21 (S.222) via vercel.json fix | — |
| `fincontext-zero-bug-backlog` | OPEN (P2, ~30 min hotfix) | Post-Block-C |
| `ai-gateway-userid-backlog` | OPEN (P3, ~10 min) — wire userId tag into AI Gateway `gateway()` wrapper for per-user cost attribution | Post-v0.7d |
| `v07e-backlog` | OPEN (~3-5d) — persistent chat sessions (save transcripts + sidebar history + click-to-resume + delete + visibility). **Drafted AFTER v0.7d Phase 8 G12 closes.** Storage decision (drizzle-migrate vs prisma-rewrite) deferred to v0.7e drafting. See also `engine-fn-injection-refactor` + `engine-internal-key-final-delete` below — both natural follow-ons that land alongside (or before) the v0.7e chat-session work. | v0.7e |
| `stats-route-wallets-null-backlog` | **NEW** OPEN (P3, ~20 min, t2000 repo) — `https://t2000.ai/api/stats` returns `wallets: null` consistently; live Sui-RPC sub-fetch in `getWalletBalances()` throws and the catch is silent. Page renders 200 (graceful degradation by design). Add `console.error(err)` to the catch in `apps/web/app/api/stats/route.ts:64`, redeploy, read Vercel logs, fix root cause. Direct curl against `fullnode.mainnet.sui.io` proves the RPC + addresses are valid — Vercel-side runtime issue suspected. | Anytime |
| `engine-fn-injection-refactor` | **NEW** OPEN (P3, ~1-2d) — eliminate engine→audric HTTP self-fetches by injecting audric `lib/*` functions directly into the engine via `ToolContext`. Today the engine calls `fetch('${AUDRIC_INTERNAL_API_URL}/api/portfolio?…', { headers: { 'x-internal-key': … } })` for analytics SSOT; same Next.js process, same memory, full HTTP round-trip + auth dance. Function injection removes the HTTP boundary, the `x-internal-key` header, the `AUDRIC_INTERNAL_API_URL` env var, and the in-process self-fetch latency tax. Touchpoints: `packages/engine/src/audric-api.ts`, `packages/engine/src/tools/{spending,portfolio-analysis,yield-summary,activity-summary,receive}.ts`, engine `ToolContext` type, audric `engine-factory.ts` (replace `env: { AUDRIC_INTERNAL_KEY, AUDRIC_INTERNAL_API_URL }` with `audricApi: { getPortfolio, getHistory, … }` injection). Audit-first: confirm all 6 engine call sites + the 1 surviving `/api/internal/payments` route. Requires engine minor bump + audric `pnpm add` cycle. | v0.7e+ |
| `engine-internal-key-final-delete` | **NEW** OPEN (P3, ~30 min) — finalize the `T2000_INTERNAL_KEY` env var retirement once `engine-fn-injection-refactor` ships. Remaining consumers after function injection: ONLY `/api/internal/payments` (engine payment-link / invoice tools). At that point, port `/api/internal/payments` engine consumers to function injection too (same pattern as analytics), then delete `T2000_INTERNAL_KEY` from audric env schema (`apps/web/lib/env.ts`, `apps/web-v2/lib/env.ts`, `.env.example`), drop `validateInternalKey` from `apps/web/lib/internal-auth.ts` + `apps/web-v2/lib/internal-auth.ts`, delete `/api/internal/payments` route, drop `x-internal-key` branch from `authenticateAnalyticsRequest`. Depends on `engine-fn-injection-refactor`. | v0.7e+ |
| Phase 3.5 backlog | OPEN — full memory controls in `/settings/memory` (per-record delete via `MemoryStore.forget()`, "explain why this fact was recalled" provenance, recall-frequency ranking). Phase 3 LITE shipped a read-only top-K disclosure surface; controls deferred because MemWal SDK 0.0.4 doesn't expose the primitives | Post-v0.7d |

---

## 🔧 Where the v0.7d code lives (web-v2 = production traffic surface)

| Concern | File | Notes |
|---|---|---|
| MemWal client singleton | `apps/web-v2/lib/memwal.ts` | Fail-open if env vars unset; `_testCreateMemWalClient` factory for tests |
| Adapter (engine `MemoryStore` ↔ MemWal SDK) | `apps/web-v2/lib/audric/memwal-memory-store.ts` | ~60 LoC mechanical mapping |
| Per-turn recall closure | `apps/web-v2/lib/audric/memwal-prepare-step.ts` | Wired into `Experimental_Agent({ prepareStep })`; injects `<memory_recall>` at F-4 layer 3 |
| Per-turn write callback | `apps/web-v2/lib/audric/memwal-write-callback.ts` | Wired into `Experimental_Agent({ onFinish })`; fires `memwal.analyze` via Vercel `waitUntil()`; skips resume turns to avoid double-extraction |
| Settings disclosure UI | `apps/web-v2/components/settings/memory-section.tsx` + `app/api/memory/list/route.ts` | Reads `memwal.recall(BROAD_LIST_QUERY, 20, namespace)`; auth via `x-zklogin-jwt` header (NOT cookies) |
| System prompt assembly (post-Block-A) | `apps/web-v2/lib/audric/system-prompt.ts` | Now 4 layers, NOT 5. Layer 3 (memory) is injected by `prepareStep`, NOT this builder. Layers: 1 identity+advice → 2 financial context → 3 memory (via prepareStep) → 4 skill recipe gate |
| Vercel cron — portfolio-snapshot | `apps/web/app/api/cron/portfolio-snapshot/route.ts` + `apps/web/lib/jobs/portfolio-snapshot.ts` | GET + `Authorization: Bearer ${env.CRON_SECRET}` |
| Vercel cron — financial-context-snapshot | `apps/web/app/api/cron/financial-context-snapshot/route.ts` + `apps/web/lib/jobs/financial-context-snapshot.ts` | Same auth pattern; supports `?shard=N&total=M` for future fan-out |
| Vercel cron schedule | `apps/web/vercel.json` | **MUST be at `apps/web/vercel.json`, NOT repo root — see structural fix section above** |

**Tables permanently gone after Block A:**
- `prisma.userMemory.*` (replaced by MemWal vector recall)
- `prisma.userFinancialProfile.*` (replaced by MemWal `analyze` extraction)
- `apps/web/lib/chain-memory/*` directory (chain memory LOCKED to MemWal-only per founder; not rebuilt)

**Functions permanently gone:**
- `buildMemoryContext` + `MemoryEntry` interface (was in `apps/web-v2/lib/audric/moat-context.ts`)
- 3 `/api/internal/*` routes (profile-inference, memory-extraction, chain-memory)
- 2 `/api/user/memories/*` routes (legacy CRUD)
- 1 `/api/cron/user-memory-retention` route (no rows to retain)

---

## 📜 Phase 6 Block A + B forensics (for any future agent who confuses "5 systems" vs "4 systems")

Pre-Block-A: Audric Intelligence had 5 named systems (Agent Harness + Reasoning Engine + Silent Profile + Chain Memory + AdviceLog). Per `t2000/CLAUDE.md` + every cursor rule.

Post-Block-A (2026-05-21): **4 named systems.** MemWal absorbed both "Silent Profile" + "Chain Memory" into a single "Memory (MemWal)" system. The remaining 4 are:
1. **Agent Harness** — 37 tools, runtime, parallel reads + serial writes under tx mutex
2. **Reasoning Engine** — 14 safety guards + classifier + preflight + extended thinking
3. **Memory (MemWal)** — `@mysten-incubation/memwal` long-term vector memory + daily `<financial_context>` snapshot for short-term orientation
4. **AdviceLog** — `prisma.adviceLog.*` + `record_advice` audric-side tool

**If you see a doc saying "5 systems," it's stale.** S.221 + S.222 update t2000/CLAUDE.md + audric/CLAUDE.md + 4 cursor rules + 2 docstrings to the 4-system framing. The cursor-rule sweep is on the t2000 side because audric's rules live in `audric/.cursor/rules/` and the CLAUDE.md on each repo's root.

Block A code-only diff: ~−2200 LoC source + ~−4000 LoC Prisma client regen = ~−6200 LoC total.

Block B code-only diff: +431 / −230 LoC (web-v2) + structural one-line `vercel.json` move (commit `3c02033`).

---

## 🧰 Recurring agent guidance

### Header-based auth in web-v2 (NOT cookies)

Every new authed fetch from a Client Component MUST forward `useZkLogin().session.jwt` via the `x-zklogin-jwt` header. Audric is header-based zkLogin, NOT cookie-based. Forgetting this is the most common P1 bug — surfaces as a 401 on every read against `/api/memory/list` or similar.

Canonical pattern (used in `memory-section.tsx`):
```tsx
const { session } = useZkLogin();
const res = await fetch("/api/memory/list", {
  headers: session?.jwt ? { "x-zklogin-jwt": session.jwt } : {},
});
```

### Audit-first slice discipline

Pattern that landed v0.7d ~11 days ahead of schedule: BEFORE starting any phase, audit the SPEC's claims against the actual codebase. The SPEC was written before v0.7c chat-flip — many of its claims are stale. Phases 4 + 5 + Block A revision all collapsed multi-day SPEC work into minutes-to-hours of focused deletion because the audit caught "SPEC says do X" → "X is already done by Y" mismatches.

Continue this cadence for Block C + Phase 7 + Phase 8.

### Vercel CLI cheat sheet (for driving smoke without founder)

```bash
# Project linked? (.vercel/project.json at repo root)
cat /Users/funkii/dev/audric/.vercel/project.json

# Confirm Root Directory before placing config files
vercel project inspect

# List registered crons (ground truth — beats reading vercel.json)
vercel crons list

# Trigger a cron immediately (auth handled by Vercel internally)
vercel crons run /api/cron/portfolio-snapshot

# Get a fresh production env dump (encrypted vars come through as "")
vercel env pull /tmp/.env.production --environment=production

# Recent deploys + statuses
vercel ls
```

Encrypted env vars (like `CRON_SECRET`, `ANTHROPIC_API_KEY`) come through `vercel env pull` as empty strings — Vercel intentionally masks them. Use `vercel crons run` (which triggers from inside Vercel's runtime where the env is fully decrypted) instead of curl-ing with the secret.

`vercel logs` requires Vercel Pro for runtime logs and may return "Not authorized" via CLI even when logged in — verify via DB query instead.

### Driving smoke via DB query (when you need ground truth)

The `apps/web` codebase uses Prisma 7 + `@prisma/adapter-neon` for the Vercel runtime. To query the prod DB locally for verification:

```typescript
// Pull prod env first: vercel env pull /tmp/.env.production --environment=production
// DATABASE_URL comes through unencrypted (Neon connection strings aren't masked)
import { readFileSync } from "node:fs";
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const envFile = readFileSync("/tmp/.env.production", "utf8");
const dbUrl = envFile.split("\n").find(l => l.startsWith("DATABASE_URL="))!
  .replace(/^DATABASE_URL=/, "").replace(/^"(.*)"$/, "$1");

const adapter = new PrismaNeon({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });
// ...queries...
await prisma.$disconnect();
```

Run via `pnpm --filter @audric/web exec tsx <script>.ts`. **Delete the script + env file after use** — don't leave secrets on disk.

---

## 📚 Historical: v0.7c (Phases 0–6 cutover) — ARCHIVED 2026-05-21

v0.7c shipped 2026-05-19 to 2026-05-20. Phase 6 cutover migrated production traffic from `apps/web` chat shell to `apps/web-v2`. The original Phase 1–5 detail (template SHA, env wiring, `PermissionCard` extension, Payment Intents architecture, AI Elements adoption, etc.) is preserved in `audric-build-tracker.md` S.162-S.196 + the v0.7c-era version of this file at git tag `v0.7c-handoff` (if needed; otherwise reachable via `git log -- HANDOFF_NEXT_AGENT.md`).

Key v0.7c facts that still apply:

- **Template SHA pinned at `vercel/ai-chatbot@107a43a`** (2026-04-17 tip of main, includes AI SDK v6 + tool approval + v1 architectural marker).
- **web-v2 is on Next 16 + Tailwind v4 + AI SDK v6 + Prisma 7 + Drizzle (for chat session tables — currently dormant; v0.7e brings them back).**
- **zkLogin smoke requires preview/prod URL** (`localhost:3001` returns `redirect_uri_mismatch` from Google). The OAuth client is registered for `localhost:3000` (legacy apps/web) + production URIs only.
- **`apps/web` is off-traffic but NOT yet archived.** v0.7c Phase 6 flipped DNS; v0.7e will delete the directory. Until then, `apps/web` exists for archival reference (and its memory pipeline was the deletion target in v0.7d Phase 6 Block A).

---

## Cross-references

- `t2000/spec/active/BENEFITS_SPEC_v07d.md` — active SPEC
- `t2000/audric-build-tracker.md` — entries S.214 (v0.7d kickoff) through **S.222 (this session — Block B + vercel.json structural fix)**
- `t2000/.cursor/rules/agent-harness-spec.mdc` — Spec 1 + Spec 2 contracts (still binding under v0.7d)
- `t2000/.cursor/rules/memory-injection-architecture.mdc` — F-4 layer 3 contract (memory injection happens in `prepareStep`, NOT system-prompt builder)
- `t2000/spec/archive/v07c/` — v0.7c SPEC + slice drafts (historical reference)
