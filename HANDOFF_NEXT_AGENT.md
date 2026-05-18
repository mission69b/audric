# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> First written 2026-05-18 during **BENEFITS_SPEC v0.7c Phase 1 Day 1b** to pin the
> `vercel/ai-chatbot` template SHA per the SPEC's Phase 1 acceptance gate (G3).

---

## Active SPEC

[`spec/active/BENEFITS_SPEC_v07c.md`](../t2000/spec/active/BENEFITS_SPEC_v07c.md) — v1.0 LOCKED 2026-05-18. Phase 0 closed; Phase 1 Day 1a/1b/1c/1d closed (G2 + G3 closed; baseline `pnpm typecheck` + `pnpm lint` both at 0 errors); Phase 2 READY.

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Baseline + setup | ✅ CLOSED | G1 closed 2026-05-18 PM. F-12 (prompt cache) + F-13 (extended thinking) regressions found + shipped at engine v2.7.2; F-14 (classifier accuracy) shipped at engine v2.7.3. |
| Phase 1 — Side-by-side stand-up + template fork + Auth eviction | ✅ CLOSED (Day 1a/1b/1c/1d CLOSED, G2 + G3 CLOSED, baseline typecheck + lint both at 0 errors) | Day 1a (blank scaffold) ✅. Day 1b (template fork, pinned SHA `107a43a`) ✅. Day 1c (Auth.js eviction + zkLogin stub: `lib/audric-auth.ts` + `lib/audric-auth-client.ts`; 11 server callsites + 5 lib types + 3 client components rewired; `next-auth` + `bcrypt-ts` removed; `GET /` flipped from 307→MissingSecret to 200) ✅. **Day 1d (baseline cleanup): F-17 fixed (5 template TS errors in 4 files — React 19 ref narrowing + Streamdown spread + DataUIPart cast); F-18 fixed (Biome 2.3.11 → 2.4.15 to match ultracite@7.7.0's declared peer); 38 files auto-fixed by Biome (pure formatting); `pnpm typecheck` + `pnpm lint` both at 0 errors; boot smoke still GREEN) ✅.** |
| Phase 2 — First read-tool round-trip + AI Gateway + intent-dispatcher spike + Agent + OTel | 🟢 **READY** | Phase 1 fully closed; baseline is clean (typecheck + lint both at 0 errors). Phase 2 must (a) harden the Day 1c auth stub — full `verifyJwt` + Google JWKS + Enoki address derivation port from `apps/web/lib/auth.ts` — before any handler accepts authenticated user input; (b) harden `ZkLoginProvider` (children passthrough → full `@mysten/dapp-kit` `WalletProvider` + Enoki client tree); (c) execute D-9 Drizzle → Prisma swap; (d) wire `/api/chat` to the audric engine via AI Gateway (D-6). |
| Phase 3 onward | ⏳ PENDING | See SPEC. |

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
- ~~**F-17** — Template baseline TS errors~~ ✅ **CLOSED Day 1d.** All 5 errors fixed across the 4 files (`reasoning.tsx` dropped unsafe spread; `document-preview.tsx` updated ref-prop nullability; `toolbar.tsx` added explicit `null` initializer + cast for `useOnClickOutside`; `use-active-chat.tsx` cast `dataPart` to the narrow `DataUIPart<CustomUIDataTypes>` union). Each fix carries a `[v0.7c Day 1d F-17{a,b,c,d}]` comment with the architectural reason.
- ~~**F-18** — Vendored `biome.jsonc` references unknown rule names~~ ✅ **CLOSED Day 1d.** Root cause was Biome version mismatch — `ultracite@7.7.0` declares `@biomejs/biome@2.4.15` as its peer; template pinned 2.3.11. Bumped to 2.4.15. Lint runs clean.
- **Phase 2 hardening of Day 1c stub** — `lib/audric-auth.ts` currently decode-only (no signature verify, no Enoki address derivation). Phase 2 must port the full `verifyJwt` + Google JWKS + `deriveAddressFromEnoki` from `apps/web/lib/auth.ts` before any web-v2 handler accepts authenticated user input. Comments in `lib/audric-auth.ts` flag the exact load-bearing TODOs.

---

## Cross-references

- `t2000/spec/active/BENEFITS_SPEC_v07c.md` — the active SPEC.
- `apps/web-v2/README.md` — what lives in the fork, sequenced by Day.
- `audric-build-tracker.md` row 7t — phase tracker for v0.7c.
