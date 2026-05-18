# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> First written 2026-05-18 during **BENEFITS_SPEC v0.7c Phase 1 Day 1b** to pin the
> `vercel/ai-chatbot` template SHA per the SPEC's Phase 1 acceptance gate (G3).

---

## Active SPEC

[`spec/active/BENEFITS_SPEC_v07c.md`](../t2000/spec/active/BENEFITS_SPEC_v07c.md) — v1.0 LOCKED 2026-05-18. **Phase 0 + 1 CLOSED; Phase 2 Day 2a/2b/2c/2c++ Batch 1 SHIPPED + LIVE SMOKE GREEN 2026-05-19 (engine v2.10.0 published; web-v2 changes committed; balance_check + perplexity_search end-to-end verified).** Day 2d (D-14 intent-dispatcher fate measurement) is next.

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Baseline + setup | ✅ CLOSED | G1 closed 2026-05-18 PM. F-12 (prompt cache) + F-13 (extended thinking) regressions found + shipped at engine v2.7.2; F-14 (classifier accuracy) shipped at engine v2.7.3. |
| Phase 1 — Side-by-side stand-up + template fork + Auth eviction | ✅ CLOSED (Day 1a/1b/1c/1d CLOSED + post-Day-1d audit CLOSED, G2 + G3 CLOSED, baseline typecheck + lint + production build all at 0 errors) | Day 1a (blank scaffold) ✅. Day 1b (template fork, pinned SHA `107a43a`) ✅. Day 1c (Auth.js eviction + zkLogin stub) ✅. Day 1d (baseline cleanup: F-17 + F-18 fixed, 38 files auto-fixed) ✅. **Post-Day-1d audit**: added `pnpm build` as third standing gate (PASSES); closed 4 P0 residue gaps. See S.167. |
| Phase 2 — First read-tool round-trip + AI Gateway + telemetry + matrix audit + Batch 1 simplifications | ✅ **CLOSED 2026-05-19 — Day 2a + 2b + 2c + 2c++ matrix + Batch 1 SHIPPED + LIVE SMOKE GREEN** | **Day 2a (S.168)**: `verifyJwt` + Google JWKS + Enoki address; `lib/prisma.ts` Neon WS adapter; new `/api/audric-chat` POST handler. **Day 2b (S.169)**: +3 env vars; vendored `sui-rpc.ts` + `cost-rates.ts`; new `system-prompt.ts` + `navi-mcp.ts` + `turn-metrics.ts` (`MinimalTurnMetricsCollector` 41-field row shape); end-to-end smoke verified (real $5,025.13 net worth via `tool-output-available` wire chunk; TurnMetrics row byte-for-byte production parity). **Day 2c (S.170)**: D-6 AI Gateway routing live via engine v2.9.0 → web-v2 `gateway('anthropic/claude-sonnet-4-6')` + `providerOptions.gateway.caching: 'auto'`; D-18 `experimental_telemetry` enabled; G6 5-feature smoke 3/5 ✓ live (F-1, F-2, F-5 prompt cache verified). **Day 2c++ matrix (S.171)**: read-only audit + 4-batch plan approved by founder. **Day 2c++ Batch 1 (S.172)**: TelemetryIntegration (replaces MinimalTurnMetricsCollector) + AI Elements `<Tool>` (replaces `<AudricToolPart>`) + `gateway.tools.perplexitySearch()` wired via new engine `gatewayTools` config + engine v2.10.0 published. **Live smoke 2026-05-19 04:30 AEST: balance_check + perplexity_search end-to-end GREEN via UI; total $5,020.12 verified; AI Elements `<Tool>` UI confirmed; POST → `/api/audric-chat` 200 on both turns; TurnMetrics rows persisted to NeonDB with intact 41-field shape.** Two pre-existing Day 2b client bugs (schema `content` vs `parts` mismatch + `useChat` non-reactive transport) surfaced during browser smoke and fixed inline. |
| Phase 3 onward | ⏳ PENDING | See SPEC. |

---

## 🎯 Immediate next session — Day 2d (D-14 intent-dispatcher fate measurement)

> **Batch 1 fully closed:** live smoke green 2026-05-19 04:30 AEST, audric changes committed. Move to Day 2d per the v0.7c plan.

### Day 2d brief — D-14 intent-dispatcher fate measurement

Per [`spec/active/BENEFITS_SPEC_v07c.md`](../t2000/spec/active/BENEFITS_SPEC_v07c.md) D-14 (TBD pending Phase 2 spike): the production `IntentDispatcher` in `audric/web` pre-fetches read-tool inputs (e.g. `balance_check`, `transaction_history`) BEFORE the LLM round-trip starts, on a heuristic match of the latest user message. The spec leaves D-14 as a measurement gate: **is the intent-dispatcher's net latency win still meaningful once we have `experimental_telemetry` + streaming tool dispatch?** If yes, port it to web-v2 in Phase 4. If no, sunset it.

**Concrete tasks for Day 2d:**

1. **Measure baseline (no dispatcher).** Capture 10 production-grade turns through `web-v2`'s `/api/audric-chat` (currently has NO dispatcher) and record per-turn `firstTokenMs`, `wallTimeMs`, `toolsCalled[0].latencyMs` from the TurnMetrics rows that just landed in NeonDB.
2. **Measure with dispatcher (legacy audric/web).** Capture 10 equivalent turns through `audric/web`'s `/api/engine/chat` route (which has the dispatcher) using the same wallet + same prompts. Pull the matching TurnMetrics rows.
3. **Statistical comparison.** Median + p95 of `firstTokenMs` and `wallTimeMs` across both cohorts. If web-v2 baseline beats legacy-with-dispatcher OR is within ~200ms — sunset the dispatcher. If legacy-with-dispatcher beats web-v2 baseline by >500ms — port the dispatcher in Phase 4.
4. **Capture findings** in `audric-build-tracker.md` S.173 + lock D-14 in the SPEC.

### Downstream batches

After Day 2d closes:
- **Batch 2 (SPEC 39 MCP remote migration)** — needs a formal `spec/active/SPEC_39_MCP_REMOTE_MIGRATION.md` draft first. ~1 week.
- **Batch 3 + 4** — see "Downstream batches" table below.

---

## Downstream batches (queued behind Day 2c++ Batch 1)

| Batch | Scope | Effort | Trigger to start |
|---|---|---|---|
| **Batch 2 — SPEC 39 MCP remote migration** | Deploy `@t2000/mcp` as Vercel Function at `mcp.t2000.ai/api/mcp` via `mcp-handler` + OAuth via `withMcpAuth`. Keep npm package as stdio→HTTP shim for legacy clients. | ~1 week | After Day 2c++ Batch 1 closes; draft `spec/active/SPEC_39_MCP_REMOTE_MIGRATION.md` first |
| **Batch 3 — SPEC 40 HITL `needsApproval` migration** | Replace `PendingAction` / `attemptId` / `/api/engine/resume` with AI SDK native `needsApproval` + `ToolApprovalResponse` + `addToolApprovalResponse`. Engine v3.0.0 candidate (breaking). | ~1–2 weeks | **AFTER Phase 6 cutover** (this touches the harness contract; needs dedicated AUDRIC_HARNESS_CORRECTNESS_SPEC v1.5 draft + 14-day canary plan) |
| **Batch 4 — Phase 6 sunset cleanup** | Delete legacy `audric/apps/web` chat route + useEngine.ts + chat components + engine `bridge/` + `streaming.ts` + `stream-checkpoint.ts` + `early-dispatcher.ts` + `orchestration.ts` runTools half. **~-10,800 LoC.** | Already in v0.7c scope | Triggered by Phase 6 cutover (DNS flip `audric.ai` → web-v2) |

---

## Pinned template SHA — `vercel/ai-chatbot`

| Field | Value |
|---|---|
| Repo | [`github.com/vercel/ai-chatbot`](https://github.com/vercel/ai-chatbot) |
| Pinned SHA | **`107a43a`** |
| Tag context | Latest stable commit on `main` as of 2026-04-17 ("drop kimi-k2-0905, default to kimi-k2.5", #1487). Includes the v1 architectural marker (`f9652b4` from 2026-03-20: "feat: v1 — persistent shell, model gateway, artifact improvements"). |
| Source URL (snapshot) | `https://github.com/vercel/ai-chatbot/tree/107a43a` |

### Why this SHA

| Reason | Detail |
|---|---|
| AI SDK v6 + tool approval is load-bearing for v0.7c U-1 | Landed in `4d3ba8d` (2025-12-19). v0.7c's Slice D win (U-1: native HITL via `useChat({ onToolCall, addToolResult })`) requires this. Any SHA before `4d3ba8d` is disqualified. |
| Includes the v1 architectural marker | `f9652b4` (2026-03-20) shipped "v1 — persistent shell, model gateway, artifact improvements". Pinning post-v1 means we vendor the stable architecture, not an in-progress refactor. |
| D-7 stays exactly as written | Template at `107a43a` is on `next-auth: 5.0.0-beta.25`. (An earlier commit `b4f595a` from 2026-03-13 was titled "migrate from next-auth to better-auth" but the change was reverted or never landed on `main` — verified by `rg 'better-auth' .` at `107a43a` returning zero hits. SPEC D-7's "delete `next-auth`" line is correct as written.) |
| Latest stable on `main` at fork time | `107a43a` is the most recent commit on `main` as of 2026-04-17. Pinning to the tip gives us the most lint fixes + bug fixes + model-registry currency. No newer commits between `107a43a` and Phase 1 Day 1b (2026-05-18). |

### Version compatibility audit (template vs audric)

| Dep | Template at `107a43a` | audric/web (Next 15) | Decision in fork |
|---|---|---|---|
| `next` | `16.2.0` | `^15` | **web-v2 stays on Next 16.** Side-by-side per D-1(b) accommodates the version split until Phase 6 cutover. Audric-wide bump to Next 16 is a future SPEC decision (not v0.7c scope). |
| `react` | `19.0.1` | `^19` | Compatible. |
| `ai` | `6.0.116` | `^6.0.182` | Audric is on a newer minor — pin web-v2 to the same `^6.0.182` to stay aligned with the engine. |
| `next-auth` | `5.0.0-beta.25` | — | **DELETE in Day 1c** per SPEC D-7 (b) — vendor-first, then strip in commit 2 of the fork. |
| `drizzle-orm` | `^0.34.0` | (audric uses Prisma) | **Keep in fork initially; swap to Prisma in Phase 2** per **D-9 (a) lock**. ~½ day translation cost as the SPEC budgets. |
| `@vercel/blob` | `^0.24.1` | `^2.3.3` | Audric is on a newer major — align web-v2 to `^2.3.3`. |
| `tailwindcss` | `^4.1.13` | `^4` | Compatible. |
| `typescript` | `^5.6.3` | `^5` | Compatible. |

### How to refresh the SHA later (if needed)

If a future SPEC bumps the template baseline:

1. Re-run `gh api 'repos/vercel/ai-chatbot/commits?per_page=20'` to inspect new commits.
2. Diff the new SHA against `107a43a` to identify breaking changes (esp. `app/(chat)`, `lib/db/`, `components/`).
3. Update this section's "Pinned SHA" + "Why this SHA" rows.
4. Update the SPEC's Phase 1 log entry.
5. Re-vendor with `scripts/vendor-template.sh` (TBD; written if/when refresh is needed).

---

## Open follow-ups

- **F-15** — Audric-wide Next 15 → 16 bump (separate SPEC; not v0.7c scope).
- **F-16** — Vendor-template refresh script (write only if we ever rebase off a newer template SHA mid-fork).
- ~~**F-17** — Template baseline TS errors~~ ✅ **CLOSED Day 1d.**
- ~~**F-18** — Vendored `biome.jsonc` references unknown rule names~~ ✅ **CLOSED Day 1d.**
- ~~**Day 1c eviction residue**~~ ✅ **CLOSED post-Day-1d audit (S.167).**
- ~~**Phase 2 hardening of Day 1c stub** — full `verifyJwt` + Google JWKS + Enoki address~~ ✅ **CLOSED Day 2a (S.168).**
- **Phase 2 SidebarUserNav sign-in wiring** — `components/chat/sidebar-user-nav.tsx` currently toasts "Sign-in is wired in Phase 2." for the guest path. Phase 3 wires the real zkLogin Google OAuth trigger.
- **Phase 3 — ZkLoginProvider real wallet wiring** — `lib/audric-auth-client.ts` currently children-passthrough; Phase 3 swaps for full `@mysten/dapp-kit` `WalletProvider` + Enoki client tree.
- **F-19** (P2 backlog) — wider env-gate sweep: refactor the ~25 template `process.env.X` reads through `env.X`. Not a Day 2c++/Day 2d blocker.
- **F-3 deeper diagnosis** (Day 2c open) — signed-thinking `signature_len=0` through gateway. Needs a direct-Anthropic cross-check for the same prompt. Lower priority — single-turn flows don't need signatures.
- **F-4 verification** (Day 2c open) — structured output passthrough waits on Phase 4.5 `generateObject` wire-up.
- **Vercel AI Gateway dashboard founder verification** (Day 2c open) — look for spans tagged `functionId=audric-chat-day2c` after deploying web-v2 to Vercel. Dev-mode they're visible via the gateway's request log.

---

## Active SPEC drafts pending (started but not yet drafted)

- `spec/active/SPEC_39_MCP_REMOTE_MIGRATION.md` — Day 2c++ Batch 2 spec. Migrate `@t2000/mcp` to Vercel-hosted remote MCP at `mcp.t2000.ai/api/mcp` via `mcp-handler` + `withMcpAuth`. Founder approved 2026-05-18 PM (override of original "KEEP" audit verdict).
- `spec/active/harness/AUDRIC_HARNESS_CORRECTNESS_SPEC_v1.5.md` — Day 2c++ Batch 3 spec. HITL redesign: `PendingAction`/`attemptId` → AI SDK `needsApproval` + `addToolApprovalResponse`. Engine v3.0.0 candidate.

---

## Cross-references

- `t2000/spec/active/BENEFITS_SPEC_v07c.md` — the active SPEC. **Read §"Phase 2 Day 2c++" for the full matrix + 4-batch execution plan.**
- `apps/web-v2/README.md` — what lives in the fork, sequenced by Day.
- `audric-build-tracker.md` row 7t (v0.7c phase tracker) + row 7y (Day 2c++ matrix commitment) + **S.171** (this session's audit + 4-batch approval).
- `t2000/HANDOFF_NEXT_AGENT.md` — t2000-side handoff (engine releases + SPEC 37 v0.7a closure history).
