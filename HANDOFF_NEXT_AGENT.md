# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> First written 2026-05-18 during v0.7c Phase 1; rewritten 2026-05-21 at v0.7d
> Phase 6 Block B close to reflect the MemWal migration as the active SPEC.

---

## 🎯 Active SPECs

**v0.7d MemWal — CLOSED (Phase 7 done per founder 2026-05-21 ~20:00 AEST)**
[`t2000/spec/active/BENEFITS_SPEC_v07d.md`](../t2000/spec/active/BENEFITS_SPEC_v07d.md). The v0.7d SPEC retired the legacy SQL-backed memory pipeline (`UserMemory` + `UserFinancialProfile` + chain-classifier cron) and replaced it with `@mysten-incubation/memwal` vector memory. **All 7 phases shipped + closed.**

**v0.7e Tier C Migration — Phase 1A SHIPPED (S.238, 2026-05-21 ~20:30 AEST)** + **Invoice deprecation kickoff (S.239, 2026-05-21 ~21:00 AEST)**
[`t2000/spec/active/BENEFITS_SPEC_v07e.md`](../t2000/spec/active/BENEFITS_SPEC_v07e.md). v1.0 LOCKED-PENDING-FOUNDER per S.237; Phase 1A executed under "agent-assumed defaults" path immediately after Phase 7 closed (G1 → CLOSED). **4,233 net LoC deleted from apps/web across 22 files in 2 batches.** Slices 1A.2 (voice) + 1A.3 (build-id) DEFERRED to Phase 1B/2 due to chat-shell entanglement; will delete naturally when chat-shell migrates. **Major scope change per D-2 (unchanged from S.237):** Phase 5 (final apps/web archive) DEFERRED TO v0.7f; v0.7e ships Phases 2-4 (plus the shipped Phase 1A) only; apps/web survives as ~5,000 LoC MPP-only shim until Agentic Commerce SPEC ships pay_api in web-v2.

**S.239 correction (founder reframe):** S.238 incorrectly preserved invoice via the `/invoice/:slug → web-v2/pay/:slug` rewrite (the apps/web `page.tsx` got deleted, but the rewrite kept invoice alive on web-v2's invoice-union-case render path). Founder pointed to S.190 (2026-05-20) framing: invoice deserves to die as a distinct product (~95% overlap with payment links). S.239 (1) DELETED the rewrite (5 min ship, commit `74acab5`, post-deploy smoke GREEN — `/invoice/test123` now 404s) + (2) DRAFTED `spec/active/V07E_INVOICE_DEPRECATION.md` v0.1 — 5-phase mini-SPEC for the living deprecation across engine tools + web-v2 UI + Prisma + DB. **Deeper insight from founder reframe:** apps/web is zombie code walking; surgical cleanup of dying surfaces is wasted work. The ONLY apps/web changes worth making are OUTBOUND interfaces (rewrites in `next.config.ts`). Internal cleanup (voice routes, etc.) waits for en-bloc delete in Phase 2.

**8 companion docs in `spec/active/` (4 from Saturday's S.232 + 4 from tonight's S.237 prep block):**

| Doc | What it covers | Block |
|---|---|---|
| `V07E_PHASE_0_BASELINE.md` | LoC baseline + per-phase delete targets; G4 gate closed | S.232 |
| `V07E_D_QUESTION_AUDITS.md` | 7 D-questions audited; D-2 finding shrinks v0.7e scope | S.232 |
| `V07E_PHASE_1_EXECUTION_PLAN.md` | Phase 1A (5 slices, ~3.5h) + Phase 1B subsumed into Phase 2 | S.232 |
| `V07E_PHASE_2_SURFACE_MAP.md` | Phase 2 migration file-level inventory (~5-7d revised) | S.232 |
| `V07C_RETROSPECTIVE.md` | v0.7c phase-by-phase outcome + lessons + dead-rewritten code inventory | **S.237 Block 1** |
| `V07E_PERSISTENT_CHATS_LOCK1_POC.md` | LOCK-1 ORM POC: Option B (prisma rewrite) wins 9/11 dimensions; cost delta is ~3-4h, not 1.5d | **S.237 Block 3** |
| `V07F_FORWARD_MAP.md` | v0.7f scope: Stream A (Agentic Commerce Phase 1) + Stream B (apps/web archive) + Phase 5c PWR permanent shelf | **S.237 Block 4** |
| `SPEC_31_SCOPING.md` | Audits SPEC 30 Phase 2-10 status; recommends SPEC 31 = CSP perimeter polish (agent-only, A+ securityheaders.com gate) | **S.237 Block 5** |

**Phase 1 gate status:**

| Gate | Status |
|---|---|
| **G1 (Phase 7 closes)** | ✅ CLOSED 2026-05-21 ~20:00 AEST per founder |
| G2 (Phase 8 G12 decision) | RESOLVED — fn-injection lands inside v0.7e Phase 2 per L-2 |
| **G3 (`/api/portfolio` cutover)** | ✅ CLOSED — S.231/232 ship `729fd23` |
| **G4 (Phase 0 baseline)** | ✅ CLOSED — V07E_PHASE_0_BASELINE.md |
| **Founder D-1..D-7 lock** | RESOLVED for Phase 1A (agent assumed defaults D-1/D-3/D-4/D-6); D-2/D-5/D-7 RATIFY needed before Phase 2 (~5 min review) |

**The 7 founder questions in 1-line each (all audited; defaults bolded):**

| # | Question | Recommendation |
|---|---|---|
| D-1 | `/api/user/memories` keep or delete? | **DELETE** — route already gone (v0.7d Block A); just dead UI cleanup in Phase 1A.4 |
| D-2 | `services/*` migrate or delete? | **DEFER to v0.7f** — Agentic Commerce SPEC ships pay_api; v0.7e Phase 5 shrinks to "keep ~5k LoC MPP shim" |
| D-3 | `voice/*` migrate or delete? | **DELETE in Phase 1A.2** — matches v0.7c audit-3 zero-usage; alternative defer-with-pay_api flagged as compounding-risk |
| D-4 | `/api/payments` rewrite verify | **DELETE in Phase 1A.5** — PayPanel goes with chat-shell; slug routes cutover to web-v2 |
| D-5 | Marketing landing scope | **RATIFY L-4** (pure copy-port; legal-vetted text — no redesign) |
| D-6 | `/api/build-id` post-v0.7e | **REVISED → DELETE in Phase 1A.3** (all chat-shell consumers; web-v2 has no version-check) |
| D-7 | Keep `apps/web-legacy/`? | **RATIFY DELETE** (git history is SSOT; actual `rm` 24h post-Phase 5) |

**Phase 1A SHIPPED 2026-05-21 ~20:30 AEST (S.238). 3 of 5 slices delivered (~3h total) — 4,233 LoC delete from apps/web:**
1. ✅ 1A.4 Memory/Settings dead-code SHIPPED — MemorySection + 3 section components + apps/web settings page/loading (-1,160 LoC)
2. ✅ 1A.5 Payments slug cutover SHIPPED — slug + verify routes deleted; R3 IDOR test block deleted per G3 (-752 LoC). **LIST route + PayPanel KEPT until chat-shell migrates** (still consumed by dashboard-content.tsx).
3. ✅ 1A.1 Page directory sweep SHIPPED — pay/[slug], invoice/[slug], settings/contacts, [username] (+ 5 orphaned components: PayClient/PayButton/DigestForm/InvoiceHeader/ContactsPage) (-2,321 LoC)
4. 🟡 1A.2 voice DEFERRED to Phase 1B/2 — entangled with chat-shell UI (InputBar, VoiceModeContext, ChatMessage, BlockRouter, TextBlockView, dashboard-content). Deletes naturally when chat-shell migrates.
5. 🟡 1A.3 build-id + version-check DEFERRED to Phase 1B/2 — entangled with ChunkErrorReloader, AppProviders, middleware X-App-Version stamping, useVersionCheck, useExpirySoonToast (~15 file touches in dying chat-shell). Deletes naturally with chat-shell.

**Commits:**
- Batch 1 (1A.4 + 1A.5): `c0295e4` — 11 files, -1,912 LoC
- Batch 2 (1A.1): `36abe6b` — 12 files, -2,321 LoC

**Post-deploy smokes (both batches verified GREEN):**
- `/settings` → web-v2 (multi-hop `syd1:syd1:syd1::7xl6t`)
- `/api/payments/[slug]` → web-v2 (4-hop `syd1:syd1:syd1::iad1::mh9c2`)
- `/pay/test123` → web-v2 (title "Pay — Audric · Audric")
- `/invoice/test123` → web-v2 (rewrite to /pay/:slug)
- `/settings/contacts` → web-v2 (app-shell title)
- `/someTestUser` → web-v2 ([username] catch-all 404)

**Phase 1A audit-first lesson (added to S.238):** Phase 1A safe-today deletes are NON-chat-shell surfaces only. Slices touching apps/web chat-shell UI defer to Phase 1B/Phase 2 where chat-shell goes away anyway. Estimating slice complexity by file count alone underestimates entanglement risk — must audit consumer graph before classifying as "safe-today."

**S.239 lessons (added to running list):**
- **Read prior session entries before assuming consensus** — S.190 invoice deprecation framing was 1 day old at S.238 ship; a single `rg "invoice.*remov|invoice.*deprecat"` would have caught it. Add to future Phase X.A pre-flight.
- **Zombie code is not worth surgical cleanup** — apps/web is dying en bloc. Surgical removal of voice / dead components from a `rm -rf`'d-in-days surface is wasted work + test churn + risk to what's still served. ONLY apps/web changes worth making: OUTBOUND interfaces (rewrites). Everything else waits for en-bloc delete.
- **Honest scope re-estimation when audits change** — quoted ~1h for voice cleanup pre-audit; audit revealed 2,739 LoC across 16 files. When audit reality contradicts estimate, surface BEFORE proceeding.
- **Mini-SPECs for cross-cutting deprecations** — invoice touches engine + web-v2 + apps/web + Prisma + DB + system prompt + docs. Belongs in its own SPEC, not in Phase 1A. Audit-first → "this is a separate mini-SPEC" → keep slices clean.

**Next up after S.243 (full open backlog snapshot):**

| Priority | # | Task | Effort | Blocker |
|---|---|---|---|---|
| ✅ DONE | P1.1 | **SHIPPED 2026-05-22 — Stale fincontext write-refusal hotfix Phase 1** (S.242). Path 6 locked + shipped — `apps/web-v2/lib/audric/financial-context.ts` slimmed 10→4 fields; bug class eliminated by construction. Typecheck + lint + build all clean. Prod-deploy smoke pending (founder to retry "Save $5 USDC" with stale snapshot) | DONE | — |
| ✅ DONE | H3.1A | **SHIPPED 2026-05-22 — Contacts simplification Phase 1A (web-v2)** (S.243). Path A locked (Q1-Q5 all founder-locked). -698 net LoC across 17 files; web-v2 contacts surface deleted entirely; system prompt updated with Q5 narration rule (no @audric fabrication). Typecheck + lint + build all clean. apps/web dies en bloc with v0.7e Phase 2 (auto); engine cleanup no-rush; Prisma drop after 24h soak | DONE | — |
| 🟡 P1.2 | P1.2 | **Stale fincontext Phase 2 (cron + Prisma)** — per S.242 Q2 recommended Option C: drop the 6 dead columns + simplify cron + remove S.235 `fincontext-zero-bug-backlog` guard | ~30 min | (1) Founder Q2 lock; (2) ~24h Phase 1 soak |
| 🟡 H3.2 | H3.2 | **Contacts Phase 2 (Prisma drop)** — per S.243 Q4 DROP DIRECTLY locked: Prisma migration to drop `UserPreferences.contacts` JSON column. No archive table, no 30d grace | ~30 min | ~24h Phase 1A soak (no production regression from contacts removal) |
| 🟡 H3.4 | H3.4 | **Contacts Phase 4 (engine cleanup, NO RUSH)** — delete `packages/engine/src/tools/contacts.ts` + `add-recipient.ts` + remove from tool-flags + tool-policy + tools/index + tests + bump @t2000/engine minor + publish. apps/web side will be dead by then (Phase 3 auto) | ~30 min | Optional after web-v2 soak; can wait indefinitely. Engine tools become unused exports until deleted |
| 🟡 H3.5 | H3.5 | **Contacts Phase 5 (Q2 reverse-lookup, AUDIT FIRST)** — Audit web-v2 send history rendering. IF it currently relies on contact-stored names for recipient display, add Q2 A-1 path: live reverse-lookup at render (Audric directory + SuiNS, session-cached). IF send history already shows raw short-form 0x or routes through resolve_suins live, this is $0 work | ~0-2h | None — audit-first ship |
| 🔴 HIGH | H1 | **v0.7e Phase 2** — chat-shell cutover + 1A.2/1A.3 absorption + fn-injection refactor | ~5-7d | Founder D-2/D-5/D-7 RATIFY (~5 min) + Vitest R-1 decision |
| 🔴 HIGH | H2 | **v0.7e Persistent Chats** — `spec/active/BENEFITS_SPEC_v07e_persistent_chats.md` + LOCK-1 POC LOCKED Option B | ~13-19h / 2-3 days | Founder review 5 remaining locks (~10-15 min). R-7 clear (Phase 7 closed) |
| 🟡 MED | M1 | **SPEC 31 — CSP perimeter polish** per `spec/active/SPEC_31_SCOPING.md` | ~6-9h + 24-48h Report-Only soak | Founder triage |
| 🟡 MED | M2 | **engine-fn-injection-refactor** (REBASELINED to AFTER v0.7e Tier C migration) | ~14-21h / 2-3 sessions | Blocked on v0.7e Tier C |
| 🟡 MED | M3 | **engine-internal-key-final-delete** | ~30 min | Blocked on M2 |
| 🟤 DEF | D1 | **V07E_INVOICE_DEPRECATION** — drafted S.239 + DEFERRED S.240. Mini-SPEC at `spec/active/V07E_INVOICE_DEPRECATION.md`; the OUTBOUND-interface fix (S.239) stands; deeper deprecation waits | ~4-5h / 5 phases | Founder priority restoration |
| 🟤 DEF | D2 | **Phase 3.5 memory controls** — per-record delete + provenance in `/settings/memory` | TBD | MemWal SDK feature (`MemoryStore.forget()` etc.) |
| 🟤 DEF | D3 | **V07F_FORWARD_MAP** — 4 streams (Agentic Commerce + apps/web pay_api delete + marketing/legal + archive ritual) | ~10-14 calendar days | D-1 lock + v0.7e Phase 4 close |
| 🟤 DEF | D4 | **v0.7g Agentic Commerce Phase 2-4** — multi-vendor + delivery + creator + escrow | ~13-17d | Post-v0.7f |
| 🟤 DEF | D5 | **Phase 5c PostWriteRefreshSurface** | TBD | SHELVED per S.237; re-open on user feedback signal |

**Founder ops (waiting on you, not agent work):**
- Retire ECS task defs + ECR repos + ALB (AWS console)
- Drop indexer NeonDB tables: Position / Transaction / ProtocolFeeLedger / IndexerCursor / YieldSnapshot + `Agent.lastSeen` (Neon console)

**Recommended sequencing (S.241 update — tomorrow's plan-of-attack):**
1. **Open founder review (~30-45 min)**: Lock 4 SPECs in one sitting per V07E_STALE_FINCONTEXT_WRITE_REFUSAL §10:
   - **P1.1** Stale fincontext Q1 (Path 1 / 5 / 6)
   - **H3** Contacts simplification Q1-Q5
   - **H2** Persistent chats 5 remaining architectural locks
   - **H1** v0.7e Phase 2 D-2/D-5/D-7 RATIFY
2. **Ship smallest first**: P1.1 Path 6 (~30 min) — quick win to start the day
3. **Then by priority**: H3 contacts (per locked path) → H2 persistent chats Phase 1 schema → H1 v0.7e Phase 2 prep
4. **Defer**: D1 invoice deprecation stays in backlog until founder restores priority

**End-of-day-2026-05-21 stop point (founder going to bed):** 4 SPECs drafted and queued (V07E_INVOICE_DEPRECATION drafted-deferred + V07E_CONTACTS_SIMPLIFICATION drafted + V07E_STALE_FINCONTEXT_WRITE_REFUSAL drafted + V07E persistent chats drafted earlier S.233). 2 SPECs already locked-pending-founder (V07E_PHASE_1_EXECUTION_PLAN closed Phase 1A in S.238; BENEFITS_SPEC_v07e v1.0 LOCKED-PENDING-FOUNDER per S.237). All quick-win SPECs (P1.1 Path 6, H3 Path A or B Phase 1, H2 schema) can ship the morning after founder-lock review.

### v0.7e (persistent chats) SPEC drafted 2026-05-21 ~22:45 AEST / S.233

Parallel SPEC track to v0.7e structural — NOT a replacement. File: `spec/active/BENEFITS_SPEC_v07e_persistent_chats.md` (564 lines).

**Headline finding:** Vercel AI SDK chatbot template bootstrapping web-v2 in v0.7c shipped ~85% of persistent-chats surface already. Backlog row 177's "3-5d" estimate corrected to **~1.5-2.5d (drizzle path)** or **~2-3d (prisma rewrite path)**. Audit-first cadence (engineering-principles.mdc §1) closed in ~90 min, saved ~3 days of work.

**What's built (dormant in production):**
- Drizzle schema + initial SQL migration (7 tables) — never run against prod
- Queries layer (660 LoC, 25 functions: save/get/delete/visibility/vote/title/streams)
- Sidebar history UI (date grouping, SWR Infinite, delete confirmation, audric-branded)
- `/api/history` + `/api/vote` + `(chat)/actions.ts` (zkLogin-aware via `getCurrentUser`)
- Auth model compatible — `session.user.id` IS the canonical Sui address

**What's missing (the ship slice):**
- Migration never run (S.226 silently swallows `relation "Chat" does not exist`)
- `/api/chat` route has ZERO imports from `lib/db` — no `saveChat` / `saveMessages` wiring
- Drizzle `User.id` is `uuid`, audric passes `0x...` Sui address — type mismatch

**6 architectural locks pending founder review (~10-15 min):**

| Lock | Question | Agent rec |
|---|---|---|
| LOCK-0 | Sequence vs v0.7e structural? | **Sequence**: structural Phase 1A → persistent chats → structural Phase 2 |
| LOCK-1 | ORM (drizzle vs prisma)? | **Prisma rewrite** — aligns with queries.ts:53 comment direction; eliminates mixed-ORM debt |
| LOCK-2 | Vote / artifact / suggestion? | **KEEP vote, STRIP artifact + suggestion** (no Audric artifact panel) |
| LOCK-3 | `(chat)` route group? | **Fold Session 9a into this SPEC** — move 3 files, delete `(chat)/` |
| LOCK-4 | Resume mechanism? | **Engine StreamCheckpointStore** (v2.2.0); delete template Stream registry |
| LOCK-5 | Title generation? | **Haiku LLM summarizer** (~$0.0001/chat) |

**Phase plan** (LOCK-1=prisma path): Phase 1 schema+writes (~4-6h) → Phase 2 route migrations + `(chat)/` deletion (~2-3h) → Phase 3 click-to-resume (~2-3h) → Phase 4 visibility/share (~3-4h) → Phase 5 polish (~1-2h). **TOTAL: ~13-19h (~2-3 days).**

**Critical risk R-7: DO NOT ship before v0.7d Phase 7 observation closes** (~Friday/Saturday). Schema change crosses observation boundary; activation creates sidebar history rows that would muddy the Phase 7 "did anything regress?" signal.

**Next agent picks up after:**
1. Phase 7 closes (~2026-05-23 ~17:00 AEST)
2. Founder reviews SPEC + locks 6 architectural decisions
3. Founder decides LOCK-0 — does this ship before or after v0.7e structural Phase 1A?

### Status snapshot (2026-05-21 ~16:50 AEST)

| Phase | SPEC budget | Actual | Status | Where it landed |
|---|---|---|---|---|
| 0 — Baseline + D-lock | ~1d | ~1h | ✅ CLOSED | S.214 |
| 1 — Adapter + engine wire | ~1d | ~1h 45m | ✅ G2 PASSED | S.215 + S.216 |
| 2 — Recall non-empty | ~½d | ~40m | ✅ G3 PASSED | S.217 |
| 3 LITE — Settings Memory UI | ~2d | ~35m | ✅ G4 PASSED | S.218 |
| 4 — Classifier migration | ~2d | ~10m audit | ✅ FOLDED into Phase 6 | S.219 |
| 5 — SPEC 40 HITL native | ~3d | ~25m audit | ✅ FOLDED into v0.7e | S.220 |
| 6 Block A — Memory pipeline retirement | part of ~2d | ~1h 45m + ~30m post-ship review | ✅ G5 + G10 PASSED | S.221 |
| 6 Block B — Vercel cron migration + structural vercel.json fix | part of ~2d | ~45m impl + ~15m smoke | ✅ G10 SMOKE GREEN (soak skipped per founder lock; subsumed by Block C wholesale delete) | S.222 |
| 6 Block C.1 — `t2000.ai/api/stats` refactor (Prisma → static + Sui RPC) | part of ~2d | ~35m | ✅ SHIPPED | S.223 (t2000 `8aa394e4`) |
| 6 Block C.2 — `apps/server` + `infra/` + Prisma stack wholesale delete | part of ~2d | ~50m | ✅ SHIPPED — **42 files deleted, −3,804 LoC net** | S.224 (t2000 `5e04154f`) |
| 6 Block C.3 — Dead receiver routes + docs + v0.7e+ backlog stamps | part of ~2d | ~45m | ✅ SHIPPED — **6 dead `/api/internal/*` routes deleted, env doc consolidated, 2 new backlog rows** | S.224 (audric `a6a17e8` + t2000 `2d031d2b`) |
| 7 — Cutover + compressed observation | SPEC: ~7d formal soak | TBD (48-72h compressed observation, founder-owned) | 🟡 IN PROGRESS — **banner DROPPED per founder simplification lock**; observation opens 2026-05-21 ~17:00 AEST | S.225 (this session, doc-only) |
| 8 — v0.7e dep-map unblock | ~½d | ~5min audit | ✅ G12 CLOSED with caveat — dependency map CAPTURED + CATEGORIZED for v0.7e Tier B/C sweep | S.225 (this session) |
| **Code time so far** | **~12d budget** | **~9h 35m actual** | **Ahead by ~10.5 days** | — |

Three audit-saves in one day (Phases 4 + 5 + Block A revision) compressed the SPEC budget by ~7 days. Plus the S.225 Phase 7+8 compression: banner dropped (~30 LoC saved + ~½ hr saved) + soak compressed from 7d to 48-72h + Phase 8 G12 closed in 5min audit. The pattern: v0.7d was scoped before v0.7c chat-flip + S.173 intent-dispatcher lock + the chain-memory statistical refactor + the AI SDK v6 HITL migration closed. Each phase audit collapses 2-3 days of stale SPEC work into minutes-to-hours of focused deletion.

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

### 2. 🟡 Phase 7 — compressed 48-72h passive observation (founder-owned, NO MORE AGENT CODE)

**Banner DROPPED** per founder simplification lock (S.225, 2026-05-21 ~16:45 AEST). Three reasons it was never needed: (a) D-14 mitigation premise is stale — MemWal was wired in production at S.215 (~8h before banner concept solidified), so users have already been accumulating fresh memory; no jarring cold-start moment to apologize for. (b) Audric is pre-launch; "1057 users" SPEC figure is peak `UserMemory` row count, not active engaged users. (c) Legacy `UserMemory` had a 30d retention cliff already — users were periodically losing memory; not regression-grade.

**Observation plan (founder-owned, calendar 48-72h from 2026-05-21 ~17:00 AEST):**

| Day | Date | Checks (~5 min each) | Abort-to-rollback trigger |
|---|---|---|---|
| Day 1 | 2026-05-22 morning AEST | Vercel cron logs (`financial-context-snapshot` 02:30 UTC + `portfolio-snapshot` 07:00 UTC both fired) + TurnMetrics `memwal.recall` p95 ≤ 700ms single / ≤ 50ms cached + Anthropic usage shows ZERO `audric.cron.memory-extraction` invocations | Cron mis-fire OR p95 > 1500ms sustained OR Anthropic shows >0 memory-extraction calls |
| Day 2 | 2026-05-23 morning AEST | Same + AdviceLog throughput matches pre-Block-A baseline + manual chat smoke (~5 turns; confirm `<memory_recall>` populates) | Manual chat shows no `<memory_recall>` after 5+ turns OR AdviceLog drops > 25% |
| Day 3 (optional) | 2026-05-24 morning AEST | If Day 1 + 2 clean → stamp S.226 closing G11. If any anomaly → extend to full SPEC 7d | n/a |

**Rollback procedure (if any trigger fires):** revert audric `a6a17e8` (auto-redeploys to `12rjxybu` pre-C.3 baseline) → re-enable t2000 ECS crons (cron-daily-intel task def preserved in git at SHA `pre-5e04154f`) → stamp S.226 with rollback trigger + RCA → v0.7e drafting paused.

### 3. ✅ Phase 8 — v0.7e dep-map audit CLOSED (G12)

Read-only grep of `apps/web/lib/` confirmed dependency map is captured + categorized:

| Category | Files | LoC est. | v0.7e disposition |
|---|---|---|---|
| Chat-shell deps | `timeline-builder.ts`, `proactive-marker.ts`, `sse-heartbeat.ts`, `engine/{fast-path-bundle,strip-llm-directives,cost-rates,quote-refresh-metrics,confirm-detection,txn-metrics}.ts`, `engine/__tests__/*` | ~3,500 | **Tier B DELETE** with chat-shell sweep |
| Memory-pipeline deps | `engine/engine-factory.ts`, `engine/engine-context.ts` (type imports; row reads dead per S.221) | ~800 | **Tier B DELETE** with tendril 6 decouple |
| HITL-wire-format deps | overlaps chat-shell (PendingAction type + `pending_action` events) | n/a | **AUTO-DELETES** with chat-shell files |
| Prisma generated client | `lib/generated/prisma/internal/*` | ~5,000 auto-gen | **DELETE** at apps/web archive |
| Standalone canonical lib | `portfolio.ts`, `rates.ts`, `transaction-history.ts`, `contacts/*`, `identity/*`, `env.ts`, `auth.ts` | ~8,000 | **Tier C COPY-PORT** to web-v2 |

**G12 verdict:** Pass with caveat. SPEC's "zero residue" target was structurally impossible without first doing the v0.7e archive sweep (Phase 6 deferred G9 tendril 6 to v0.7e per S.221). Re-interpreted as "dep map captured + scheduled" — closure means v0.7e knows what to delete vs copy-port. **v0.7e drafting is UNBLOCKED.**

### 4. Forward — v0.7e SPEC drafting (POST-G11 close, ~next agent session)

Per `t2000/spec/runbooks/RUNBOOK_v07c_phase_6_cutover.md` §11.2 the v0.7e scope is locked (Tier C surfaces + apps/web archive). Two prerequisite backlog rows landed in S.224 that should be in the v0.7e SPEC Phase 1:
- `engine-fn-injection-refactor` (~1-2d) — eliminate engine→audric HTTP self-fetches; removes the load-bearing `T2000_INTERNAL_KEY` env var bridge. Lands BEFORE Tier C migration to simplify moved-routes' auth.
- `engine-internal-key-final-delete` (~30 min) — final env var cleanup post-injection.

Plus the C.1 side-finding logged this session:
- `stats-route-wallets-null-backlog` (P3, ~20 min, t2000 repo) — `https://t2000.ai/api/stats` returns `wallets: null`; Sui-RPC sub-fetch throws + empty catch swallows. Anytime / pre-v0.7e cleanup.

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
| `fincontext-zero-bug-backlog` | ✅ CLOSED 2026-05-21 / S.235 — gated upsert on `portfolio.source !== 'sui-rpc-degraded'` AND `portfolio.defiSource !== 'degraded'` in `apps/web/lib/jobs/financial-context-snapshot.ts:113-122`. New `degradedSkipped` field on `FinancialContextSnapshotResult` + `cron.fin_ctx_degraded_skipped` telemetry counter for live observability. `partial` + `partial-stale` defi states still trusted (some data > no data; 48h reader stale gate catches multi-day failures). Brand-new users with no row + degraded BlockVision → reader returns "" cleanly, agent falls back to fresh tools. Typecheck PASSED. Phase 7-safe (cron job, not chat/memory surface). | Closed |
| `phase-5c-post-write-refresh-surface` | **🟢 SHELVED 2026-05-22 / S.237** — Block 4 of prep plan recommended permanent shelf to v0.7f or beyond. Reasoning (per `V07F_FORWARD_MAP.md` §4): (a) web-v2 behavior is functionally correct (cache invalidation + LLM re-firing) — only visual framing missing; (b) zero user feedback in Phase 7 observation requesting this; (c) PWR restoration crosses engine + UI work boundaries which doesn't fit v0.7f migration scope; (d) future restoration is reversible — if user feedback ever requests, it's a clean ~12-16h feature slice. Audit history: AISDKEngine v2 does NOT emit `source: 'pwr'` anywhere; the Day 3b PWR injection from SPEC 37 v0.7a Phase 2 was explicitly deferred per `packages/engine/src/v2/step-finish.ts:36-44`. Full scope still ~12-16h: engine Day 3b PWR injection (~4-8h) + `source` discriminator through AI SDK v6 wire format (~2-4h) + engine release + web-v2 primitives port (~3h) + surface component (~2h) + V2 card `variant="post-write"` (~1-2h) + wiring (~1h). If founder feedback signal arrives post-v0.7f, open as a fresh feature ticket, not as a backlog row. | Shelved — re-evaluate post-v0.7f per user feedback |
| `ai-gateway-userid-backlog` | ✅ CLOSED 2026-05-21 / S.234 — wired `providerOptions.gateway.user = walletAddress` in `apps/web-v2/app/api/chat/route.ts:1041-1050`. Per-user cost attribution active in Vercel AI Gateway Custom Reporting dashboard. Same walletAddress already shipped on `experimental_telemetry.metadata.userId` (OTel parity). Typecheck passes. Cost: $0.075/1k unique user IDs/month (single-digit $/month at audric scale). | Closed |
| `v07e-backlog` | **🟡 SPEC v0.1 SKELETON + LOCK-1 POC DONE 2026-05-22 / S.237.** Persistent chats SPEC: `spec/active/BENEFITS_SPEC_v07e_persistent_chats.md`. LOCK-1 POC ran tonight (Block 3 of prep plan): **Option B (prisma rewrite) wins 9 of 11 audit dimensions; cost delta is ~3-4h not 1.5d** (drizzle has ~50% dead artifact code; only 11 active queries need porting). Audit evidence in `V07E_PERSISTENT_CHATS_LOCK1_POC.md`. Persistent chats total effort revised: **~12-16.5h (~1.5-2 days, Option B) OR ~10-13h (~1.5 days, Option A)** — close to each other; B preferred for codebase consistency. 6 architectural locks pending founder review: LOCK-0 sequencing vs v0.7e structural; **LOCK-1 ORM (POC LOCKED Option B);** LOCK-2 vote/artifact disposition; LOCK-3 `(chat)` route group; LOCK-4 stream registry (agent rec = engine StreamCheckpointStore); LOCK-5 title generation (agent rec = Haiku summarizer). 5-phase plan + 10-risk surface captured. **DO NOT SHIP before v0.7d Phase 7 closes** (R-7: schema change crosses observation boundary). Phase 1 starts post-Phase-7-close + post-founder-lock. | v0.7e (chats) — post-Phase-7 |
| `stats-route-wallets-null-backlog` | ✅ CLOSED 2026-05-21 / S.226 (t2000 `e1feeeed`) — root cause was env-gate violation (empty-string env var overrode canonical via `??`); fixed via `isValidSuiAddress` validation + canonical fallback. Production probe confirms wallets populate (treasury 4.8 SUI / 5.41 USDC + MPP gateway 12.26 USDC). | Closed |
| `t2000-web-env-gate` | ❌ CANCELLED 2026-05-21 / S.227 — founder pushback during attempted ship (correct call). t2000/apps/web is a static marketing site with **zero required env vars**; CLAUDE.md rule #8's bug-class motivation (S.25 BlockVision empty-string silent degradation) is a REQUIRED-var problem. T2000 has 3 OPTIONAL Sui-address overrides handled defensively inline by S.226's `resolveSuiAddress` workaround, which is the right-sized fix at this scale. Adding 200 LoC Zod + `zod` dep + `instrumentation.ts` + ESLint rule to a previously near-zero-dep marketing site fails the Simplicity First test ("No abstractions for single-use code"). **Carve-out:** rule #8 applies to apps with required env vars; static sites with only optional overrides may validate inline at the read site. If t2000/apps/web ever adds a required env var (e.g. analytics secret, paid API key), re-open this row and ship the gate. | Carve-out |
| `engine-fn-injection-refactor` | OPEN (P3, ~14-21h / 2-3 sessions) — **SCOPE REBASELINED 2026-05-21 / S.228** post-audit. Original audit was 50% wrong — see `spec/active/AUDIT_ENGINE_FN_INJECTION_REFACTOR.md` postscript for 3 corrections. Key updates: (a) **execute AFTER v0.7e Tier C migration**, not before — engine-factory lives in apps/web today but the routes it self-fetches are rewritten to web-v2; doing fn-injection today would target dead code. Wait until engine-factory moves to web-v2 in v0.7e, then run fn-injection as a within-app refactor. (b) Actual fetch count is **13 fetch sites across 7 tool files**, not "6 engine call sites" — full inventory in audit doc. (c) `AudricApi` interface needs **12 methods**, not 11 — `getPortfolioHistory(addr, { days })` was missed (it's a separate route from `/api/portfolio`, called by portfolio-analysis.ts:176 for the week-change narration banner). (d) `activity-summary` is ALREADY factored as `fetchActivitySummary()` — saves ~1.5h. | v0.7e+ |
| `apps-web-dead-rewritten-routes-cleanup` | ✅ FULLY CLOSED 2026-05-21 / S.229 + S.231/232 — 4 of 4 dead-rewritten routes deleted. S.228 (audric `7220450`): `/api/analytics/{spending,yield-summary}` (-306 LoC). S.229 (audric `0f53ae3`): `/api/internal/payments` (-267 LoC) + `/api/analytics/portfolio-history` (-165 LoC) + `/api/analytics/activity-summary` (-50 LoC) + `internal/` parent dir. S.231/232 / G3 (audric `729fd23`): `/api/portfolio` (-148 LoC) + `spec30-cache-header-regression.test.ts` (-40 LoC). **Combined total: -976 LoC across 6 routes + 1 test + 2 directories.** 0 functional impact — all rewrites continue to serve from web-v2 via `next.config.ts` `afterFiles` cutover (4-hop x-vercel-id chain confirmed post each deploy). apps/web dead-rewritten-route surface is now empty. | Closed |
| `apps-web-portfolio-deletion-with-test-migration` | ✅ CLOSED 2026-05-21 / S.231 + S.232 G3 (audric `729fd23`) — shipped via simplified scope: founder lock authorized deleting the regression test alongside the route rather than porting to web-v2 (web-v2 lacks vitest infrastructure; regression risk mitigated by explicit `Cache-Control: private` already in web-v2's `/api/portfolio` route + auth gates + PR review). Net: -148 LoC route + -40 LoC test. Post-deploy smoke confirmed 4-hop x-vercel-id proxy chain (`syd1:syd1:syd1::iad1::`). apps/web dead-rewritten-route surface now empty. Web-v2 vitest infrastructure flagged as Phase 2 prerequisite in `V07E_PHASE_2_SURFACE_MAP.md` §R-1 if vitest-port becomes desired later. | Closed |
| `engine-internal-key-final-delete` | **NEW** OPEN (P3, ~30 min) — finalize the `T2000_INTERNAL_KEY` env var retirement once `engine-fn-injection-refactor` ships. Remaining consumers after function injection: ONLY `/api/internal/payments` (engine payment-link / invoice tools). At that point, port `/api/internal/payments` engine consumers to function injection too (same pattern as analytics), then delete `T2000_INTERNAL_KEY` from audric env schema (`apps/web/lib/env.ts`, `apps/web-v2/lib/env.ts`, `.env.example`), drop `validateInternalKey` from `apps/web/lib/internal-auth.ts` + `apps/web-v2/lib/internal-auth.ts`, delete `/api/internal/payments` route, drop `x-internal-key` branch from `authenticateAnalyticsRequest`. Depends on `engine-fn-injection-refactor`. | v0.7e+ |
| Phase 3.5 backlog | OPEN — full memory controls in `/settings/memory` (per-record delete via `MemoryStore.forget()`, "explain why this fact was recalled" provenance, recall-frequency ranking). Phase 3 LITE shipped a read-only top-K disclosure surface; controls deferred because MemWal SDK 0.0.4 doesn't expose the primitives | Post-v0.7d |
| `spec-31-csp-perimeter-polish` | **NEW OPEN 2026-05-22 / S.237** (Block 5 of prep plan) — SPEC 31 candidate scope = CSP nonces + missing directives + `securityheaders.com` A+ rating + companion `/api/mpp/payments` admin gate inline fix. Audit-evidence-based: SPEC 30 Phase 2 (env-gate) implicitly closed by v0.7d Block C + D-14 + S.227; Phase 5 (indexer) closed by deletion; Phase 9 (CSP polish) is the highest-leverage agent-only ready-to-ship next slice. Scope details in `spec/active/SPEC_31_SCOPING.md`. Effort ~6-9h + 24-48h Report-Only soak. Independent of v0.7e/v0.7f. **NOT yet locked** — founder triage required to confirm SPEC numbering + lock scope. Companion candidates Phase 6 (engine account-age gate) + Phase 3 (GDPR delete + export) explicitly DEFERRED until post-v0.7e Phase 2 closes — cross-touch with engine migration and Prisma cascade-deletes is too risky during the observation window. | Open (founder triage) |
| `v07f-forward-map` | **NEW DOCUMENTED 2026-05-22 / S.237** (Block 4 of prep plan) — v0.7f scope mapped end-to-end in `spec/active/V07F_FORWARD_MAP.md`. v0.7f composes 4 streams: Stream A (Agentic Commerce Phase 1: single-vendor pay_api revival in web-v2, ~3-5d, gated on D-1 lock = D-1b recommended); Stream B (delete pay_api from apps/web post-A, ~2-3h); Stream C (marketing + legal + admin migration, ~2-3d); Stream D (L-5 archive ritual + DNS cutover, ~1d + 24h). **Total v0.7f: ~6-9d agent + 24h passive → ~10-14 calendar days.** Critical path: A → B → C → D (serialized for safety). New v0.7g+ backlog rows mapped: `v07g-agentic-commerce-phase2-4` (multi-vendor + delivery tracking + creator flows + escrow, ~13-17d) + optional `v07g-phase-5c-pwr-restoration` (only if user feedback signal). Gate: founder lock D-1 in Agentic Commerce SPEC + v0.7e Phase 4 close. | Documented (forward-looking) |

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
