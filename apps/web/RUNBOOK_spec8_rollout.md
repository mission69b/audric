# Runbook: SPEC 8 Interactive Harness — production rollout

> **Status:** Active. SPEC 8 v0.5.1 has shipped to `main` (B3.1–B3.6 complete, B3.7 scaffolding complete). This runbook is the founder playbook for flipping the production flag from 0% → 100% over 3 days.
>
> **Owner:** Founder. The eval pass + dial flips are async wall-time activities — no automation can replace eyeballs on `audric.ai` chat output.
>
> **Cross-references:**
> - Spec — `t2000/spec/SPEC_8_INTERACTIVE_HARNESS.md` § "Acceptance gates" + § "Production telemetry signals"
> - Eval corpus — `t2000/spec/SPEC_8_CORPUS.md` (30 prompts × 4 tiers)
> - Build tracker — `t2000/audric-build-tracker.md` § "P3.7 / B3.7"

---

## Pre-flight (do once, before Day 1)

1. **Confirm `main` is at SPEC 8 v0.5.1.**
   ```bash
   cd /Users/funkii/dev/audric
   git log -1 --format='%h %s' main
   # Expect a recent commit referencing B3.6 / B3.7
   ```

2. **Confirm engine is at the SPEC-8 release (≥ 1.5.0).**
   ```bash
   cd /Users/funkii/dev/audric/apps/web
   grep '"@t2000/engine"' package.json
   # Expect "@t2000/engine": "^1.5.0" or newer
   ```

3. **Confirm the regression-gate script connects.** It should already be on `main`:
   ```bash
   cd /Users/funkii/dev/audric/apps/web
   node scripts/spec8-rollout-gates.mjs --hours=720
   # Expect: "no v2 data" (cohort sizes show v2=0 if rollout has never run)
   ```

4. **Open Vercel Observability** in another tab. Filter on `kind=metric` to see the live `audric.harness.*` counters/histograms (they should be empty until step 1 of Day 1).

5. **Run the SPEC 8 corpus once on local against `main` (engine 1.5.0)** — eyeball that `update_todo`, harness shapes, eval-summary cards, todo lists all render. This is the founder eval pass referenced in P3.6 (replaces the dropped automated baseline-capture). Expected wall time: ~20 min for 30 prompts. Capture screenshots only if a regression is suspected.

---

## Day 1 — 10% rollout

### Flip the dial

In Vercel project settings → Environment Variables → Production:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_INTERACTIVE_HARNESS` | `1` |
| `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` | `10` |

Both must be set in Production scope. Trigger a redeploy (`Deployments → ⋯ → Redeploy`) so the values bake into the client bundle.

### Verify the dial took

```bash
# Sign in to audric.ai with the founder account, send a single
# `balance` prompt. Then:
cd /Users/funkii/dev/audric/apps/web
node scripts/spec8-rollout-gates.mjs --hours=1
# v2_count should be 1 (or 0 if your bucket landed >9; sign in with
# a different account or check via the chat-route logs)
```

If your founder account's bucket lands ≥10 (FNV-1a is uniform but not adversarial), use a second account whose bucket lands <10 to confirm the v2 path works. The bucket for any address can be computed locally:

```bash
node -e "import('./lib/interactive-harness.ts').then(m => console.log(m.bucketFor('0xYOURADDR')))"
```

### Monitor (24 h)

Run the gate script every few hours:

```bash
node scripts/spec8-rollout-gates.mjs --hours=24
```

What "good" looks like at the end of Day 1:
- v2_count ≥ ~10% of total volume (the `harness_shape` histogram in Vercel will show real cohort split)
- All 7 gates `[PASS]` or `[SKIP]` (skipped is fine for cohorts that haven't seen action yet)
- `eval_summary_violations` ≤ 1% of v2 RICH/MAX turns
- `interrupted_messages` < 1% of v2 turns
- `pending_input_on_legacy` = `0` (non-zero means session-pinning regression — STOP)

If any gate `[FAIL]`s → see "Rollback" below. Otherwise advance to Day 2.

---

## Day 2 — 50% rollout

After 24 h with no Day 1 gate failures:

```
NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = 50
```

Trigger redeploy. Same gate script every few hours. The cohort split should ramp to ~50/50 over a few hours as new sessions are created (existing sessions stay pinned to whatever they got at session-creation time — that's by design).

### Watch list

- **Gate 5 (LEAN never emits todos)** — must stay 0. The instant a single LEAN turn emits a todo, the system prompt or the LLM has regressed; rollback and dig.
- **Gate 7 (RICH todo emission rate ≥ 50%)** — most likely to wobble. If it drops below 50% on Day 2 but the cohort is small (<20 RICH turns), give it 12 more hours. If it's <50% with a healthy cohort, the prompt rewrite (B3.6) didn't land properly — rollback and audit.
- **Gates 2/3/4 (cost / latency / final-text)** — these are RATIO gates. A slow drift toward the threshold is fine; a sudden jump (e.g. 1.05× → 1.30× over an hour) usually means a model upgrade or a new long-tool — investigate before advancing.

---

## Day 3 — 100% rollout

After 24 h with no Day 2 gate failures:

```
NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT = 100
```

(Or unset the variable entirely — when the percent gate is absent, every flag-on bucket is admitted, matching today's pre-B3.7 behavior.)

Run the gates one more time at 24 h post-Day-3:

```bash
node scripts/spec8-rollout-gates.mjs --hours=24
```

If everything still PASSes, SPEC 8 v0.5.1 is shipped. Update `audric-build-tracker.md` with a P3.7 ✅ entry (date + final gate output) and proceed to SPEC 7.

---

## Rollback

If any HARD FAIL gate fires:

1. **Drop the dial back.** In Vercel Production env vars, set `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT` to the previous step's value (e.g. `10` if you were on `50`). Redeploy.
2. **Existing v2-pinned sessions stay v2.** That's by design — flipping back to legacy mid-session would create exactly the mixed-mode visual breakage SPEC 8 v0.2 G4 was designed to prevent. Wait ~24 h for those sessions to age out, or accept that v2 cohort metrics will keep flowing for a few days from already-pinned sessions.
3. **If the failure is severe** (Gate 5 LEAN emits todos, or `pending_input_on_legacy` > 0 — both indicate a logic bug, not a perf regression), set `NEXT_PUBLIC_INTERACTIVE_HARNESS=0` to fully disable v2 for new sessions.
4. **Open a thread in `#audric-dev` Discord** with the gate output + the failing prompt(s) from the corpus (run them locally to repro). File a follow-up branch off `main`.

### Rollback reference matrix

| Gate that failed | Likely root cause | First place to look |
|---|---|---|
| 1 (TTFVP > 1500ms) | Mid-flight render regression in `ReasoningTimeline` | `apps/web/components/engine/ReasoningTimeline.tsx` first-frame logic |
| 2 (final-text +50%) | System prompt not reining in narration | `engine-context.ts` STATIC_SYSTEM_PROMPT — diff vs B3.6 commit |
| 3 (cost +25%) | Thinking budget overrun OR model upgrade | Vercel Observability: `audric.harness.cost_usd{shape}` per shape |
| 4 (latency +20%) | Tool retries spiking, or BV/NAVI degradation | Check `bv.cb_open` / `navi.cb_open` gauges (separate alert surface) |
| 5 (LEAN todo) | LLM ignoring `update_todo` shape rules | System prompt — verify the "LEAN stays terse" line is intact |
| 6 (LEAN p95 thinking > 1) | `clampThinkingForEffort` regression in engine | `packages/engine/src/agent-loop.ts` budget caps |
| 7 (RICH todo rate < 50%) | Recipe matcher silent OR system prompt drifted | `recipes/registry.ts` + system-prompt § "Adaptive harness shape" table |

---

## Post-rollout cleanup (Week 2)

Once 100% rollout has stuck for a week:

1. Run the gates over a 7-day window: `node scripts/spec8-rollout-gates.mjs --hours=168 --json > spec8-final-gates.json`. Commit that file as the SPEC 8 acceptance artifact.
2. Mark the legacy renderer (`LegacyReasoningRender`) for removal in SPEC 12 codebase review (file already extracted in B3.4 — deletion is just an import audit).
3. Close out the SPEC 8 entry in `audric-build-tracker.md` with the final acceptance numbers from step 1.

---

## What this runbook deliberately does NOT do

- **No automated alerts.** Pulling the gates manually is the contract — at our scale (~165 active users) the signal-to-noise ratio of automated alerts on a 3-day rollout isn't worth the wiring. If SPEC 8 metrics are still being watched a year from now, fold them into `RUNBOOK_scaling_alerts.md`.
- **No staged-traffic preview.** No staging, no canary deployment. Vercel doesn't have native traffic-splitting and per-session pinning means a flag flip on Production IS the canary.
- **No automated visual diff.** P3.6 dropped Playwright/screenshot-diff. The eval pass is founder-driven eyeballing of the corpus; if a visual regression happens it'll show up in a chat review or via gates 1–4.

---

## One-line summary

> Flip `NEXT_PUBLIC_INTERACTIVE_HARNESS=1` + `NEXT_PUBLIC_INTERACTIVE_HARNESS_ROLLOUT_PERCENT=10/50/100` over 3 days; run `node scripts/spec8-rollout-gates.mjs` between each step; if anything fails, dial back to the previous step and investigate.
