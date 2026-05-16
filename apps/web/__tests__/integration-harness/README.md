# Integration Harness

> **Why this exists.** SPEC 37 v0.7a Phase 2 Days 13.0–13.7 shipped six
> patch releases of `@t2000/engine` in ~26 hours, all caught by founder-
> on-production smoke. The Day 13.7 dump revealed an entire bug class
> (silent assistant-message data loss on read-only turns) that had been
> active since v1.34.0 and would have continued silently corrupting
> sessions if not for a single attentive refresh by the founder. The
> root cause of the bug-find loop is structural: localhost can't auth
> (Google OAuth blocks `127.0.0.1`), so the full sponsored-tx + resume
> + persistence + render-rehydration path can only be exercised on
> production.
>
> This harness closes that gap. It runs the full request → engine →
> SSE → persistence → rehydration loop locally, mocks the external
> dependencies that prevent it from running today (auth, sponsored-tx,
> Sui RPC, BlockVision, NAVI, Anthropic), and **diffs the legacy
> QueryEngine vs the v2 AISDKEngine** on every canonical prompt. Any
> structural divergence fails CI before the engine reaches production.

## Scope (what this harness IS)

- A Node-process integration test that calls audric's route handlers
  directly with `NextRequest` objects (no Next.js server spin-up).
- Mocks the 7 external dependencies so the engine can run end-to-end
  offline: NextAuth, sponsored-tx routes, `SuiJsonRpcClient`,
  BlockVision REST, NAVI MCP, Anthropic SDK, Redis.
- Runs every canonical prompt twice — once with `harnessVersion='legacy'`,
  once with `harnessVersion='v2'` — and **diffs three captured states**:
  1. SSE event sequence (normalized — strip UUIDs / timestamps / latency)
  2. Persisted session shape (`session.messages`, `pendingAction`, `usage`)
  3. Rehydrated render shape (what a fresh client would see after refresh)
- Surfaces the first divergence with a focused diff so the bug is
  obvious and the layer is identified.
- Catches the bug classes we shipped patches for in Days 13.0–13.7
  PLUS the 3 audric-side bugs from the same session (2× balance tiles,
  refresh render diff, missing turn after refresh).

## Out of scope (what this harness is NOT)

- A unit test for individual tools (covered by `@t2000/engine` tests).
- A real-LLM eval (Anthropic responses are fixture-recorded, not live).
- A load/perf test (single-process, sequential prompts).
- A UI test (no React rendering — just the data shape that React would
  render).
- A replacement for the engine's own test suite (`packages/engine/src/v2/`).

## Architecture

```
apps/web/__tests__/integration-harness/
├── README.md                   ← this file
├── setup/
│   ├── mock-auth.ts            ← NextAuth session injection (test wallet)
│   ├── mock-redis.ts           ← in-memory session store
│   ├── mock-sui-rpc.ts         ← fixed balance fixtures per wallet
│   ├── mock-blockvision.ts     ← fixed portfolio JSON
│   ├── mock-navi.ts            ← fixed rates + supply/borrow data
│   ├── mock-sponsored-tx.ts    ← deterministic { txDigest, balanceChanges }
│   └── mock-anthropic.ts       ← fixture record/replay against AI SDK
├── fixtures/
│   ├── anthropic/              ← recorded LLM responses keyed by prompt hash
│   │   ├── <hash1>.json
│   │   └── ...
│   ├── sui-balances.json       ← canonical wallet→balance map
│   ├── blockvision-portfolio.json
│   └── navi-rates.json
├── harness.ts                  ← runComparison(prompt, opts) → CapturedRun
├── diff.ts                     ← diff two CapturedRuns, return first divergence
├── prompts.ts                  ← canonical prompt corpus (~30 prompts)
└── __tests__/
    ├── data-loss-13.7.test.ts  ← regression for the Day 13.7 bug
    ├── dedup-13.6.test.ts      ← regression for the Day 13.6 bug
    ├── address-scope-13.5.test.ts
    ├── canonical-corpus.test.ts ← runs every prompt in prompts.ts
    └── refresh-rehydration.test.ts
```

## CapturedRun shape (the unit of comparison)

```ts
interface CapturedRun {
  // Engine that ran this prompt
  harnessVersion: 'legacy' | 'v2';

  // Every SSE event the chat route emitted, in order.
  // toolCallIds, attemptIds, timestamps, latencyMs replaced with stable
  // placeholders so two runs of the same prompt produce identical
  // event sequences modulo non-determinism.
  sseEvents: NormalizedEvent[];

  // The session state PERSISTED to mock-redis at the end of the run.
  // Equivalent to what `dump-session.ts` would read.
  persistedSession: {
    messages: ContentBlockSequence[];
    pendingAction: PendingAction | null;
    usage: UsageSnapshot;
    metadata: SessionMetadata;
  };

  // The render shape that a fresh client would see if it loaded the
  // session via /api/chat/session/[id] (post-refresh view).
  rehydratedRender: {
    turns: RehydratedTurn[];
  };

  // Any errors the route handler threw (caught + logged, not raised).
  errors: Array<{ source: string; message: string }>;
}
```

## Diff semantics

Three independent diffs run on every comparison:

1. **`sseEvents` diff** — sequence-compare event-by-event. First
   divergence (different type, different `toolName`, different
   `stopReason`, missing event, extra event) → fail.
2. **`persistedSession` diff** — focused on `messages` (the bug class
   from 13.7). Compare message-by-message; first content-block-level
   divergence → fail.
3. **`rehydratedRender` diff** — what a refresh would show. Catches
   render-layer divergences (e.g. the "DISPATCHING N READS" wrapper
   appearing only after refresh).

A divergence is reported as:

```
Prompt: "What's my balance?"
Diff:   persistedSession.messages
        legacy: 3 messages (user, assistant w/ text+tool_use, user w/ tool_result)
        v2:     1 message  (user)
First divergence at index 1:
  legacy: { role: 'assistant', content: [{type: 'text', text: '...'}, {type: 'tool_use', name: 'balance_check'}] }
  v2:     <missing>
```

## Canonical prompt corpus (target ~30 prompts)

Categories (5 each):

1. **Pure read** — "What's my balance?", "What APY does NAVI offer?",
   "Show recent transactions", "What's the balance of `0xabc…`?",
   "What's funkii.sui's balance?"
2. **Single auto-write** — small swaps / saves that auto-execute under
   `conservative` preset (`$0.01` repays, sub-$5 swaps).
3. **Confirm-tier write** — "Save $10 USDC", "Send 1 USDC to `0xabc`",
   "Swap 5 USDC to SUI". Each exercises pending_action → resume.
4. **Sequential writes** — "Send 0.01 USDC to `0xabc`. Now save $5." —
   exercises post-write context (anchor injection) + multi-turn history.
5. **Error / edge** — empty balance, expired quote, invalid address,
   guard-blocked address-scope, network failure.

Each prompt has an expected `CapturedRun.sseEvents` shape that BOTH
engines must produce. The harness fails if either engine produces a
different shape.

## Anthropic fixture record/replay

The hardest part. Approach:

1. **Record mode** (`HARNESS_RECORD=1`): run real Anthropic, capture
   the raw stream, write to `fixtures/anthropic/<prompt-hash>.json`.
   The hash includes prompt + system prompt + tools array + model.
2. **Replay mode** (default): read the fixture for the prompt hash,
   replay the stream deterministically.
3. **Missing fixture**: fail fast with `"Re-record this fixture: pnpm
   harness:record"`.

Fixtures get checked into git. When the engine's system prompt or tool
set changes, fixtures need re-recording — that's a known cost. The
alternative (live Anthropic per test) is non-deterministic and slow.

## Phase rollout

| Phase | Day | Deliverable | Verify |
|---|---|---|---|
| 1 | Today | This README + directory scaffolding | Founder reads + reacts |
| 2 | +1 | `setup/` mocks + `harness.ts` runs ONE prompt through v2 | Single-prompt smoke passes |
| 3 | +2 | Anthropic fixture record/replay + 5 prompts | Both engines produce SSE events for 5 fixtures |
| 4 | +3 | Diff engine + 15 prompts in corpus | At least 1 known bug surfaces as a diff |
| 5 | +4 | Refresh/rehydration tests + remaining prompts | 30-prompt corpus runs in CI < 30s |
| 6 | +5 | CI wiring + baseline acceptance file | New PRs fail on new divergences |

## What the harness CAN'T catch

- Bugs in the audric UI render code (React component bugs) — would
  need a separate component / E2E layer (Playwright or similar).
- Bugs in the sponsored-tx prepare/execute Move logic — those are
  on-chain and need a Sui devnet integration test.
- Bugs in Anthropic itself (`tool_use` schema changes, etc.) —
  surface when the fixture replay diverges from a re-record.
- Race conditions that only manifest at production load — single-
  process sequential harness doesn't exercise concurrency.

These are out-of-scope on purpose. The harness covers the "deterministic
data flow" layer that's owned by our code. Everything else is a
separate test surface.

---

**See `BENEFITS_SPEC_v07a.md` Day 13.7 entry for the trigger event.**
