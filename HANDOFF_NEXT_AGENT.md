# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> Last refreshed 2026-05-23 ~12:30 AEST post-S.267 (engine `receive` auth threading + observability — engine 2.15.0) + S.268-S.271 registered as DEFERRED-INTO-S.269 + S.269 (template-divergence audit) in flight. Previously refreshed 2026-05-23 ~11:35 AEST post-S.266. Originally rewritten 2026-05-22 ~17:30 AEST post-S.255. Previous Phase-6.5-era detail is preserved in git history (`git log -- HANDOFF_NEXT_AGENT.md`); the document is now a tight current-state-of-the-world view, not a session-by-session log. Session-by-session detail lives in `t2000/audric-build-tracker.md`.

---

## 🎯 Where we are right now (1-paragraph)

**`audric.ai` serves `apps/web-v2` end-to-end on `@t2000/{sdk,engine}@2.15.0`.** The DNS swap completed S.253 (~2026-05-22 ~21:30 AEST). `apps/web` is deleted (678 files, `git mv` preserved Prisma schema + migrations + generated client into web-v2). The `audric-web` Vercel project is domainless but still receives 5 cron pings (founder action: delete the project early via dashboard, no soak needed). MemWal is the single memory backbone (Silent Profile + Chain Memory collapsed into one "Memory" system, v0.7d Phase 6 Block A). `pay_api` + `mpp_services` engine tools are gone (S.245); MPP returns as a clean-slate Audric Store (V07F Stream A; MCP-side `t2000_pay` was never lost per S.256). **t2000@2.14.0 shipped S.258 (~2026-05-23 ~02:30 AEST)** — SPEC 26 reverted in gateway, `@mysten/sui` address-balance migration via `coinWithBalance` across SDK, true gasless MPP via `SuiGrpcClient` build path. **S.259 (~07:30 AEST) repriced 45 sub-cent gateway endpoints to $0.01** so every demo clears Sui's $0.01 gasless protocol floor. **S.260 (~08:30 AEST)** caught a SUI-source sponsored-swap regression in 2.14.0; patched in 2.14.1 (3 regression tests added). Audric web-v2 bumped to 2.14.1 via PR #105. **S.261 (~09:00 AEST)** schema trim follow-on to S.254 — dropped 4 dead `User` columns + 2 indexes + the unused `/api/user/tos-accept` route + `acceptTos()` hook callback (PR #106). **S.262 (~09:30 AEST)** atomic compound writes prompt fix — added `## CRITICAL: Compound writes MUST stay atomic` section to `system-prompt.ts` (PR #107). **S.263 (~10:00 AEST)** bundle-side SuiNS / `@audric` recipient resolution in `/api/transactions/prepare` (PR #108). **S.264 (~10:35 AEST)** founder reported two latent bugs: (a) FINANCIAL — `send_transfer({ asset: "SUI" })` silently shipped USDC due to a 3-layer hardcoded `"USDC"` trap. (b) UX — Activity heatmap permanently empty because `/api/analytics/activity-heatmap` was archived with apps/web in S.253 and never ported. Single-PR fix (PR #109) widened all 3 layers + ported activity-heatmap route + removed dead portfolio-multi fetch. **S.264-SMOKE verified** by founder (`swap 1 USDC → SUI then send 0.5 SUI to funkii.sui` correctly debits SUI; activity heatmap shows 583 tx / 35 days / peak 78). **S.265 (~11:00 AEST)** founder UX bug — heatmap tooltip overflowed viewport on right-most cells; fixed via `translateX(-50%)` + clamp to viewport in `ActivityHeatmapCanvas.tsx` (audric PR #110). **S.266 (~11:30 AEST)** founder gap — Receive chip routed through `create_payment_link` (requires amount), so the LLM correctly refused and offered fixed-amount payment link as the only QR-generating path. The `audric.ai/[username]` profile page already had `SuiPayQr({ amount: null })` for open-receive QR; the chat-side render_canvas template did not. Cross-repo ship: engine PR #89 added 9th canvas template `'receive_address'` → released as `@t2000/{sdk,engine,cli,mcp}@2.14.2`. Audric PR #111 added `ReceiveAddressCanvas.tsx`, registered in `CanvasTemplateRenderer`, added system-prompt guidance, bumped engine. **S.267 (~12:00 AEST)** founder smoke during S.266 verification: *"create a payment link for $1 USDC"* → tool ran but returned silently with `data: null` → no card rendered → LLM rephrased as *"unexpected result."* Root cause traced: engine `receive.ts` reads `context.env.AUDRIC_INTERNAL_KEY` but audric web-v2's chat route only threaded `AUDRIC_INTERNAL_API_URL` (S.198 closed half the env-threading gap; S.267 closes the other half). Fix shipped as engine 2.15.0 (12 grep-friendly `[receive] tool=… status=… url=… detail=…` warns at every failure surface across 6 tools — observability-only behavior change) + audric web-v2 commit `42dfa92` (1-line env addition: thread `T2000_INTERNAL_KEY` → `AUDRIC_INTERNAL_KEY`). Same fix silently re-enabled the canonical-API path for `portfolio_analysis` / `spending_analytics` / `yield_summary` / `activity_summary` which had been falling back to BlockVision direct (same numbers happy-case but structural SSOT bypass under degradation). **S.268-S.271 batch DEFERRED-INTO-S.269** (template-divergence audit started ~12:30 AEST). S.268 = remaining `BRAVE_API_KEY` + `T2000_AUDRIC_API` env-wiring repair (same bug class as S.267, fixing piecemeal duplicates audit work). S.270 = visibility toggle `Unauthorized` (Server Action calls `getCurrentUser()` reading `x-zklogin-jwt` header that browsers attach to fetch but Next.js doesn't propagate to Server Actions — exemplifies the template-vs-audric auth seam). S.271 = delete-all-chats sidebar sync bug (string-key SWR predicate doesn't match `useSWRInfinite` namespaced keys). **S.269 (~12:30 AEST onward)** = 1-day read-only audit producing `AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md` with 1-page exec summary, 3 buckets (EARNS KEEP / DEBT / FOOT-GUN), single concrete recommendation. Founder picks scope from the recommendation; doesn't touch existing v0.7d backlog gates (MemWal stability 2026-05-29, v0.7c soak 2026-05-28).

| Surface | Status |
|---|---|
| `audric.ai` apex | ✅ web-v2 |
| `/chat`, `/chat/[id]`, `/share/[id]` | ✅ web-v2 (AI SDK v6 native, persistent chats live S.247) |
| `/pay/[slug]`, `/settings/*`, `/[username]` | ✅ web-v2 |
| Marketing landing, /disclaimer, /privacy, /security, /terms, /litepaper | ✅ web-v2 (verbatim L-4 port; shadcn redesign deferred — B1) |
| `/api/identity/*` + `/api/user/*` (4 routes) | ✅ web-v2 (Path B port; rewrites deleted) |
| 5 production crons | ✅ web-v2/vercel.json (`financial-context-snapshot`, `portfolio-snapshot`, `turn-metrics-pending-sweep`, `turn-metrics-cleanup`, `conversation-log-retention`) |
| Engine | `@t2000/engine@2.15.0` (web-v2 ✅ on 2.15.0 post-S.267), 35 tools (24 read + 11 write), 9 canvas templates. S.267 added `[receive] tool=… status=… url=… detail=…` failure-path observability across 6 tools |
| SDK | `@t2000/sdk@2.15.0` (web-v2 ✅) — AB migration + gasless `T2000.pay()` + S.260 SUI-source sponsored-swap fix |
| CLI | `@t2000/cli@2.15.0` shipped — `gasless ⚡` badge live; first ever truly-gasless MPP CLI smokes verified mainnet |
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
| 0 | **S.269** | **Template-divergence cleanup — IN FLIGHT** (audit shipped, founder Q1-Q4 stamped, full slice ~6-7h) | ~6-7h, 5 phases (A audric · B engine · C audric pull · D invoice deprecation · E close) | None — phase A unblocks smoke; phases B-E sequence after | Formal SPEC: `t2000/spec/active/SPEC_269_TEMPLATE_DIVERGENCE_CLEANUP.md`. Audit pre-doc: `t2000/spec/active/AUDIT_V07E_TEMPLATE_DIVERGENCE_2026-05-23.md`. Folds S.268 + S.270 + S.271 + H3.4 (rank 12) + D1 invoice deprecation (rank 20). NEW item 0a (env-required hardening for `T2000_INTERNAL_KEY` + `AUDRIC_INTERNAL_API_URL`) added at front because post-S.267 smoke still empty — root cause likely env var unset in Vercel under `optionalString` schema. |
| 0.5 | **S.272** | **`financial-context-snapshot` cron Vercel 300s timeout** | ~30 min quick patch | Ship after S.269 closes | Cron at `apps/web-v2/lib/jobs/financial-context-snapshot.ts` + cron route timed out at 02:35:35 UTC (founder logs, 2026-05-23). ~150 addresses processed serially × 1.5-2s each + BlockVision 429 storms + 30s circuit-breaker windows = perilously close to 300s ceiling. **Quick patch (~30 min):** skip when BV circuit-breaker is open (job re-runs next 02:00 UTC); add 50ms jitter between users to spread RPS. **Bigger architectural fix:** chunk into batches via Vercel cron concurrency — folds into PIPELINE-AUDIT-PHASE-2 (rank 7.5). Quick-patch is enough for now; bigger fix waits on user-count growth. |
| 1 | **S.267-SMOKE** | **Verify S.267 payment-link + invoice fix on prod** | ~2 min founder | Vercel deploy from audric `42dfa92` + engine 2.15.0 npm propagation (~5 min) | (a) Chat *"create a payment link for $1 USDC"* → `<PaymentLinkCard>` renders with QR + Copy link button + slug. (b) Chat *"create an invoice for $50 due in 7 days"* → `<InvoiceCard>` renders with QR. (c) Regression check: `[receive]` warns visible in Vercel logs ONLY when the route 4xx/5xxs (happy path = no warns). |
| 2 | **S.265-SMOKE** | **Verify S.265 heatmap tooltip fix on prod** | ~1 min founder | Vercel deploy from audric PR #110 squash-merge | Open activity heatmap, hover cells in the right-most ~6 columns (most-recent ~6 weeks). Tooltip should stay fully on-screen, centered on the cell midpoint, not overflowing the viewport edge. |
| 3 | **S.266-SMOKE** | **Verify S.266 receive_address canvas on prod** | ~3 min founder | Vercel deploy from audric PR #111 squash-merge + engine 2.14.2 npm propagation (~5 min) | (a) Tap the **Receive** chip → expect `ReceiveAddressCanvas` rendering (address + QR + Copy button), NOT a "what amount?" prompt for a payment link. (b) Type `Show my wallet address and a QR code so someone can pay me` → same canvas. (c) Copy button → "✓ Copied address" feedback for 1.5s. (d) Regression: `create a payment link for 50 USDC` → expect `create_payment_link` with the slug card (NOT the receive_address canvas). |
| 3.5 | **S.268** | **DEFERRED-INTO-S.269** — broader env-wiring repair (BRAVE_API_KEY for web_search, T2000_AUDRIC_API legacy alias) | folded | inside S.269 recommendation | Same bug class as S.267. Fixing piecemeal duplicates the audit work S.269 already does. |
| 3.6 | **S.270** | **DEFERRED-INTO-S.269** — visibility toggle Unauthorized | folded | inside S.269 recommendation | Server Action `lib/actions/chat-visibility.ts` calls `getCurrentUser()` reading `x-zklogin-jwt` header. Browsers attach the header on direct `fetch()`, but Next.js doesn't propagate custom headers into Server Action invocations. Exemplifies the template-vs-audric auth seam — fix posture (action → API route fetch vs cookie sessions) is exactly what S.269's audit decides. Visibility toggle stays broken until S.269 lands. |
| 3.7 | **S.271** | **DEFERRED-INTO-S.269** — delete-all-chats sidebar sync | folded | inside S.269 recommendation | `delete-all-chats-button.tsx:54-58` uses `(key) => typeof key === "string" && key.includes("/api/history")` predicate against `useSWRInfinite` cache. `useSWRInfinite` keys are namespaced (`$inf$/api/history?…`) so the predicate matches NOTHING. Pattern fix: `mutate(unstable_serialize(getChatHistoryPaginationKey))` (`use-chat-visibility.ts:63` already uses it correctly). Trivial 3-line fix folded into S.269's SWR pattern audit. |
| 3 | ~~**S.264-SMOKE**~~ | ~~Verify S.264 fixes on prod~~ — **✅ VERIFIED** (founder smoke 2026-05-23 ~11:00 AEST). All 4 targets green: SUI sends correctly debit SUI (not USDC); activity heatmap shows 583 tx / 35 days / peak 78; full portfolio shows real "Activity (30d)" numbers. | — | — |
| 4 | ~~**S.263-SMOKE**~~ | ~~Re-smoke compound write with @audric recipient~~ — **✅ VERIFIED** (founder smoke 2026-05-23 ~10:10 AEST). All 4 targets green. | — | — |
| 3 | ~~**S.262-SMOKE**~~ | ~~Re-smoke compound writes on prod~~ — **✅ PARTIAL → completed via S.263.** | — | — |
| 4 | ~~**S.261-SCHEMA-TRIM**~~ | ~~Drop 4 dead `User` columns + tos-accept route~~ — **✅ SHIPPED S.261** (PR #106). | — | — |
| 5 | ~~**AUDRIC-BUMP-1**~~ | ~~Bump web-v2 to `@t2000/{sdk,engine}@2.14.x`~~ — **✅ SHIPPED S.260** (PR #105). | — | — |
| 6 | ~~**GW-REPRICE-1**~~ | ~~Gateway sub-cent reprice~~ — **✅ SHIPPED S.259** (45 routes). | — | — |
| 7 | **CLI-CONTACTS-CLEANUP** | **Add SuiNS to `T2000.send()` + remove `contacts.json` legacy** | ~3-5h | Folds into SDK-ARCH-REVIEW | New backlog item from S.263 architectural choice. CLI's `T2000.send()` (`packages/sdk/src/t2000.ts:568`) currently resolves recipients via local `contacts.json` (`packages/sdk/src/contacts.ts:70`) — two name-resolution systems in the SDK (CLI contacts AND nothing for SuiNS). The audric-side fix (S.263) deliberately did NOT touch this because it's a separate concern: (a) `contacts.json` is a CLI-only artifact (audric web has no filesystem), (b) SDK's `composeTx.send_transfer` strict-hex contract is intentional. Scope: add SuiNS resolution to `T2000.send()` (accepts hex / `.sui` / saved-contact, in that priority order) + ship a deprecation path for `contacts.json` (warn on read, sunset in next major). Also worth considering: should `composeTx.send_transfer` accept SuiNS? Probably not — keep it strict-hex, let callers resolve. Document the contract clearly in SDK README. |
| 7.5 | **PIPELINE-AUDIT-PHASE-2** | **On-chain fetching pipeline simplification (founder-flagged)** | ~4-5d for full Phase 3 if all approved tracks ship | Founder triage on Phase 1 audit doc | Phase 1 audit shipped at `t2000/spec/active/AUDIT_ON_CHAIN_PIPELINE_2026-05-23.md` (read-only investigation; founder-requested). TL;DR: BV is doing genuinely hard work (replacement = ~2× the LoC + permanent per-protocol decoder maintenance) — the structural simplification target is INSIDE our codebase. Recommended Phase 3 tracks: **S1** split 2009-LoC `packages/engine/src/blockvision-prices.ts` into 6-7 focused files (~1d, pure refactor); **S2** audit + collapse 3 audric `lib/portfolio*.ts` files (~0.5d); **S3** wire canvases to `usePortfolio` SWR for shared cache (~3-4d staggered); **S5** drop dead BV per-protocol normalizers after telemetry (~0.5d). DEFER: S4 (engine cache trio factor), S6 (Pyth-pricing replacement). REJECT: S7 (full BV → native migration). Phase 2 needs production telemetry (BV outage frequency, per-protocol fire-rate, BV monthly cost) before locking the Phase 3 ship plan. |
| 8 | **SDK-ARCH-REVIEW** | **SDK / CLI architecture review** (founder-flagged) | TBD scoping | Founder-owned scoping | Founder said: *"i feel like our sdk or cli is heavily and complicated and might need a separate review of its design and architecture."* The S.258 work added two new layers (build-time intent resolution via `coinWithBalance`; dual-client gRPC-build-then-JSON-RPC-execute for gasless detection) that grew complexity without simplifying anything. CLI-CONTACTS-CLEANUP (#7) folds in here as a concrete deliverable. Worth a half-day "what could we delete?" pass. |
| 9 | **MPP-1 follow-ups** | Free-tier endpoint demo only | ~5min cut | None | Most MPP-1 plumbing shipped in S.257 + S.258 + S.259. Open: gateway endpoint at `price: '0.000'` to demonstrate `@suimpp/mpp@0.7.0`'s free-tier protocol surface (PR #4 from manolisliolios). 5-min PR + Vercel deploy. SPEC 26 simplifications mooted by S.258's wholesale revert. |
| 10 | ~~**MCP-1**~~ | ~~Reinstate `pay_api` in `@t2000/mcp`~~ — **✅ ALREADY SHIPPED** (closed S.256 / 2026-05-22) | — | — | **The S.255 §5 scoping was based on a faulty premise.** `t2000_pay` (write tool wrapping `agent.pay()`) + `t2000_services` (read tool hitting gateway directly) have always been alive in `@t2000/mcp`. **Action:** none. See S.256 for the audit. |
| 11 | **H3.2** | **Contacts Phase 2 — Prisma `UserPreferences.contacts` drop** | ~30 min | ~24h soak from S.243 ✅ complete | ✅ Already shipped as part of S.254 Prisma migration. **Verify:** `prisma db pull` against prod Neon should show the column gone. Likely just close as DONE. |
| 12 | **H3.4** | **Contacts Phase 4 — engine cleanup** | ~30 min | None | Delete `packages/engine/src/tools/contacts.ts` + `add-recipient.ts` from `@t2000/engine`, remove from `tool-flags` + `tool-policy` + `tools/index`, delete tests, bump minor + publish. Unused exports today — no functional impact, just dead code drag. |
| 13 | **H3.5** | **Contacts Phase 5 — send-history reverse-lookup audit** | ~0-2h | None | Audit web-v2 send-history rendering. IF it currently relies on contact-stored names → add live reverse-lookup at render (Audric directory + SuiNS, session-cached). IF send history already shows raw 0x or routes through `resolve_suins` live → $0 work. Audit-first ship. |
| 14 | **M1 / SPEC 31** | **CSP perimeter polish — SPEC 31** | ~6-9h + 24-48h Report-Only soak | Founder triage to lock SPEC scope | Per `spec/active/SPEC_31_SCOPING.md`. Highest-leverage agent-only ready-to-ship security slice. CSP nonces + missing directives + `securityheaders.com` A+ rating + companion `/api/mpp/payments` admin gate inline fix. Independent of v0.7e/v0.7f. |
| 15 | **D2** | **Phase 3.5 memory controls in `/settings/memory`** | TBD | MemWal SDK feature (`MemoryStore.forget()` etc. not yet exposed) | Per-record delete via `MemoryStore.forget()`, "explain why this fact was recalled" provenance, recall-frequency ranking. Phase 3 LITE shipped a read-only top-K disclosure surface; controls deferred. |
| 16 | **D6** | **`memwal-per-user-accounts`** | ~5-8d (depends on Q1+Q4 answers) | Founder triage; possibly Mysten coordination | Promote from founder-owned singleton (one `MEMWAL_PRIVATE_KEY`, per-user namespace strings) to per-user `MemWalAccount` factory. Reference impl: `MystenLabs/MemWal/apps/chatbot`. 4 open questions for SPEC scoping. |
| 17 | **M2** | **engine-fn-injection-refactor** | ~14-21h / 2-3 sessions | **REBASELINED:** wait until any remaining engine→audric self-fetches are localized. Audit `packages/engine/src/tools/*` for `process.env.AUDRIC_INTERNAL_API_URL` / `fetch(...AUDRIC...)` patterns FIRST — the scope may have shrunk to <5h | Founder triage | Original scope was 13 fetch sites across 7 tool files; post-S.253 most rewrites are dead. Re-audit before scoping. |
| 18 | **M3** | **engine-internal-key-final-delete** (`T2000_INTERNAL_KEY` env var retirement) | ~30 min | Blocked on M2 | Final cleanup. Drop `validateInternalKey` + `/api/internal/payments` route + env var schema entries. |
| 19 | **B1** | **Marketing landing — shadcn redesign** | ~6-10h | Post-DNS-flip (✅ now done — gated open) | The 15 components ported at S.253 (`apps/web-v2/components/landing/`) are excluded from Biome lint. L-4 lock still applies (copy is legal-vetted, only UI changes). Drop `!components/landing` from `biome.jsonc` once done. |
| 20 | **D1** | **V07E_INVOICE_DEPRECATION** | ~4-5h / 5 phases | Founder priority restoration | Mini-SPEC at `spec/active/V07E_INVOICE_DEPRECATION.md` — drafted S.239, OUTBOUND-interface fix shipped, deeper deprecation waits. Drops invoice as a distinct product (~95% overlap with payment links). |
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

1. **Agent Harness** — 35 tools (24 read + 11 write per S.245), runtime, parallel reads + serial writes under tx mutex.
2. **Reasoning Engine** — 14 safety guards + complexity classifier + preflight + always-on extended thinking.
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

1. **Read this file** + **read S.255 in `t2000/audric-build-tracker.md`**. Together they're the current state.
2. **Ask the founder what's next.** Most likely: (a) advance MPP-1 (founder-owned suimpp/MPP/gateway work); (b) lock SPEC 31 (CSP polish, agent-only ready-to-ship pending founder triage); (c) close H3.2/H3.4/H3.5 contact-cleanup loose ends. **MCP-1 is closed (see S.256) — `t2000_pay` + `t2000_services` were never removed from `@t2000/mcp`; the S.255 audit framing was wrong.**
3. **Before ANY code touch:** verify the surface still exists. S.253 + S.254 deleted a lot. The pattern is `rg "<file-or-table>" apps/web-v2/` (NOT `apps/web/` — that directory is gone).
4. **OPS-1 is urgent.** The old Vercel project is still firing crons against prod Neon. 5-minute dashboard click. Nudge the founder if they haven't done it.
5. **Don't trust SPEC docs that pre-date S.253 without an audit.** Many reference deleted paths. The HANDOFF here is the freshest narrative.
