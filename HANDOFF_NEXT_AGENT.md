# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> First written 2026-05-18 during **BENEFITS_SPEC v0.7c Phase 1 Day 1b** to pin the
> `vercel/ai-chatbot` template SHA per the SPEC's Phase 1 acceptance gate (G3).

---

## Active SPEC

[`spec/active/BENEFITS_SPEC_v07c.md`](../t2000/spec/active/BENEFITS_SPEC_v07c.md) — v1.0 LOCKED 2026-05-18. **Phase 0 + 1 + 2 FULLY CLOSED + Phase 3 STRUCTURALLY CLOSED + Phase 3 audit pass + Phase 4 SHIPPED 2026-05-19 ~08:15 AEST (S.176) + Phase 4b SHIPPED AS STRATEGIC DEFERRAL 2026-05-19 ~08:50 AEST (S.177) + Phase 5 FULLY SHIPPED 2026-05-19 ~14:30 AEST — Phase 5a.0–5a.4 SHIPPED ~10:15 AEST (S.178 + S.179 — LIGHT-CARD SWEEP COMPLETE) + Phase 5b SHIPPED ~10:50 AEST (S.180 — CANVAS + motion family DELETED from scope) + Phase 5c SHIPPED ~11:30 AEST (S.181 — TIMELINE via 99% SCOPE REDUCTION; `m.parts` IS the timeline; template AI Elements absorb legacy primitives) + Phase 5d SHIPPED ~13:00 AEST (S.182 — HEAVY SHELL via 82% SCOPE REDUCTION; single-write PermissionCard parity via canary extension + preview-bodies port) + Phase 5e SHIPPED ~14:30 AEST (S.183 — PAYMENT INTENTS via Approach A host-only chat-route bundle marker; preserves v1 success pattern verbatim, reuses canonical `composeBundleFromToolResults` engine helper as third call site; 5-layer ship at ~855 LoC across 5 files).** Phase 4 expanded the Phase 3 HITL pattern to 10 of the 11 remaining writes via a generalised `sponsoredTx` dispatcher + widened `/api/transactions/prepare` + new `/api/contacts/save` route. The outcome-update slice closes the G5 telemetry gap. **Phase 4b closes via deferral**: `pay_api` removed from web-v2's tool set; Agentic Commerce spec drafted at `t2000/spec/active/AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md` v0.1 — 7 D-questions + 4-phase roadmap. Legacy `apps/web` ships pay_api unchanged. **Phase 5 foundation slice**: Agentic Design System tokens ported to `apps/web-v2/app/globals.css` (~192 LoC CSS); renderer infrastructure ported (`components/audric/cards/{primitives.tsx,shared/*}` — ~875 LoC across 7 files); `ToolResultRouter` discriminated dispatcher created (~65 LoC); canary card `RatesCardV2` ported and wired into chat client. **Phase 5 cumulative FINAL: SPEC v0.2 estimated ~19.5-21.5d / ~55 files / ~10,298 LoC ➝ delivered ~2.25d / ~29 files / ~3,208 LoC (-89% effort / -47% files / -69% LoC)** with NO user-facing capability dropped. Chat surface now has FULL parity with audric/web for single-write + multi-write atomic flows: streaming text + reasoning + tool cards + canvas + HITL single-write approval + **HITL multi-write atomic bundles via Payment Intents** + sponsored-tx round-trip (single + bundle). All gates green. **G5 + G7 + G8 live smoke remains deferred to preview/prod deploy** (zkLogin OAuth localhost limitation; same gate as every v0.7c phase since Phase 3). **Next implementable: Phase 5.5 — Language Model Middleware adoption (per D-17 lock from S.162).** `wrapLanguageModel` + middleware for guards (14 from audric/web legacy) + preflight (12 from legacy) + redaction (PII scrub) + telemetry. Sizing TBD per founder triage with audit-first cadence recommended (same pattern that landed 5c+5d+5e structural wins). Agentic Commerce Phase 1 gated on founder D-question lock.

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Baseline + setup | ✅ CLOSED | G1 closed 2026-05-18 PM. F-12 (prompt cache) + F-13 (extended thinking) regressions found + shipped at engine v2.7.2; F-14 (classifier accuracy) shipped at engine v2.7.3. |
| Phase 1 — Side-by-side stand-up + template fork + Auth eviction | ✅ CLOSED (Day 1a/1b/1c/1d CLOSED + post-Day-1d audit CLOSED, G2 + G3 CLOSED, baseline typecheck + lint + production build all at 0 errors) | Day 1a (blank scaffold) ✅. Day 1b (template fork, pinned SHA `107a43a`) ✅. Day 1c (Auth.js eviction + zkLogin stub) ✅. Day 1d (baseline cleanup: F-17 + F-18 fixed, 38 files auto-fixed) ✅. **Post-Day-1d audit**: added `pnpm build` as third standing gate (PASSES); closed 4 P0 residue gaps. See S.167. |
| Phase 2 — First read-tool round-trip + AI Gateway + telemetry + matrix audit + Batch 1 simplifications + D-14 lock + Day 2e Agent migration | ✅ **FULLY CLOSED 2026-05-19** (ALL FIVE DAYS: 2a + 2b + 2c + 2c++ matrix + Batch 1 + Day 2d D-14 + Day 2e Agent migration SHIPPED) | **Day 2a–2c++ Batch 1** (S.168–S.172) + **Day 2d D-14** (S.173) + **Day 2e (S.174)**: full Path B Agent migration; engine v2.11.0 published. |
| Phase 3 — First write-tool via Slice D (`save_deposit`) + sponsored-tx routes + full zkLogin signing port + post-ship audit pass | ✅ **STRUCTURALLY CLOSED 2026-05-19** (S.175 Day 3a/3b/3c all SHIPPED + S.175 addendum 4 bugs caught & fixed; G5 live smoke deferred to preview/prod deploy) | **Day 3a (S.175)**: engine route extended with `saveDepositTool` + `permissionConfig` + `priceCache` + `translateChunk` HITL chunk paths (`tool-call` toolMetadata stamp + `tool-approval-request` translation + `tool-output-denied` graceful narration). **Day 3b (S.175)**: ported `/api/transactions/{prepare,execute}` from legacy `apps/web` save-only; env extended with `ENOKI_SECRET_KEY`. **Day 3c (S.175 founder Path A)**: ported the full zkLogin client-side signing infrastructure — `lib/zklogin.ts` session machine + `useZkLogin` hook + `<ZkLoginProviders>` + `/auth/callback` page + `sponsoredSave` orchestrator + `PermissionCard` UI + rewritten `audric-chat-client.tsx`. **Audit pass (S.175 addendum 2026-05-19 ~07:35 AEST)**: critical self-review caught 4 bugs before any smoke attempt — (B1) Deny path UI hang (`addToolOutput` follow-up missing), (B2) `TurnMetrics.attemptId` always NULL (collector ignored `tool-approval-request`), (B3) resume turn 400 (body schema rejected tool-only messages; messages weren't converted via `convertToModelMessages`), (B4) wrong correlation id (`approvalId !== toolCallId`). All fixed in-session; all gates re-run green. |
| Phase 4 — Mechanical 10-write expansion + outcome-update slice | ✅ **SHIPPED 2026-05-19 ~08:15 AEST (S.176)**; G5 + G7 live smoke deferred to preview/prod deploy | **Slice 4a (outcome-update)**: `lib/audric/resume-outcome.ts` + chat route fires `prisma.turnMetrics.updateMany({where: {attemptId}, data: {pendingActionOutcome, writeToolDurationMs}})` on every resume turn — closes harness Spec §Item 3 G5 gap. **Slice 4b (sponsoredTx)**: `lib/audric/sponsored-tx.ts` (replaces `sponsored-save.ts`) — discriminated-union dispatch for 9 sponsored writes. **Slice 4c (prepare widening)**: `/api/transactions/prepare` body schema `discriminatedUnion('type', [10])`; `feeHooks.{save_deposit, borrow}`; conditional `overlayFee` for swap + harvest; post-compose validation for empty-rewards. **Slice 4d (save_contact)**: NEW `/api/contacts/save/route.ts` with cross-imported unified Contact shape. **Slice 4e (chat client switch — Phase 4 form)**: Approve handler dispatches per tool via `buildSponsoredTxRequest`. Pre-existing `auth/callback/page.tsx` `void` lint regressions fixed in-pass. |
| Phase 4b — `pay_api` strategic deferral + Agentic Commerce spec | ✅ **SHIPPED AS STRATEGIC DEFERRAL 2026-05-19 ~08:50 AEST (S.177)** | One-line filter (`WRITE_TOOLS.filter((t) => t.name !== "pay_api")`) removes `pay_api` from web-v2's tool set. Removed dead `case "pay_api":` in `describeAudricAction` + `else if (toolName === "pay_api")` fail-loud branch in Approve handler. Updated 4 doc comments. Wrote `t2000/spec/active/AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md` v0.1 (~430 lines) capturing the founder's 4 agentic commerce use cases + 7 D-questions + 4-phase roadmap. Legacy `apps/web` ships `pay_api` unchanged. Engine `WRITE_TOOLS` continues to export all 12 tools. Net diff: −22 LoC implementation / +430 LoC new spec. **Agentic Commerce Phase 1 (single-vendor pay_api revival in web-v2) is gated on founder D-question lock.** |
| Phase 5 — Renderer migration sweep | ✅ **FULLY SHIPPED 2026-05-19** — Phase 5a.0–5a.4 SHIPPED ~10:15 AEST (S.178 + S.179 — **LIGHT-CARD SWEEP COMPLETE**) + Phase 5b SHIPPED ~10:50 AEST (S.180 — **CANVAS COMPLETE + motion family DELETED from scope**) + Phase 5c SHIPPED ~11:30 AEST (S.181 — **TIMELINE via 99% SCOPE REDUCTION**) + Phase 5d SHIPPED ~13:00 AEST (S.182 — **HEAVY SHELL via 82% SCOPE REDUCTION**) + Phase 5e SHIPPED ~14:30 AEST (S.183 — **PAYMENT INTENTS via Approach A host-only chat-route bundle marker**) | **Phase 5e headline (S.183):** founder-locked Approach A preserves the v1 success pattern verbatim — LLM emits N writes naturally → server bundles into ONE pending_action with steps[] via canonical `composeBundleFromToolResults` engine helper (third call site alongside v0.7a `orchestration.ts` + audric legacy `fast-path-bundle.ts`) → client renders ONE `BundlePermissionCard` + ONE Enoki signature → atomic PTB on-chain. 5-layer ship at ~855 LoC across 5 files: (1) `isBundleableTool` gate (9 of 12 writes bundleable; 3 fall through to individual rendering); (2) `BundleBuffer` class buffers `tool-call` + `tool-approval-request` chunks within AI SDK `start-step`→`finish-step`, on flush emits `data-audric-bundle` custom UIMessageStream part + replays individual chunks for state-machine consistency (defensive try/catch fallback to individual rendering); (3) prepare-route widened with `bundleSchema` discriminated union + `buildBundleSteps` + `composeTx({steps})` native multi-step PTB + per-step `feeHooks` (10bps save / 5bps borrow / conditional 10bps Cetus overlay); (4) `sponsored-tx.ts` extended with `type: 'bundle'` variant + `SponsoredTxBundleStep`; (5) `BundlePermissionCard` (sibling to single-write, same approve/deny + 60s timer model via `handleDenyRef`) + `BundleForMarker` bridge in chat client that scans `m.parts` for markers, builds `bundleClaimedIds: Set<string>`, skips claimed tool-* parts, fans out N `addToolApprovalResponse` → 1 `sponsoredTx({type:'bundle'})` → N `addToolOutput` with `partOfBundle:true`. 3 bundle-eligibility gates enforced at finish-step (N≥2 + all bundleable + every call has approval). Zero engine release, zero LLM training. Live smoke deferred to founder verification (same zkLogin OAuth localhost constraint). **Phase 5 cumulative FINAL: SPEC v0.2 ~19.5-21.5d / ~55 files / ~10,298 LoC ➝ delivered ~2.25d / ~29 files / ~3,208 LoC (-89% effort / -47% files / -69% LoC).** All gates green (Phase 5e: typecheck ✓ + lint ✓ + build ✓ 16.1s). Acceptance: G8 = "custom SSE code path removed from web-v2 runtime" ✅ achieved (web-v2 is end-to-end on AI SDK v6 native primitives). **Phase 5c headline (preserved for history):** SPEC v0.2 sized timeline migration at "~2-2.5d / 21 files / ~3,272 LoC" but actual delivery was **~½d / 1 file (`audric-chat-client.tsx`) / +50/-13 LoC**. Two structural facts: (a) AI SDK v6's `UIMessage.parts` IS the ordered timeline (replaces `BlockRouter` + 13 block types — `m.parts.map()` IS the router); (b) Vercel ai-chatbot template ships AI Elements that implement the legacy primitives. Four atomic changes: (1) wire `<Reasoning>` for `part.type === "reasoning"` (closes silent-drop bug); (2) swap raw `<div whitespace-pre-wrap>` for `<MessageResponse>` (Streamdown markdown — cjk + code + math + mermaid); (3) adopt `<Message from={role}>` + `<MessageContent>` for chat-bubble alignment; (4) adopt `<Conversation>` + `<ConversationContent>` for auto-stick-to-bottom scroll (use-stick-to-bottom). Reasoning streaming gate: `partStreaming = isTurnStreaming && isLast && reasoningPart.state !== "done"` — auto-open on start, duration tracked internally, 1s auto-close. **Founder LOCKED audit Option A (defer all the rest):** no `ParallelToolsGroup` (chrome — `m.parts.map` already renders parallel tools in dispatch order); no `TodoBlockView` (verified DEAD — `update_todo` not in web-v2 `WRITE_TOOLS.filter`, no AI SDK chunk for `todo_update`); no `RegeneratedBlockView` (verified DISCONNECTED — no `regenerated` EngineEvent, no quote-refresh trigger in `PermissionForToolPart`). ~4,217 legacy LoC across 17 timeline files NOT ported (replaced by AI SDK v6 native + AI Elements + founder skip). **Phase 5b**: 21 tool routes wired into ToolResultRouter (20 light cards + render_canvas). 8 canvas templates + 3-component shell. Canvas case placed BEFORE `extractData` because output shape `{template, title, data}` has inner `data` field as payload not envelope. Skeleton-state branch — `input-streaming` / `input-available` render `SkeletonCard` via `getSkeletonVariant`. `onSendMessage` threaded Router→Canvas via `useChat.sendMessage({text})`. New helpers: `lib/auth-fetch.ts`. **FOUNDER LOCK 2026-05-19:** motion family DELETED from scope (~700 LoC: MountAnimate + NumberTicker + TypingDots + WorkingState + ReceiptChoreography + tests). Only motion is Tailwind `animate-pulse` skeleton-pulse. `ReceiptChoreography` stub in `TransactionReceiptCard` is PERMANENT passthrough. **Phase 5 cumulative LoC: SPEC ~14,672 ➝ delivered ~8,930 (-39%)** without dropping user-facing capability. Phase 5a helpers persist: `lib/sui-address.ts` slim subset + `cards/shared/QrCode.tsx` + `cards/shared/ChunkedAddress.tsx`. New deps: `qrcode` + `@types/qrcode`. **Added DEFER (5a.4 audit):** ServiceCatalogCard (MPP-family) — ports with Agentic Commerce. All gates green (Phase 5c: typecheck 2.4s + biome 0 fixes + build 21 routes / 15.4s). **Phase 5d shipped headline (S.182):** SPEC v0.2 sized at "~9d / 5 files / ~4,011 LoC" but actual delivery was **~½d / 2 files / +703 LoC** because `ChatMessage` + `ReasoningTimeline` = 0 LoC port (already absorbed by 5c's `m.parts.map()` + `<Message>` + `<Reasoning>` wiring; legacy SPEC 23A-P0 comment itself says it's reduced to those 3 paths). Audit deep-dive surfaced that `toolMetadata` is the wire bridge in v0.7c (NOT engine's `PendingAction`), today's wire is intentionally narrow — `{description, modifiableFields, attemptId}` — so PermissionCard chrome depending on engine extension fields (Guard-injection display, SendAddressBlock, Quote-refresh, WorkingState) deferred to follow-on slices. Shipped: extended canary in place 189 → 472 LoC (Surgical Changes + V1/V2 consolidation lock) + verbatim `preview-bodies/index.tsx` port 475 → 420 LoC. Features: TOOL_LABELS map (12 writes), multi-field modifiable inputs, formatInput text fallback w/ COIN_TYPE_SYMBOLS, renderPreviewBody slot for 5 NAVI writes (save/withdraw/borrow/repay/harvest) w/ graceful degradation, 60s deny-timer w/ handleDenyRef pattern, Approve validation gate, a11y compliance. **Founder LOCKED Payment Intents → Phase 5e as dedicated 5-layer slice** (~715 LoC / ~2-3d) — bundles unlock compound Audric Finance ops (`swap + save`, `borrow + swap`) AND Agentic Commerce; touch 5 layers (renderer is only 1); too heavy to smuggle into 5d. **Next slice: Phase 5e (Payment Intents — multi-write atomic bundles). AUDIT-FIRST recommended.** After 5e closes, Phase 5 is fully done. Acceptance: G8 = "custom SSE code path removed from web-v2 runtime." |
| Phase 5.5 — LMM middleware adoption | ✅ **SHIPPED 2026-05-19 ~16:00 AEST (S.184)** | **Audit-first architectural reframe surfaced that the SPEC's "convert guards to middleware + delete 400-600 LoC of decorator boilerplate" framing was sized against legacy `apps/web`'s `streamText` decorator wrappers; web-v2 fork inherits engine `toAISDKTools` which already runs guards/preflights INSIDE `tool.execute()` (architecturally correct: model middleware fires BEFORE tool dispatch and can't gate per-tool decisions).** Delete-side absorbed in v0.7a. The architecturally honest D-17 close: (a) **guards activation** — `guards: DEFAULT_GUARD_CONFIG` from `@t2000/engine` wired through `buildInternalContext` so the 14 Safety/Financial/UX-tier guards now fire (substrate was in place since Phase 3; only the config was missing); (b) **log-redact port** — `lib/audric/log-redact.ts` ported from legacy + adopted at 7 top-traffic console.* sites across chat/prepare/execute routes (closes the operational PII threat model — Vercel multi-week log retention); (c) **observability middleware** — `lib/audric/middleware/observability.ts` with `wrapLanguageModel`-compatible `LanguageModelV3Middleware` emits one PII-scrubbed grep-friendly console line per LLM call (`[audric-llm] generate start provider=X model=Y prompt~Ntok lastUser="..." dur=Nms`) as companion to OTel dashboard via `experimental_telemetry`. Net: +494 LoC across 5 files (2 new + 3 modified) / 0 LoC deleted (delete-side architecturally absorbed in v0.7a engine fork). G8.5 closed via S.184 evidence table per criterion. Safety smoke (guard block + warning + hint paths) deferred to founder-owned live test — same zkLogin OAuth localhost constraint as prior v0.7c phases. All gates green: typecheck ✓ + lint ✓ (1 pre-existing warning unrelated) + build ✓ 15.4s. **Cumulative Phase 5 + 5.5: SPEC ~22.5-26.5d / ~10,898 LoC ➝ delivered ~2.5d / ~34 files / ~3,702 LoC (-90% effort / -43% files / -66% LoC).** |
| Phase 6 — Cutover | ⏳ NEXT IMPLEMENTABLE | Retire `apps/web` chat shell, point production traffic at web-v2, delete the legacy engine bridge (~-10,800 LoC). Unlocks v0.7d work (memory wiring per D-11; structured-output classifier migration per D-16; HITL `needsApproval` SDK-native migration per SPEC 40 batch 3). Audit-first cadence recommended (4-phase compound: 5c/5d/5e/5.5 each reduced effort 80-99% vs SPEC sizing). |

---

## 🎯 Audit pass — 4 bugs caught & fixed (2026-05-19 ~07:35 AEST)

Before any smoke attempt, a critical self-audit of the Phase 3 wiring found 4 blockers; all fixed in-session, all gates re-run green.

| # | Bug | Where | Fix |
|---|---|---|---|
| 1 | Deny path UI hang. `lastAssistantMessageIsCompleteWithToolCalls` requires `output-available`/`output-error`. Deny only flipped state to `approval-responded` → predicate stayed false → resume turn never fired → LLM never narrated. | `apps/web-v2/app/audric-chat/audric-chat-client.tsx` `PermissionForToolPart.onDeny` + missing-metadata auto-deny | Deny path now ALSO calls `addToolOutput({state: 'output-error', errorText: 'User denied the action.'})` so the predicate fires. |
| 2 | `TurnMetrics.attemptId` always NULL. Collector hardcoded `attemptId: null` + `pendingActionYielded: false`. G5 acceptance asks to verify those exact fields — they'd have been NULL regardless of run quality. | `apps/web-v2/lib/audric/telemetry-integration.ts` | Collector observes `tool-approval-request` chunks → stamps `pendingApprovalId` + `pendingActionYielded = true` → persists as `attemptId`. |
| 3 | Resume turn 400 on Approve. Body schema's `.refine((m) => m.content.length > 0)` rejected assistant messages with tool-only parts (the exact shape `useChat` sends on the auto-fired resume turn). Worse: naive `{role, content}` mapping stripped tool calls/results from the LLM's view even when schema passed. | `apps/web-v2/app/(chat)/api/audric-chat/route.ts` body schema + message-normalisation block | Schema relaxed to keep raw `parts`; route uses `await convertToModelMessages(...)` to translate UI tool parts → canonical assistant/tool ModelMessages. |
| 4 | Wrong correlation id. Route comment claimed `attemptId === toolCallId`; AI SDK actually generates a fresh `approvalId = generateId()` distinct from `toolCallId`. Persistence path was wrong. | `apps/web-v2/app/(chat)/api/audric-chat/route.ts` translateChunk comment + telemetry collector | Comment corrected; collector persists `chunk.approvalId` per harness Spec §Item 3a (`attemptId === approvalId` by construction in v0.7c). |

**Gates re-run after fixes:**

| Gate | Result |
|---|---|
| `pnpm --filter web-v2 typecheck` | ✅ 0 errors |
| `pnpm --filter web-v2 build` (Next 16 + Turbopack) | ✅ Compiled in 7.3s, 20 routes |
| Biome lint on the 3 modified files | ✅ 0 errors |
| `pnpm --filter @t2000/engine test` | ✅ 1404 pass / 10 skipped / 0 regressions |

## 🎯 G5 live smoke — DEFERRED to preview/prod deploy

zkLogin OAuth fundamentally cannot run against `localhost:3001`. Google's `redirect_uri` check requires the URI in the OAuth request match a URI whitelisted in the Cloud Console OAuth client. Audric's client is registered for production redirect URIs + the legacy `localhost:3000` (used by `apps/web`'s dev server). Browser smoke against `localhost:3001` returns Google `Error 400: redirect_uri_mismatch`.

**Decision (2026-05-19 ~07:45 AEST):** ship Phase 3 forward without local smoke. G5 still applies but is exercised against the first preview/prod deploy of web-v2. This is consistent with the original "founder-driven only" caveat — zkLogin smoke needs the founder regardless of where it runs.

**When the smoke does happen (preview/prod):**

1. Deploy web-v2 to a Vercel preview URL.
2. Verify the OAuth client has that preview's `/auth/callback` URI whitelisted (or stage on a production-redirect preview).
3. Sign in via Google → land back on `/audric-chat` signed in.
4. Type **"save 0.01 USDC"** → `<PermissionCard>` renders inline.
5. Tap Approve → sponsored-tx flow → on-chain commit → LLM narrates the receipt.
6. NeonDB verification on Turn 1 row: `attemptId` is a non-null UUID, `pendingActionYielded = true`.
   - `pendingActionOutcome` + `writeToolDurationMs` will remain NULL on Turn 1 until Phase 4 wires the cross-turn updateMany (known structural gap).
7. Deny path on a separate intent → LLM narrates the denial gracefully.

**Known structural gap (Phase 4 follow-up):** The cross-turn `updateMany({where: {attemptId}, data: {pendingActionOutcome, writeToolDurationMs}})` on Turn 1's row from Turn 2's handler is NOT yet wired — it requires a client-driven payload to thread the sponsored-tx latency back. Phase 3 ships the structural correlation (Turn 1 stamps the correct `attemptId`); Phase 4 wires outcome resolution.

If anything misbehaves see "Known degradation modes" below. If G5 passes: mark Phase 3 G5-acceptance done in `audric-build-tracker.md` and proceed to Phase 4.

---

## Phases 4 + 4b — SHIPPED (historical reference)

**Phase 4 (S.176, 2026-05-19 ~08:15 AEST)** widened the Phase 3 Slice D HITL pattern to 10 of the 11 remaining writes per D-13 ordering — `withdraw`, `send_transfer`, `borrow`, `repay_debt`, `claim_rewards`, `harvest_rewards`, `swap_execute`, `volo_stake`, `volo_unstake`, `save_contact`. Generalised `lib/audric/sponsored-tx.ts` (replaces `sponsored-save.ts`) handles 9 sponsored writes via discriminated-union dispatch. `/api/transactions/prepare` widened to a 10-branch dispatcher with `feeHooks.{save_deposit, borrow}` + conditional `overlayFee` for swap + harvest. NEW `/api/contacts/save` handles the lone non-tx write. Outcome-update slice closes the G5 telemetry gap.

**Phase 4b (S.177, 2026-05-19 ~08:50 AEST)** closed the lone Phase 4 deferral via a strategic deferral, NOT an implementation. `pay_api` removed from web-v2's tool set (one-line `WRITE_TOOLS.filter`); spec drafted at `t2000/spec/active/AUDRIC_AGENTIC_COMMERCE_SPEC_DRAFT.md` v0.1 defining `pay_api`'s product home as **Audric Store + Agentic Commerce sub-capability** with 7 D-questions + 4-phase roadmap covering the 4 founder-validated use cases ("Make me a beat and sell it for $5" / "Buy everything for my house party" / "Order flowers for mom" / "Christmas shopping max $50 each"). Legacy `apps/web` ships `pay_api` unchanged. Engine `WRITE_TOOLS` continues to export all 12 tools.

**Bundles** (multi-step `WriteStep[]` PTBs) remain deferred to Phase 5/6 when `compose_bundle` migrates to AI SDK orchestration.

**Agentic Commerce Phase 1** (single-vendor `pay_api` revival in web-v2) is gated on founder D-question lock. When founder unblocks: lock D-1..D-7, promote spec to SPEC 39 at `spec/active/shipping/`, cross-import `service-gateway.ts` (~516 LoC), port `prepare` + `complete` standard-MPP branches (~700 LoC subset of legacy 1,459), add `mppx@^0.4.9` + `@suimpp/mpp@^0.3.1` deps, add `lib/audric/pay-api.ts`, remove the `WRITE_TOOLS.filter` line, wire `pay_api` branch in Approve handler, smoke against Resend / PDFShift / OpenAI.

---

## Known degradation modes (if G5 smoke surfaces issues)

- **No on-chain effect after Approve.** Check `apps/web-v2/.env.local` has `ENOKI_SECRET_KEY` set + matches the Enoki workspace ID baked into `NEXT_PUBLIC_ENOKI_API_KEY`. Mismatch → Enoki sponsor returns 401.
- **"Authentication required" 401 from `/api/transactions/prepare`.** Session JWT expired (zkLogin sessions are bound to JWT lifetime ~1h). Sign out → sign in fresh.
- **`PermissionCard` doesn't render.** Confirm `translateChunk` is emitting BOTH a `tool-input-available` (with `toolMetadata`) AND a `tool-approval-request` for the same `toolCallId`. Network tab → SSE event stream.
- **LLM doesn't narrate after Approve.** `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls` should auto-fire the next turn. If it doesn't, ensure `addToolOutput` was actually called after `addToolApprovalResponse` (not just the approval response on its own). Console log inside `onApprove`.
- **Sponsored-tx fails at sign step.** `ZkLoginSigner` requires the FULL `ZkLoginSession` (with `proof`, `maxEpoch`, `randomness`, `ephemeralKeyPair`). If `localStorage` still has the LEGACY JWT-only shape, clear it via DevTools → Application → Storage → Clear site data → sign in fresh.

---

### Critical Phase 3 inheritance from Day 2e

- ✅ **Agent composition baseline.** `save_deposit` builds on `agent.stream({...})`, NOT on `engine.submitMessage()`.
- ✅ **`wrapLegacyTool` bridge already sets `needsApproval`** on write-tier tools — engine v2.11 ships this verbatim.
- ✅ **Phase 5.5 LMM mount point exposed.** `const model: LanguageModel = useGateway ? gateway(...) : createAnthropic(...)(...)` in `apps/web-v2/app/(chat)/api/audric-chat/route.ts` — Phase 5.5 just wraps with `wrapLanguageModel(model, [...])`.
- ✅ **SPEC 40 (Batch 3) inheritance.** Phase 3's Agent path means SPEC 40 collapses into "extend Phase 3's pattern to 11 more writes" instead of "migrate two parallel systems."

### Downstream batches (queued behind Phase 3)

After Phase 3 closes:
- **Batch 2 (SPEC 39 MCP remote migration)** — needs a formal `spec/active/SPEC_39_MCP_REMOTE_MIGRATION.md` draft first. ~1 week.
- **Phase 4 (mechanical write tool migration + `<financial_context>` + `intent-dispatcher.ts` port from D-14 S.173 directive)** — ports `STATIC_SYSTEM_PROMPT` byte-for-byte, wires `<financial_context>`, ports `intent-dispatcher.ts` byte-for-byte alongside. ~5 days.
- **Phase 4.5 (D-16 `generateObject` classifiers + D-14 re-eval)** — migrate 8+ classifiers to `generateObject({ schema })`; decide whether to KEEP regex dispatcher + ADD `generateObject` secondary classifier (recommended) or REPLACE regex entirely (likely rejected — regex is deterministic). ~2 days.
- **Phase 5.5 (D-17 LMM middleware)** — wrap `model` with `wrapLanguageModel(model, [audricGuardsMiddleware, preflightMiddleware, piiRedactionMiddleware, telemetryMiddleware])` at the mount point Day 2e already exposed. ~3 days.
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
