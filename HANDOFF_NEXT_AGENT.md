# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> Last refreshed 2026-05-23 ~19:25 AEST post-S.279 (CLI-CONTACTS-CLEANUP — SuiNS in `T2000.send()` + SDK promotion of the engine's SuiNS resolver). Earlier today: S.278 (SPEC 272 Lever 1 cron user-batching); S.277 ("Earns Its Keep" audit + cuts, engine 2.18.1); S.273 (payment-link URL prefix fix); S.269 (template-divergence + V07E_INVOICE_DEPRECATION); S.267 (engine 2.15.0). Originally rewritten 2026-05-22 ~17:30 AEST post-S.255. Previous Phase-6.5-era detail is preserved in git history (`git log -- HANDOFF_NEXT_AGENT.md`); the document is now a tight current-state-of-the-world view, not a session-by-session log. Session-by-session detail lives in `t2000/audric-build-tracker.md`.

---

## 🎯 Where we are right now (1-paragraph)

**S.279 shipped 2026-05-23 ~19:25 AEST — CLI-CONTACTS-CLEANUP. `T2000.send()` now accepts SuiNS names (`alex.sui`, `team.alex.sui`) in addition to hex addresses and the legacy `contacts.json` alias map. Priority order: hex → `.sui` → contact alias. The engine's `sui/address.ts` SuiNS resolver was promoted to the SDK (`packages/sdk/src/utils/suins.ts`) — one canonical implementation, the engine's `sui/address.ts` is now a thin re-export shim so all 11 existing engine import paths keep working unchanged. `contacts.json` now prints a one-shot DEPRECATION warning to stderr the first time a contact alias resolves in a process (sunset target: next major SDK). New error code: `T2000Error('SUINS_NOT_REGISTERED')` for well-formed but unregistered SuiNS names. New `SendResult.suinsName?` field surfaces the resolved name on CLI receipts ("Sent $10 USDC → alex.sui (0x8b3e…d412)"). CLI send help text + CLI_UX_SPEC updated. Tests: 593/593 SDK + 1319/1319 engine + 35/35 CLI + 127/127 MCP green. End-to-end mainnet smoke: `funkii.sui` → `0x40cd…3e62` ✅. Engine bump pending (`gh workflow run release.yml --field bump=minor` — SDK + CLI + MCP all bump in unison per CLAUDE.md release rules).**

**Pre-S.279 1-paragraph (preserved):** S.278 shipped 2026-05-23 ~19:00 AEST — SPEC 272 Lever 1 (cron user-batching). The 02:30 UTC `financial-context-snapshot` and 07:00 UTC `portfolio-snapshot` crons used to fan out per-user reads strictly sequentially; at ~165 users × ~2s/user that landed over Vercel's 300s `maxDuration` cap with ~6 tail-user snapshots skipped per run. New `apps/web-v2/lib/jobs/batch-runner.ts` helper processes users in parallel batches of 10 with a 500ms intra-batch delay; both crons refactored to consume it. New per-batch histograms (`cron.fin_ctx_batch_duration_ms`, `cron.portfolio_snapshot_batch_duration_ms`) for post-deploy tuning. Existing per-user error handling + S.235 degraded-skip gate preserved verbatim. Tests 17/17 green, lint clean (188 files), typecheck clean. No engine bump. SPEC 272 Lever 2 (Retry-After → cache TTL) + Lever 3 (AbortController on CB-open) DEFERRED pending 3-day post-deploy metric review — decision gate: `cron.fin_ctx_shard_duration_ms` p95 < 60s AND `degradedSkipped ≤ 1` per run. SPEC artifact lives at `t2000/spec/active/shipping/SPEC_272_CRON_RATE_LIMITS.md`.

**Pre-S.278 1-paragraph (preserved):** Engine 2.18.1 shipped 2026-05-23 ~17:30 AEST via S.277 + S.277.1 residue cleanup — the "Earns Its Keep" audit cut 5 engine tools (Volo trio + `web_search` + `protocol_deep_dive`) + 2 dead post-cut guards (`costWarning`, `artifactPreview`) + 1 dead flag (`costAware`). `explain_tx` kept but description tightened (arbitrary external digests only) and primary system-prompt steer dropped. Tool count 31 → 26 (18 read + 8 write). SDK + CLI + MCP retain Volo for non-Audric consumers — only Audric's surface shrunk. `BRAVE_API_KEY` dropped from `lib/env.ts`.

**Pre-S.277 1-paragraph (preserved for context):** S.269 + V07E_INVOICE_DEPRECATION + S.273 all green; S.272 backlogged. S.269 (template-divergence cleanup) FULLY SHIPPED 2026-05-23 ~14:30 AEST: 8 items + V07E_INVOICE_DEPRECATION 5 phases. Tool count 34 → 31 (21 read + 10 write — `createInvoiceTool` / `listInvoicesTool` / `cancelInvoiceTool` deleted; payment links absorb invoicing). Auth seam fixed: Server Action → API route + `Biome` ban on `"use server"` in web-v2 + Vitest contract test. SWR cache invalidation correctly handles `useSWRInfinite` keys via `unstable_serialize`. Env hardening: `T2000_INTERNAL_KEY` + `AUDRIC_INTERNAL_API_URL` are now `requiredString` (boot-time fail-loud, prevents the S.20 BlockVision incident class). Engine: `ToolContextEnv` typed contract, `saveContactTool` deleted, `T2000_AUDRIC_API` legacy alias removed, 3 invoice tools deleted. Neon migration applied: 50 invoice rows deleted, 6 columns dropped (`lineItems`, `dueDate`, `recipientName`, `recipientEmail`, `sentAt`, `reminderSentAt`), CHECK constraint `Payment_type_link_only` enforces `type='link'` at the DB layer. Verified post-deploy: 0 invoice rows / 157 link rows / 6 cols dropped / CHECK live. **S.273 shipped 2026-05-23 ~15:00 AEST (audric `88ae4dc`):** payment-link URLs in chat narration now carry the `audric.ai` prefix — `/api/internal/payments` (POST + GET) derives `shareablePayUrl(request, slug)` from `request.nextUrl.origin` instead of `audricWebUrl()` (which falls back to relative paths when `NEXT_PUBLIC_AUDRIC_WEB_URL` is unset). Smoke pending Vercel auto-redeploy. **S.269-SMOKE PASSED:** create + list + cancel + invoice-intent-routing + visibility toggle all green; delete-all-chats sidebar refreshes on next render trigger (acceptable). **S.274 backlogged** — the "Earns Its Keep" tool/feature audit. S.269 audited the plumbing; S.274 audits whether each tool earns its keep. 25/31 tools clearly earn keep; 6 are suspect (`web_search` + BRAVE_API_KEY · `protocol_deep_dive` · `explain_tx` · 3-tool Volo trio). Same lens applies to skills, canvas templates, guards, crons. Format: 1-page audit, ~1d read-only + ~1d cuts, slot AHEAD of PIPELINE-AUDIT-PHASE-2. Pre-existing context (still applies): `apps/web` deleted at S.253 (`audric-web` Vercel project still domainless with 5 dead crons — founder action OPS-1 = delete the project). MemWal is the single memory backbone (Silent Profile + Chain Memory collapsed into one "Memory" system, v0.7d Phase 6 Block A). `pay_api` + `mpp_services` engine tools are gone (S.245); MPP returns as a clean-slate Audric Store (V07F Stream A). **S.272 deferred** — BlockVision circuit-breaker + DeFi adapter `HTTP 429` storms + AbortError flurries during 02:30 UTC `financial-context-snapshot` cron causing Vercel 300s timeout. Sticky-positive cache + circuit breaker prevent bad data poisoning user-facing chat; cron-skip messages are observable. Standalone SPEC needed (not folded into S.269 — different domain).

**Pre-S.269 context preserved (all stable, mostly verified):**

S.247 persistent chats, S.253 DNS swap to web-v2, S.254 cross-repo cleanup + Vercel Analytics, S.245 `pay_api`/`mpp_services` deletion, S.258 t2000@2.14.0 (SPEC 26 revert + gasless MPP), S.259 sub-cent reprice, S.260 SUI-source sponsored-swap fix (2.14.1), S.261 schema trim, S.262 atomic compound writes prompt fix, S.263 SuiNS/`@audric` resolution at `/api/transactions/prepare`, S.264 send-asset & activity-heatmap dual fix, S.265 heatmap tooltip clamp, S.266 `receive_address` canvas template, S.267 engine `receive` auth threading + observability (engine 2.15.0). All shipped + smoke verified per founder.

| Surface | Status |
|---|---|
| `audric.ai` apex | ✅ web-v2 |
| `/chat`, `/chat/[id]`, `/share/[id]` | ✅ web-v2 (AI SDK v6 native, persistent chats live S.247) |
| `/pay/[slug]`, `/settings/*`, `/[username]` | ✅ web-v2 |
| Marketing landing, /disclaimer, /privacy, /security, /terms, /litepaper | ✅ web-v2 (verbatim L-4 port; shadcn redesign deferred — B1) |
| `/api/identity/*` + `/api/user/*` (4 routes) | ✅ web-v2 (Path B port; rewrites deleted) |
| 4 production crons | ✅ web-v2/vercel.json (`financial-context-snapshot`, `portfolio-snapshot`, `turn-metrics-pending-sweep`, `turn-metrics-cleanup`). The 5th cron `conversation-log-retention` referenced in older HANDOFFs was dropped with the `ConversationLog` Prisma model in S.254. |
| Engine | `@t2000/engine@2.18.0` post-S.277 release (web-v2 bump pending), **26 tools (18 read + 8 write)** post-S.277 cuts — Volo trio + `web_search` + `protocol_deep_dive` deleted. `explain_tx` kept but description tightened (arbitrary external digests only). Pre-S.277 web-v2 was on 2.17.0 (31 tools). 9 canvas templates. S.267 added `[receive] tool=… status=… url=… detail=…` failure-path observability. S.269 introduced typed `ToolContextEnv` + deleted dead `saveContactTool` / `T2000_AUDRIC_API` legacy alias. S.277 deleted 2 dead post-cut guards (`costWarning` + `artifactPreview`) + 1 dead flag (`costAware`). |
| SDK | `@t2000/sdk@2.17.0` (web-v2 ✅) — AB migration + gasless `T2000.pay()` + S.260 SUI-source sponsored-swap fix |
| CLI | `@t2000/cli@2.17.0` shipped — `gasless ⚡` badge live; first ever truly-gasless MPP CLI smokes verified mainnet |
| ECS infra | ✅ retired (S.224) — `apps/server`, `infra/`, t2000 Prisma stack all deleted |
| `apps/web` directory | ✅ DELETED S.253 — schema + migrations now in `apps/web-v2/prisma/` |
| `audric-web` Vercel project | 🟡 domainless, 5 dead crons still firing — **founder action: delete** |
| `@audric/web-v2` typecheck/lint/build | ✅ all green |

---

## ⚡ Founder ops (waiting on you, NOT agent work)

| # | Action | Cost | Urgency | Notes |
|---|---|---|---|---|
| OPS-1 | **Delete `audric-web` Vercel project** (dashboard) | 5 min | 🔴 NOW | Domainless since 2026-05-22 ~21:30; still firing 5 crons against Neon (wasted compute + log noise + dual-write race). DNS cutover already proven stable. The 7-day insurance window was overcautious — kill it. |
| OPS-2 | Retire ECS task defs + ECR repos + ALB (AWS console) | ~15 min | 🟡 anytime | All Vercel cutovers complete since S.224; the infra is dark but still billable. |
| OPS-3 | Drop indexer NeonDB tables (Neon console): `Position`, `Transaction`, `ProtocolFeeLedger`, `IndexerCursor`, `YieldSnapshot`, `Agent.lastSeen` column | ~10 min | 🟡 anytime | Indexer was deleted in S.224 — these tables have no writer left. |
| OPS-4 | (Optional) Re-port Tier B regression-swap CI to web-v2 | ~2-3h founder + agent collab | 🟢 def | The 2 workflows deleted in S.253 (`regression-swaps.yml` + `regression-swaps-execute.yml`) were path-scoped to `apps/web/**`. Tier A regressions (no on-chain mutation) port in ~1-2h if you want quote-scenario monitoring back; Tier B (live swap) needs `REGRESSION_TEST_WALLET_PRIVKEY` secret review. |

---

## 📋 Active backlog (ranked by gate-readiness)

| Rank | # | Title | Effort | Gate | Notes |
|---|---|---|---|---|---|
| 0 | **S.273-SMOKE** | **Verify S.273 payment-link URL prefix fix on prod** | ~1 min founder | Vercel auto-deploys from audric `88ae4dc` (~2 min) | `create a payment link for $1 USDC` → narration text reads `share https://audric.ai/pay/<slug>` (NOT `share /pay/<slug>`). Card UI was always correct; bug was the relative path leaking into chat narration text. |
| 0.5 | ~~**S.274 / S.277**~~ | ~~"Earns Its Keep" tool/feature audit~~ — **✅ SHIPPED via S.277** (2026-05-23 ~17:30 AEST). Audit shipped + cuts shipped. Engine 2.18.0: deleted Volo trio (`volo_stats` / `volo_stake` / `volo_unstake`) + `web_search` + `protocol_deep_dive` + 2 dead guards (`costWarning`, `artifactPreview`) + 1 dead flag (`costAware`). `explain_tx` kept but description tightened (arbitrary external digests only) and primary system-prompt steer dropped. Tool count 31 → 26. `BRAVE_API_KEY` dropped from `lib/env.ts`. Audit doc at `t2000/spec/archive/v07e/AUDIT_V07E_EARNS_ITS_KEEP_2026-05-23.md`. **Engine release pending** (`gh workflow run release.yml --field bump=minor`), then web-v2 bumps to 2.18.0. **Externalized narrative pending** (founder asked for public-facing version). | — | — |
| 0.7 | **S.272 / S.278** | **BlockVision + DeFi cron rate-limits — Lever 1 SHIPPED (S.278)** · Levers 2 + 3 DEFERRED pending 3-day post-deploy metric review | Lever 1 done · Lever 2 + 3 ~5h IF metrics demand them | Founder picked Tier "Minimum" (Lever 1 only) for first ship; revisit after metrics | **Lever 1 (S.278, 2026-05-23 ~19:00 AEST):** `apps/web-v2/lib/jobs/{batch-runner,financial-context-snapshot,portfolio-snapshot}.ts`. Cron user-batching (N=10 users/batch, M=500ms intra-batch delay) replaces the sequential `for (const user of users)` loop. Both crons consume a shared `runInBatches` helper. New per-batch histograms (`cron.fin_ctx_batch_duration_ms`, `cron.portfolio_snapshot_batch_duration_ms`). 17/17 vitest pass, lint+typecheck clean. No engine bump. **Decision gate for Lever 2+3:** observe 3 consecutive cron runs (1 day each, both crons). If `cron.fin_ctx_shard_duration_ms` p95 < 60s AND `degradedSkipped ≤ 1` per run → close S.272 fully (mark Lever 2+3 explicitly retired). Otherwise revisit Lever 2 (`Retry-After` → cache TTL) and Lever 3 (AbortController on CB-open) with fresh telemetry. SPEC at `t2000/spec/active/shipping/SPEC_272_CRON_RATE_LIMITS.md`. |
| 1 | ~~**S.269-SMOKE**~~ | ~~Verify S.269 + V07E_INVOICE_DEPRECATION on prod~~ — **✅ VERIFIED** (founder smoke 2026-05-23 ~14:55 AEST). Create + list + cancel + invoice-intent-routing all green; visibility toggle works; delete-all-chats sidebar refreshes on next render trigger (acceptable). One follow-up surfaced: payment-link URL prefix → S.273 ship. | — | — |
| 2 | ~~**S.267-SMOKE**~~ | ~~Verify S.267 payment-link + invoice fix on prod~~ — superseded by S.269-SMOKE | — | — |
| 3 | **S.265-SMOKE** | **Verify S.265 heatmap tooltip fix on prod** | ~1 min founder | Vercel deploy from audric PR #110 squash-merge | Open activity heatmap, hover cells in the right-most ~6 columns (most-recent ~6 weeks). Tooltip should stay fully on-screen, centered on the cell midpoint, not overflowing the viewport edge. |
| 4 | **S.266-SMOKE** | **Verify S.266 receive_address canvas on prod** | ~3 min founder | Vercel deploy from audric PR #111 squash-merge + engine 2.14.2 npm propagation (~5 min) | (a) Tap the **Receive** chip → expect `ReceiveAddressCanvas` rendering (address + QR + Copy button), NOT a "what amount?" prompt for a payment link. (b) Type `Show my wallet address and a QR code so someone can pay me` → same canvas. (c) Copy button → "✓ Copied address" feedback for 1.5s. (d) Regression: `create a payment link for 50 USDC` → expect `create_payment_link` with the slug card (NOT the receive_address canvas). |
| 3.5 | ~~**S.268**~~ | ~~broader env-wiring repair~~ — **✅ SHIPPED via S.269 item 6** (`BRAVE_API_KEY` threaded via `ToolContextEnv`; `T2000_AUDRIC_API` deleted entirely) | — | — |
| 3.6 | ~~**S.270**~~ | ~~visibility toggle Unauthorized~~ — **✅ SHIPPED via S.269 item 2** (Server Action → API route + Biome ban + Vitest contract test) | — | — |
| 3.7 | ~~**S.271**~~ | ~~delete-all-chats sidebar sync~~ — **✅ SHIPPED via S.269 item 1** (`mutate(unstable_serialize(getChatHistoryPaginationKey))`) | — | — |
| 3 | ~~**S.264-SMOKE**~~ | ~~Verify S.264 fixes on prod~~ — **✅ VERIFIED** (founder smoke 2026-05-23 ~11:00 AEST). All 4 targets green: SUI sends correctly debit SUI (not USDC); activity heatmap shows 583 tx / 35 days / peak 78; full portfolio shows real "Activity (30d)" numbers. | — | — |
| 4 | ~~**S.263-SMOKE**~~ | ~~Re-smoke compound write with @audric recipient~~ — **✅ VERIFIED** (founder smoke 2026-05-23 ~10:10 AEST). All 4 targets green. | — | — |
| 3 | ~~**S.262-SMOKE**~~ | ~~Re-smoke compound writes on prod~~ — **✅ PARTIAL → completed via S.263.** | — | — |
| 4 | ~~**S.261-SCHEMA-TRIM**~~ | ~~Drop 4 dead `User` columns + tos-accept route~~ — **✅ SHIPPED S.261** (PR #106). | — | — |
| 5 | ~~**AUDRIC-BUMP-1**~~ | ~~Bump web-v2 to `@t2000/{sdk,engine}@2.14.x`~~ — **✅ SHIPPED S.260** (PR #105). | — | — |
| 6 | ~~**GW-REPRICE-1**~~ | ~~Gateway sub-cent reprice~~ — **✅ SHIPPED S.259** (45 routes). | — | — |
| 7 | ~~**CLI-CONTACTS-CLEANUP / S.279**~~ | ~~Add SuiNS to `T2000.send()` + deprecation path for `contacts.json`~~ — **✅ SHIPPED via S.279** (2026-05-23 ~19:25 AEST). `T2000.send()` accepts hex / `.sui` / saved-contact in priority order; `contacts.json` warns once-per-process on read; SuiNS resolver promoted from engine → SDK (canonical `packages/sdk/src/utils/suins.ts`, engine `sui/address.ts` is now a thin re-export shim). New `SendResult.suinsName?` field + new error code `SUINS_NOT_REGISTERED`. CLI receipt now renders "Sent $X USDC → alex.sui (0x8b3e…)". Mainnet smoke ✅ `funkii.sui → 0x40cd…3e62`. SDK + CLI + MCP + engine release pending (`gh workflow run release.yml --field bump=minor`). `composeTx.send_transfer` deliberately stays strict-hex (server callers resolve). Decision: per `single-source-of-truth.mdc`, promoting the resolver to the SDK eliminated the duplication risk that would have come from a parallel SDK-only mini-resolver. | — | — |
| 7.5 | **PIPELINE-AUDIT-PHASE-2** | **On-chain fetching pipeline simplification (founder-flagged)** | ~4-5d for full Phase 3 if all approved tracks ship | Founder triage on Phase 1 audit doc — slot AFTER S.274 closes | Phase 1 audit shipped at `t2000/spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` (read-only investigation; founder-requested). TL;DR: BV is doing genuinely hard work (replacement = ~2× the LoC + permanent per-protocol decoder maintenance) — the structural simplification target is INSIDE our codebase. Recommended Phase 3 tracks: **S1** split 2009-LoC `packages/engine/src/blockvision-prices.ts` into 6-7 focused files (~1d, pure refactor); **S2** audit + collapse 3 audric `lib/portfolio*.ts` files (~0.5d); **S3** wire canvases to `usePortfolio` SWR for shared cache (~3-4d staggered); **S5** drop dead BV per-protocol normalizers after telemetry (~0.5d). DEFER: S4 (engine cache trio factor), S6 (Pyth-pricing replacement). REJECT: S7 (full BV → native migration). Phase 2 needs production telemetry (BV outage frequency, per-protocol fire-rate, BV monthly cost) before locking the Phase 3 ship plan. **Sequencing locked 2026-05-23:** S.274 ships first (different lens — tool surface vs. data plumbing). Pairs naturally — S.272 fix (cron rate-limit hardening) overlaps the Phase 1 audit's S1+S5 tracks (they touch the same 2009-LoC file). Bundling decision: keep S.272 + S.274 + PIPELINE-AUDIT-PHASE-2 as 3 separate ships in series, NOT one omnibus. S.272 fix may overlap S1 split work — coordinate. |
| 8 | **SDK-ARCH-REVIEW** | **SDK / CLI architecture review** (founder-flagged) | TBD scoping | Founder-owned scoping | Founder said: *"i feel like our sdk or cli is heavily and complicated and might need a separate review of its design and architecture."* The S.258 work added two new layers (build-time intent resolution via `coinWithBalance`; dual-client gRPC-build-then-JSON-RPC-execute for gasless detection) that grew complexity without simplifying anything. CLI-CONTACTS-CLEANUP (#7) folds in here as a concrete deliverable. Worth a half-day "what could we delete?" pass. |
| 9 | **MPP-1 follow-ups** | Free-tier endpoint demo only | ~5min cut | None | Most MPP-1 plumbing shipped in S.257 + S.258 + S.259. Open: gateway endpoint at `price: '0.000'` to demonstrate `@suimpp/mpp@0.7.0`'s free-tier protocol surface (PR #4 from manolisliolios). 5-min PR + Vercel deploy. SPEC 26 simplifications mooted by S.258's wholesale revert. |
| 10 | ~~**MCP-1**~~ | ~~Reinstate `pay_api` in `@t2000/mcp`~~ — **✅ ALREADY SHIPPED** (closed S.256 / 2026-05-22) | — | — | **The S.255 §5 scoping was based on a faulty premise.** `t2000_pay` (write tool wrapping `agent.pay()`) + `t2000_services` (read tool hitting gateway directly) have always been alive in `@t2000/mcp`. **Action:** none. See S.256 for the audit. |
| 11 | **H3.2** | **Contacts Phase 2 — Prisma `UserPreferences.contacts` drop** | ~30 min | ~24h soak from S.243 ✅ complete | ✅ Already shipped as part of S.254 Prisma migration. **Verify:** `prisma db pull` against prod Neon should show the column gone. Likely just close as DONE. |
| 12 | ~~**H3.4**~~ | ~~Contacts Phase 4 — engine cleanup~~ — **✅ SHIPPED via S.269 item 4** (engine 2.16.0 deleted `saveContactTool` + `contacts.ts` entirely) | — | — |
| 13 | **H3.5** | **Contacts Phase 5 — send-history reverse-lookup audit** | ~0-2h | None | Audit web-v2 send-history rendering. IF it currently relies on contact-stored names → add live reverse-lookup at render (Audric directory + SuiNS, session-cached). IF send history already shows raw 0x or routes through `resolve_suins` live → $0 work. Audit-first ship. |
| 14 | **M1 / SPEC 31** | **CSP perimeter polish — SPEC 31** | ~6-9h + 24-48h Report-Only soak | Founder triage to lock SPEC scope | Per `spec/active/SPEC_31_SCOPING.md`. Highest-leverage agent-only ready-to-ship security slice. CSP nonces + missing directives + `securityheaders.com` A+ rating + companion `/api/mpp/payments` admin gate inline fix. Independent of v0.7e/v0.7f. |
| 15 | **D2** | **Phase 3.5 memory controls in `/settings/memory`** | TBD | MemWal SDK feature (`MemoryStore.forget()` etc. not yet exposed) | Per-record delete via `MemoryStore.forget()`, "explain why this fact was recalled" provenance, recall-frequency ranking. Phase 3 LITE shipped a read-only top-K disclosure surface; controls deferred. |
| 16 | **D6** | **`memwal-per-user-accounts`** | ~5-8d (depends on Q1+Q4 answers) | Founder triage; possibly Mysten coordination | Promote from founder-owned singleton (one `MEMWAL_PRIVATE_KEY`, per-user namespace strings) to per-user `MemWalAccount` factory. Reference impl: `MystenLabs/MemWal/apps/chatbot`. 4 open questions for SPEC scoping. |
| 17 | **M2** | **engine-fn-injection-refactor** | ~14-21h / 2-3 sessions | **REBASELINED:** wait until any remaining engine→audric self-fetches are localized. Audit `packages/engine/src/tools/*` for `process.env.AUDRIC_INTERNAL_API_URL` / `fetch(...AUDRIC...)` patterns FIRST — the scope may have shrunk to <5h | Founder triage | Original scope was 13 fetch sites across 7 tool files; post-S.253 most rewrites are dead. Re-audit before scoping. |
| 18 | **M3** | **engine-internal-key-final-delete** (`T2000_INTERNAL_KEY` env var retirement) | ~30 min | Blocked on M2 | Final cleanup. Drop `validateInternalKey` + `/api/internal/payments` route + env var schema entries. |
| 19 | **B1** | **Marketing landing — shadcn redesign** | ~6-10h | Post-DNS-flip (✅ now done — gated open) | The 15 components ported at S.253 (`apps/web-v2/components/landing/`) are excluded from Biome lint. L-4 lock still applies (copy is legal-vetted, only UI changes). Drop `!components/landing` from `biome.jsonc` once done. |
| 19.5 | ~~**D7** — first-session memory-reset banner~~ | ~~D-14 mitigation banner — once-per-user~~ | — | — | **❌ RETIRED 2026-05-23 ~16:10 AEST (founder call).** D-14's cold-start window has been live since Block A ship 2026-05-21 with zero user complaints across the (small) active user base. Founder time-boxed and formally retired the banner: ship-now value < ½d-of-engineering opportunity cost, and the SPEC v0.1 mitigation framing was overcautious for a user count this size. The TODO comment in `apps/web-v2/components/settings/memory-section.tsx:16` should be deleted as part of the next opportunistic touch in that file (no dedicated cleanup work needed). |
| 19.7 | **SPEC 39 — MCP remote migration** | **Deploy `@t2000/mcp` as remote HTTP-streamable MCP at `mcp.t2000.ai/api/mcp`** | ~1 week | MemWal-independent; no v0.7d gate dependency | Today `@t2000/mcp` ships as an npm package consumed locally by Cursor / Claude Desktop / Codex CLI via stdio. The MCP standard (Anthropic 2026-Q1) introduced HTTP-streamable transport with OAuth — every major host (Cursor, Claude.ai, Codex CLI) now prefers remote MCP. **Concrete scope:** (a) Vercel Function at `apps/gateway/api/mcp/route.ts` (or new `apps/mcp/`) wrapping the existing `@t2000/mcp` server in HTTP-streamable transport; (b) OAuth or zkLogin auth (founder pick — zkLogin would dovetail with Audric Passport); (c) `mcp.t2000.ai` DNS + Vercel project; (d) doc update — Cursor / Claude Desktop / ChatGPT Custom GPT instructions all change from "install npm package" to "add remote MCP URL." Win: every Audric capability becomes available in any MCP host without local install. **Status: NOT SCOPED.** No SPEC doc exists. Founder triage to lock scope before agent work. |
| 19.9 | **D8 — V07E_STALE_FINCONTEXT_WRITE_REFUSAL Phase 2** | **Drop dead Prisma columns + simplify the financial-context-snapshot cron** | ~20 min impl + Prisma migration + Q2/Q3 founder lock | None | Phase 1 SHIPPED via S.242 (Path 6 locked) — the LLM now ignores stale snapshots before refusing writes. Phase 2 = the cleanup tail. The cron at `apps/web-v2/app/api/cron/financial-context-snapshot/route.ts` still writes 2-3 columns that nothing reads from anymore. ~6 wasted DB writes per user per day. No correctness impact, just cosmetic. **Two open Q's blocking ship:** Q2 = Prisma migration timing (deploy-coupled vs. standalone migration); Q3 = audit coverage (do we want a regression test ensuring the columns don't sneak back into the cron payload?). Spec lives at `t2000/spec/active/V07E_STALE_FINCONTEXT_WRITE_REFUSAL.md`. **Slot ANY-TIME** — no dependencies, lowest priority work in this list. |
| 20 | ~~**D1**~~ | ~~V07E_INVOICE_DEPRECATION~~ — **✅ FULLY SHIPPED via S.269 item 7** (5 phases: engine tools deleted, web-v2 UI/API surface scrubbed, Neon migration applied — 50 invoice rows deleted, 6 columns dropped, CHECK constraint enforces `type='link'` at DB layer, post-deploy verified) | — | — |
| 21 | **D3** | **V07F_FORWARD_MAP (Agentic Commerce Phase 1)** | ~10-14 calendar days | D-1 lock + post-v0.7e Phase 4 close | 4 streams in `spec/active/V07F_FORWARD_MAP.md`. Stream A (single-vendor `pay_api` revival in web-v2 — Audric-chat-internal MPP buying) is the remaining unsolved piece. |
| 22 | **D4** | **v0.7g Agentic Commerce Phase 2-4** (multi-vendor + delivery + creator + escrow) | ~13-17d | Post-v0.7f | Audric Store launch dependency. |

---

## 🚨 Open SPECs (current state)

| SPEC | Status | File |
|---|---|---|
| **v0.7c Chat Shell Fork** | ✅ CLOSED — production-stable since 2026-05-20 (chat-flip + DNS-cutover both complete) | `t2000/spec/active/BENEFITS_SPEC_v07c.md` |
| **v0.7d MemWal** | ✅ CLOSED — Phase 7 done 2026-05-21 ~20:00 AEST per founder | `t2000/spec/active/BENEFITS_SPEC_v07d.md` (now has S.255 scope-compression note at top — E-1 deletion targets mostly closed-by-deletion via S.253/S.254) |
| **v0.7e Tier C Migration** | ✅ Phase 5 CLOSED S.253 (`apps/web` deleted) — D-1 ratify still pending for any future Audric-chat-side `pay_api` revival (handled via V07F Stream A; MCP-side pay was never lost — see S.256) | `t2000/spec/active/BENEFITS_SPEC_v07e.md` |
| **v0.7f Forward Map** | 📋 DOCUMENTED — Stream B done (S.245), Stream C + D substantially shipped via S.253; Stream A remains. (MCP-side pay was never an open stream — see S.256.) | `t2000/spec/active/V07F_FORWARD_MAP.md` |
| **SPEC 30 Cross-Repo Security** | Phase 1A + 1B SHIPPED; Phase 2-10 partially closed via v0.7d Block C + S.227 carve-out + S.253 archive; remaining = SPEC 31 candidate (CSP polish) | `t2000/spec/active/shipping/SPEC_30_CROSS_REPO_SECURITY_REVIEW.md` |
| **SPEC 31 CSP Polish** | 📋 SCOPED — agent-only ready-to-ship; founder triage required to lock | `t2000/spec/active/SPEC_31_SCOPING.md` |
| **V07E_INVOICE_DEPRECATION** | 📋 DRAFTED — DEFERRED S.240; outbound fix shipped S.239; deeper work waits on founder priority. Likely re-activates as one numbered item inside S.269's recommendation | `t2000/spec/active/V07E_INVOICE_DEPRECATION.md` |
| **AUDIT_V07E_TEMPLATE_DIVERGENCE** | 🚧 IN PROGRESS — S.269 read-only audit. Output: 1-page exec + 3 buckets (EARNS KEEP / DEBT / FOOT-GUN) + 1 concrete recommendation; founder picks scope from the recommendation | `t2000/spec/active/AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md` |

---

## 🔧 Where the code lives (web-v2 = production traffic surface)

| Concern | File |
|---|---|
| MemWal client singleton | `apps/web-v2/lib/memwal.ts` |
| Adapter (engine `MemoryStore` ↔ MemWal SDK) | `apps/web-v2/lib/audric/memwal-memory-store.ts` |
| Per-turn memory recall (`prepareStep`) | `apps/web-v2/lib/audric/memwal-prepare-step.ts` |
| Per-turn memory write (`onFinish`) | `apps/web-v2/lib/audric/memwal-write-callback.ts` |
| Memory settings UI + API | `apps/web-v2/components/settings/memory-section.tsx` + `app/api/memory/list/route.ts` |
| System prompt builder (4 layers, post-Block-A) | `apps/web-v2/lib/audric/system-prompt.ts` — layer 3 (memory) is injected by `prepareStep`, NOT this builder |
| Financial context snapshot job | `apps/web-v2/lib/jobs/financial-context-snapshot.ts` + cron route `app/api/cron/financial-context-snapshot/route.ts` |
| Portfolio snapshot job | `apps/web-v2/lib/jobs/portfolio-snapshot.ts` + `app/api/cron/portfolio-snapshot/route.ts` |
| Vercel cron schedule | `apps/web-v2/vercel.json` (5 entries) |
| Chat route (AI SDK v6 native + persistent chats + HITL) | `apps/web-v2/app/api/chat/route.ts` |
| Persistent chats schema | `apps/web-v2/prisma/schema.prisma` — `Chat`, `Message`, `Vote` (S.247) |
| Prisma client | `apps/web-v2/lib/generated/prisma/client` (auto-gen, never hand-edit) |
| Identity flows | `apps/web-v2/app/api/identity/{check,reserve,change}/route.ts` + `lib/identity/admission-control.ts` + `lib/suins-cache.ts` |
| User flows | `apps/web-v2/app/api/user/{status,tos-accept,preferences}/route.ts` |
| Marketing landing | `apps/web-v2/app/page.tsx` + `apps/web-v2/components/landing/*` (Biome-excluded, awaiting B1 redesign) |
| Static pages | `apps/web-v2/app/(legal)/*` + `app/litepaper/page.tsx` |
| Env validation (Zod schema + boot-time gate) | `apps/web-v2/lib/env.ts` + `instrumentation.ts` |
| Auth helpers | `apps/web-v2/lib/audric-auth.ts` |

**Tables permanently gone (S.254):** `LinkedWallet`, `WatchAddress`, `ConversationLog`, `UserPreferences.contacts` column. Pre-S.254 docs may still reference these — flag any sightings as stale.

**Tables permanently gone (v0.7d Block A — S.221):** `UserMemory`, `UserFinancialProfile`. Replaced by MemWal vector recall + MemWal `analyze` extraction.

**Engine tools permanently gone (v2.12.0 — S.245):** `pay_api`, `mpp_services`. The MCP package retains its own standalone `t2000_pay` + `t2000_services` (always did — see S.256); for Audric-chat-internal MPP buying, V07F Stream A is the remaining work.

---

## 🧰 Recurring agent guidance

### 1. Header-based auth in web-v2 (NOT cookies)

Every new authed fetch from a Client Component MUST forward `useZkLogin().session.jwt` via the `x-zklogin-jwt` header. Audric is header-based zkLogin, NOT cookie-based. Forgetting this is the most common P1 bug — surfaces as a 401 on every read.

Canonical pattern (from `memory-section.tsx`):

```tsx
const { session } = useZkLogin();
const res = await fetch("/api/memory/list", {
  headers: session?.jwt ? { "x-zklogin-jwt": session.jwt } : {},
});
```

### 2. Audit-first slice discipline

Pattern that landed v0.7d ~11 days ahead of schedule: BEFORE starting any phase, audit the SPEC's claims against the actual codebase. Many SPEC entries were written before S.253 (`apps/web` archive) or S.254 (Prisma drops) and reference paths/tables/files that no longer exist. A 5-minute `rg "<thing>" apps/web-v2` is the difference between shipping and re-implementing dead requirements.

### 3. Don't rebuild what's gone — verify-before-build

Concrete examples of what's gone (so you don't try to "fix" them):

- `apps/web` directory — DELETED S.253. Schema + migrations + Prisma client are now in `apps/web-v2/prisma/` + `apps/web-v2/lib/generated/`.
- `apps/server` / `infra/` — DELETED S.224. ECS/indexer are retired. No new readers from these surfaces.
- `UserMemory` / `UserFinancialProfile` Prisma models — DELETED S.221. Don't query them.
- `LinkedWallet` / `WatchAddress` / `ConversationLog` Prisma models — DELETED S.254. Don't query them.
- `UserPreferences.contacts` column — DELETED S.254. Contact persistence is gone end-to-end (web-v2 contacts UI deleted S.243).
- `pay_api` / `mpp_services` engine tools — DELETED S.245. External-LLM use (Claude Desktop / Cursor / Codex CLI) is already covered by `t2000_pay` + `t2000_services` in `@t2000/mcp` (always was — see S.256); Audric-chat-internal use needs V07F Stream A.
- `harness-metrics.ts` / `engine-context.ts` helper modules — DELETED with apps/web. TurnMetrics + SessionUsage now write inline in `apps/web-v2/app/api/chat/route.ts`.
- `init-engine-stores.ts` cache-injection pattern — DELETED with apps/web. Web-v2 uses per-request BlockVision cache (`portfolioCache: new Map()`) + canonical `getPortfolio()` 60s in-process cache. The DefiCacheStore / WalletCacheStore / NaviCacheStore injection pattern is dormant.
- `/api/internal/*` routes (profile-inference, memory-extraction, chain-memory, payments) — DELETED across S.221 + S.229. No internal-key routing.

### 4. ESLint flat config — rule arrays OVERRIDE, never duplicate the rule across blocks

If you add `no-restricted-syntax` / `no-restricted-imports` / `no-restricted-properties` selectors, **consolidate into the existing single rule entry**. Adding a second config block silently overrides the first. See `audric/apps/web-v2/eslint.config.mjs` (consolidated 2026-05-02 during SPEC 7 v0.4.1 C0.2). Note: web-v2 uses Biome (`biome.jsonc`) as the primary linter; the ESLint config is minimal but the rule still applies if you add to it.

### 5. The audric `.cursor/rules/*.mdc` are mostly current post-S.255

S.255 swept all 16 rules to fix `apps/web/` → `apps/web-v2/` paths and marked obsolete-architecture rules `[STALE]`. Specifically:

- `engine-context-assembly.mdc` was deleted in S.256 follow-up and replaced with `audric-context-assembly.mdc` (audric-side content builders, ~100 lines, points to t2000's `memory-injection-architecture.mdc` for the engine-side wiring contract). New companion rule `web-v2-chat-route-architecture.mdc` (~191 lines) maps the 2,989-line chat route + AI SDK v6 conventions + AI Gateway usage.
- `audric-canonical-portfolio.mdc` — the cache-injection example block is `[STALE]`; the canonical-fetcher principle still binds.
- `prisma-models-overview.mdc` — fully rewritten for the 11-model post-S.254 schema.

Don't trust a rule that pre-dates S.253; verify the file path still exists before relying on it.

### 6. Vercel CLI cheat sheet

```bash
cat /Users/funkii/dev/audric/.vercel/project.json   # what project is linked?
vercel project inspect                               # Root Directory check
vercel crons list                                    # ground-truth registered crons
vercel crons run /api/cron/portfolio-snapshot        # manual trigger (Vercel handles auth)
vercel env pull /tmp/.env.production --environment=production  # encrypted vars come through as ""
vercel ls                                            # recent deploys + statuses
```

Encrypted env vars (`CRON_SECRET`, `ANTHROPIC_API_KEY`, etc.) mask to empty strings via `env pull`. Use `vercel crons run` (which runs inside Vercel's runtime where env is fully decrypted) instead of curl-with-secret from local.

### 7. Driving smoke via DB query

The web-v2 codebase uses Prisma 7 + `@prisma/adapter-neon` for the Vercel runtime. To query prod from local:

```typescript
// vercel env pull /tmp/.env.production --environment=production
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

Run via `pnpm --filter @audric/web-v2 exec tsx <script>.ts`. **Delete the script + env file after use.**

---

## 📜 Audric Intelligence — the 4 systems (canonical, post-Block-A)

Pre-Block-A: 5 systems (Agent Harness + Reasoning Engine + Silent Profile + Chain Memory + AdviceLog).

Post-Block-A (2026-05-21): **4 systems.** MemWal absorbed Silent Profile + Chain Memory into a single Memory system.

1. **Agent Harness** — 26 tools (18 read + 8 write per S.277, engine 2.18.0), runtime, parallel reads + serial writes structurally serialized via AI SDK step model + `needsApproval` round-trip.
2. **Reasoning Engine** — 12 safety guards + complexity classifier + preflight + always-on extended thinking. (Pre-S.277 had 14 guards; `costWarning` + `artifactPreview` deleted as dead code.)
3. **Memory (MemWal)** — `@mysten-incubation/memwal` long-term vector memory (`prepareStep` recall + `onFinish` extraction) + daily `<financial_context>` snapshot for short-term orientation.
4. **AdviceLog** — `prisma.adviceLog.*` + `record_advice` audric-side tool + `buildAdviceContext()` (last 30 days hydrated each turn).

If you see a doc saying "5 systems," it's stale. S.221 + S.222 + S.254 swept t2000/CLAUDE.md + audric/CLAUDE.md + cursor rules + IntelligenceSection.tsx + litepaper + privacy policy to the 4-system framing.

---

## Cross-references

- **`t2000/audric-build-tracker.md`** — canonical session-by-session log. Latest: S.255. (Epoch break S.201→S.254 captured live in HANDOFF; resume normal cadence from S.256.)
- **`t2000/spec/active/`** — active SPECs (mostly local-only).
- **`t2000/spec/active/shipping/`** — SPECs with at least one phase shipped (tracked).
- **`t2000/spec/archive/v07d/`** — v0.7d SPEC archive (Phase 7 close).
- **`t2000/.cursor/rules/agent-harness-spec.mdc`** — Spec 1 + Spec 2 engine contracts (still binding).
- **`t2000/.cursor/rules/memory-injection-architecture.mdc`** — F-4 layer 3 contract (memory injection in `prepareStep`, not system-prompt builder).
- **`audric/.cursor/rules/`** — 16 rules, all swept S.255 to `apps/web-v2/` paths.
- **`t2000/HANDOFF_NEXT_AGENT.md`** — thin pointer to this file (t2000 is infra; audric is the active surface).

---

## ⏭️ TL;DR for next agent

1. **Read this file** + the most recent ~3 entries in `t2000/audric-build-tracker.md` (S.278 / S.277 / S.273). Together they're the current state.
2. **The next agent-ownable work, in order:**
   - **(a) S.274 — "Earns Its Keep" tool/feature audit.** ~1d audit + ~1d cuts. Read-only first pass. Output: 1-page doc + 3 buckets (KEEP / CUT NOW / WATCH). Founder-flagged hot. Slot AHEAD of PIPELINE-AUDIT-PHASE-2. Format = `spec/archive/v07e/AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md`.
   - **(b) S.272 follow-up** — observe 3 cron runs post-S.278. If `cron.fin_ctx_shard_duration_ms` p95 < 60s AND `degradedSkipped ≤ 1` per run → close S.272 (Lever 2+3 retired). Otherwise revisit. SPEC at `t2000/spec/active/shipping/SPEC_272_CRON_RATE_LIMITS.md`.
   - **(c) PIPELINE-AUDIT-PHASE-2** — S1+S2+S3+S5 from `t2000/spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md`. ~4-5d. Coordinate with S.272 Lever 2+3 IF they end up shipping (both touch `blockvision-prices.ts`).
   - **(d) B1 — Marketing landing shadcn redesign.** ~6-10h. Now unblocked (DNS-flip + L-4 copy lock).
   - **(e) SPEC 31 CSP polish** — agent-only ready-to-ship, pending founder lock.
   - **(f) SPEC 39 — MCP remote migration.** ~1 week. Founder-scope first; no SPEC doc exists yet.
   - **(g) D8 — V07E_STALE_FINCONTEXT_WRITE_REFUSAL Phase 2.** ~20 min. Cosmetic Prisma column drop + cron simplification. Lowest priority; slot any-time.
   - **(h) S.265-SMOKE / S.266-SMOKE** — verifications, ~5 min each.
3. **v0.7d state — most of the SPEC's named phases shipped or skipped on audit:**
   - Phase 1 (`MemWalMemoryStore` adapter) → ✅ SHIPPED Block A (S.221, 2026-05-21)
   - Phase 2 (`<memory_recall>` live in prod prompt) → ✅ SHIPPED Block A
   - Phase 3 (Settings Memory UI rebuild) → ✅ LITE SHIPPED (read-only top-K disclosure). Per-record controls = D2 in this backlog (rank 15).
   - Phase 4 (D-16 classifier migration) → ❌ SKIPPED (S.219 — the named files are pure regex/heuristics, no LLM. Phantom SPEC reference.)
   - Phase 5 (SPEC 40 HITL native migration) → ❌ SKIPPED (S.220 — already in prod via v0.7c Phase 3 D-8. Engine v3.0.0 cleanup folds into v0.7e archive.)
   - Phase 6 (engine library decouple + memory pipeline deletion) → ✅ Block A SHIPPED S.221; Block B/C absorbed by S.253 archive + S.224 ECS retire.
   - Phase 7 (cutover + 7d soak + first-session banner) → ✅ soak ran; D-14 banner formally **RETIRED** 2026-05-23 (founder call — cold-start been live 2 days zero complaints, ½d engineering cost not justified).
   - Phase 8 (post-soak deletion sweep + v0.7e unblock) → ✅ done via S.253 archive.
4. **The v0.7c 7d soak closes 2026-05-28.** That gate (combined with the 2026-05-29 MemWal stability checkpoint) is now mostly cosmetic — most v0.7d work shipped or got audited away. Once both gates fire, v0.7d formally closes; v0.7e Tier C cleanup is already substantially done via S.253.
5. **Before ANY code touch:** verify the surface still exists. S.253 + S.254 deleted a lot. The pattern is `rg "<file-or-table>" apps/web-v2/` (NOT `apps/web/` — that directory is gone).
6. **OPS-1 is still urgent.** The old `audric-web` Vercel project is still firing crons against prod Neon. 5-minute dashboard click. Nudge the founder if they haven't done it.
7. **Don't trust SPEC docs that pre-date S.253 without an audit.** Many reference deleted paths. The HANDOFF here is the freshest narrative. **MCP-1 is closed (see S.256) — `t2000_pay` + `t2000_services` were never removed from `@t2000/mcp`; the S.255 audit framing was wrong.**
