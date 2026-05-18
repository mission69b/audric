# HANDOFF — Next Agent

> Living handoff doc for any agent / engineer picking up audric mid-stream.
> First written 2026-05-18 during **BENEFITS_SPEC v0.7c Phase 1 Day 1b** to pin the
> `vercel/ai-chatbot` template SHA per the SPEC's Phase 1 acceptance gate (G3).

---

## Active SPEC

[`spec/active/BENEFITS_SPEC_v07c.md`](../t2000/spec/active/BENEFITS_SPEC_v07c.md) — v1.0 LOCKED 2026-05-18. Phase 0 closed; Phase 1 in progress.

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Baseline + setup | ✅ CLOSED | G1 closed 2026-05-18 PM. F-12 (prompt cache) + F-13 (extended thinking) regressions found + shipped at engine v2.7.2; F-14 (classifier accuracy) shipped at engine v2.7.3. |
| Phase 1 — Side-by-side stand-up + template fork + Auth eviction | 🟡 IN PROGRESS | Day 1a (blank scaffold) done. Day 1b (template fork) in progress. Day 1c (Auth eviction + zkLogin wiring) pending. |
| Phase 2 — First read-tool round-trip + AI Gateway + intent-dispatcher spike + Agent + OTel | ⏳ PENDING | Starts after G2 + G3 close. |
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

---

## Cross-references

- `t2000/spec/active/BENEFITS_SPEC_v07c.md` — the active SPEC.
- `apps/web-v2/README.md` — what lives in the fork, sequenced by Day.
- `audric-build-tracker.md` row 7t — phase tracker for v0.7c.
