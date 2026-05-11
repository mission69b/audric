import { describe, it, expect, vi } from 'vitest';
import type { TelemetrySink } from '@t2000/engine';
import {
  detectRefinement,
  detectTruncation,
  containsMarkdownTable,
  detectNarrationTableDump,
  emitHarnessTelemetry,
  TurnMetricsCollector,
  CARD_RENDERING_TOOLS,
} from '../harness-metrics';

// Shared build-context for collector tests — keeps each `build()` call
// short while preserving the v1.4.x columns that aren't the focus here.
const buildContext = {
  sessionId: 's_test',
  userId: '0xtest',
  turnIndex: 0,
  effortLevel: 'medium',
  modelUsed: 'claude-sonnet-4-6',
  contextTokensStart: 100,
  estimatedCostUsd: 0.001,
  sessionSpendUsd: 0,
} as const;

describe('detectRefinement — post-0.47 (counts both _refine and truncation signals)', () => {
  describe('explicit _refine shapes', () => {
    it('detects top-level _refine (mpp_services no-filter path)', () => {
      expect(detectRefinement({ _refine: { reason: 'too broad' } })).toBe(true);
    });

    it('detects nested data._refine', () => {
      expect(detectRefinement({ data: { _refine: { reason: 'narrow' }, categories: [] } })).toBe(true);
    });

    it('detects refinementSuggested / refinementRequired', () => {
      expect(detectRefinement({ refinementSuggested: true })).toBe(true);
      expect(detectRefinement({ refinementRequired: true })).toBe(true);
    });
  });

  describe('truncation signals (NEW in 0.47)', () => {
    it('detects top-level _truncated: true (from budgetToolResult)', () => {
      expect(detectRefinement({ _truncated: true, _preview: 'foo', _note: 'bar' })).toBe(true);
    });

    it('detects nested data._truncated: true', () => {
      expect(detectRefinement({ data: { _truncated: true, _preview: 'foo' } })).toBe(true);
    });

    it('detects _originalCount (from summarizeOnTruncate in transaction_history)', () => {
      expect(detectRefinement({ _originalCount: 200, transactions: [] })).toBe(true);
    });

    it('detects nested data._originalCount', () => {
      expect(detectRefinement({ data: { _originalCount: 50, transactions: [] } })).toBe(true);
    });
  });

  describe('non-refinement results (must not trigger)', () => {
    it('plain success result returns false', () => {
      expect(detectRefinement({ data: { transactions: [{ id: '1' }] } })).toBe(false);
    });

    it('null / undefined / primitives return false', () => {
      expect(detectRefinement(null)).toBe(false);
      expect(detectRefinement(undefined)).toBe(false);
      expect(detectRefinement('hello')).toBe(false);
      expect(detectRefinement(42)).toBe(false);
    });

    it('_truncated: false does not trigger', () => {
      expect(detectRefinement({ _truncated: false })).toBe(false);
    });

    it('_originalCount as string (malformed) does not trigger', () => {
      expect(detectRefinement({ _originalCount: '200' })).toBe(false);
    });
  });
});

describe('detectTruncation — unchanged (string marker check)', () => {
  it('detects [Truncated marker', () => {
    expect(detectTruncation('some result [Truncated to 8000 chars]')).toBe(true);
  });

  it('detects "Truncated —" marker', () => {
    expect(detectTruncation({ note: 'Truncated — original was 10000 chars' })).toBe(true);
  });

  it('returns false for normal results', () => {
    expect(detectTruncation({ data: { x: 1 } })).toBe(false);
  });
});

describe('containsMarkdownTable — v0.46.6 narration-dump detector', () => {
  it('detects classic markdown table with header divider', () => {
    const text = `Here are your rates:

| Asset | Save APY | Borrow APY |
|-------|----------|------------|
| USDC  | 3.96%    | 3.57%      |
| SUI   | 2.71%    | 1.84%      |

Let me know if you want more.`;
    expect(containsMarkdownTable(text)).toBe(true);
  });

  it('detects bare divider row', () => {
    expect(containsMarkdownTable('|---|---|---|')).toBe(true);
  });

  it('detects divider with alignment colons', () => {
    expect(containsMarkdownTable('| :--- | :---: | ---: |')).toBe(true);
  });

  it('does NOT trigger on prose with single pipes', () => {
    expect(containsMarkdownTable('Use `|` to separate fields')).toBe(false);
    expect(containsMarkdownTable('Result: a | b | c')).toBe(false);
  });

  it('does NOT trigger on a single dashed line (not a table)', () => {
    expect(containsMarkdownTable('---')).toBe(false);
    expect(containsMarkdownTable('-----')).toBe(false);
  });

  it('does NOT trigger on empty narration', () => {
    expect(containsMarkdownTable('')).toBe(false);
  });
});

describe('detectNarrationTableDump — card tool + table = violation', () => {
  it('flags violation when balance_check fired and narration has a table', () => {
    const narration = `Your wallet:

| Asset | Amount |
|-------|--------|
| USDC  | 92.34  |
| SUI   | 8.33   |
`;
    const report = detectNarrationTableDump(narration, ['balance_check']);
    expect(report.violated).toBe(true);
    expect(report.cardTool).toBe('balance_check');
  });

  it('flags violation when rates_info fired and narration has a table', () => {
    const narration = `Top NAVI rates:

| Asset | Save | Borrow |
|---|---|---|
| USDC | 3.96% | 3.57% |
`;
    const report = detectNarrationTableDump(narration, ['rates_info']);
    expect(report.violated).toBe(true);
    expect(report.cardTool).toBe('rates_info');
  });

  it('flags violation for transaction_history table dump', () => {
    const narration = `Here are your transactions over $5:

| Date | Action | Amount |
|---|---|---|
| Apr 19 | send | 5.00 USDC |
`;
    const report = detectNarrationTableDump(narration, ['transaction_history']);
    expect(report.violated).toBe(true);
  });

  it('flags violation for mpp_services full-catalog dump', () => {
    const narration = `Full MPP catalog:

| Service | Category | Price |
|---|---|---|
| weather | weather | $0.001 |
`;
    const report = detectNarrationTableDump(narration, ['mpp_services']);
    expect(report.violated).toBe(true);
  });

  it('does NOT flag when no card tool was called (text-only chat is fine)', () => {
    const narration = `Quick comparison:

| A | B |
|---|---|
| 1 | 2 |
`;
    const report = detectNarrationTableDump(narration, ['web_search']);
    expect(report.violated).toBe(false);
  });

  it('does NOT flag when card tool fired but narration is clean prose', () => {
    const narration = 'Your USDC sits idle — depositing it would 10x your daily yield.';
    const report = detectNarrationTableDump(narration, ['balance_check']);
    expect(report.violated).toBe(false);
  });

  it('does NOT flag when narration is empty', () => {
    const report = detectNarrationTableDump('', ['balance_check']);
    expect(report.violated).toBe(false);
  });

  it('CARD_RENDERING_TOOLS set covers all expected tools', () => {
    expect(CARD_RENDERING_TOOLS.has('balance_check')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('savings_info')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('health_check')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('transaction_history')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('rates_info')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('mpp_services')).toBe(true);
    // [v1.4 — Day 3] BlockVision-backed `token_prices` replaces the
    // deleted `defillama_yield_pools` / `_token_prices` / `_protocol_info`
    // entries that pre-Day-3 anchored this assertion.
    expect(CARD_RENDERING_TOOLS.has('token_prices')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('protocol_deep_dive')).toBe(true);
    expect(CARD_RENDERING_TOOLS.has('defillama_yield_pools')).toBe(false);
    expect(CARD_RENDERING_TOOLS.has('web_search')).toBe(false);
    expect(CARD_RENDERING_TOOLS.has('pay_api')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// [SPEC 8 v0.5.1 B3.6 / Layer 6] TurnMetricsCollector — harness telemetry
// ---------------------------------------------------------------------------

describe('TurnMetricsCollector — harness telemetry (B3.6)', () => {
  it('produces zeroed defaults when no observers fire (read-only-error path)', () => {
    const c = new TurnMetricsCollector();
    const built = c.build(buildContext);
    expect(built.harnessShape).toBeNull();
    expect(built.thinkingBlockCount).toBe(0);
    expect(built.todoUpdateCount).toBe(0);
    expect(built.ttfvpMs).toBeNull();
    expect(built.finalTextTokens).toBe(0);
    expect(built.evalSummaryEmittedCount).toBe(0);
    expect(built.evalSummaryViolationsCount).toBe(0);
    expect(built.pendingInputSeenOnLegacy).toBe(false);
    expect(built.toolProgressEventCount).toBe(0);
    expect(built.interruptedMessageCount).toBe(0);
  });

  it('captures the engine-emitted harness shape', () => {
    const c = new TurnMetricsCollector();
    c.onHarnessShape('rich');
    const built = c.build(buildContext);
    expect(built.harnessShape).toBe('rich');
  });

  it('counts thinking blocks and eval-summary emissions independently', () => {
    const c = new TurnMetricsCollector();
    c.onThinkingDone({ summaryMode: false });
    c.onThinkingDone({ summaryMode: false });
    c.onThinkingDone({ summaryMode: true });
    const built = c.build(buildContext);
    expect(built.thinkingBlockCount).toBe(3);
    expect(built.evalSummaryEmittedCount).toBe(1);
  });

  it('flags evalSummaryViolationsCount when the LLM emits ≥2 markers in one turn', () => {
    const c = new TurnMetricsCollector();
    c.onThinkingDone({ summaryMode: true });
    c.onThinkingDone({ summaryMode: true });
    c.onThinkingDone({ summaryMode: true });
    const built = c.build(buildContext);
    expect(built.evalSummaryEmittedCount).toBe(3);
    expect(built.evalSummaryViolationsCount).toBe(2); // 3 - 1
  });

  it('counts todoUpdate events one-per-call (idempotent tool, multiple calls)', () => {
    const c = new TurnMetricsCollector();
    c.onTodoUpdate();
    c.onTodoUpdate();
    c.onTodoUpdate();
    expect(c.build(buildContext).todoUpdateCount).toBe(3);
  });

  it('counts toolProgress events per emission', () => {
    const c = new TurnMetricsCollector();
    c.onToolProgress();
    c.onToolProgress();
    expect(c.build(buildContext).toolProgressEventCount).toBe(2);
  });

  it('flags pendingInputSeenOnLegacy ONLY for legacy harness sessions', () => {
    const legacy = new TurnMetricsCollector();
    legacy.onPendingInput('legacy');
    expect(legacy.build(buildContext).pendingInputSeenOnLegacy).toBe(true);

    const v2 = new TurnMetricsCollector();
    v2.onPendingInput('v2');
    expect(v2.build(buildContext).pendingInputSeenOnLegacy).toBe(false);

    const undef = new TurnMetricsCollector();
    undef.onPendingInput(undefined);
    expect(undef.build(buildContext).pendingInputSeenOnLegacy).toBe(false);
  });

  it('flags interruptedMessageCount=1 only after markInterrupted', () => {
    const clean = new TurnMetricsCollector();
    expect(clean.build(buildContext).interruptedMessageCount).toBe(0);

    const interrupted = new TurnMetricsCollector();
    interrupted.markInterrupted();
    expect(interrupted.build(buildContext).interruptedMessageCount).toBe(1);
  });

  it('approximates finalTextTokens via chars/4 (matches @t2000/engine estimateTokens)', () => {
    const c = new TurnMetricsCollector();
    const a = 'Deposited 20 USDC at 4.99% APY.';
    const b = ' Health factor unchanged.';
    c.onTextDelta(a);
    c.onTextDelta(b);
    const built = c.build(buildContext);
    expect(built.finalTextTokens).toBe(Math.ceil((a.length + b.length) / 4));
  });

  it('does NOT increment finalTextTokens for empty / non-string text deltas', () => {
    const c = new TurnMetricsCollector();
    c.onTextDelta('');
    expect(c.build(buildContext).finalTextTokens).toBe(0);
  });

  it('stamps TTFVP from the FIRST visible-progress event (any of: thinking_delta, tool_start, todo_update, text_delta)', async () => {
    const c = new TurnMetricsCollector();
    // [SPEC 7 P2.8 followup, 2026-05-03] setTimeout is approximate, NOT a
    // hard floor — fast CI runners (GitHub Actions, especially) can fire
    // a setTimeout(5) in 4ms. The semantic this test verifies is
    // "TTFVP is non-null and reflects elapsed time", not "exactly ≥ 5ms".
    // Use a longer sleep + relaxed lower-bound to absorb sub-ms jitter.
    await new Promise((r) => setTimeout(r, 20));
    c.onThinkingDelta();
    await new Promise((r) => setTimeout(r, 20));
    c.onTextDelta('hi');
    c.onFirstTextDelta();
    const built = c.build(buildContext);
    expect(built.ttfvpMs).not.toBeNull();
    expect(built.ttfvpMs!).toBeGreaterThan(0);
    // TTFVP must be ≤ wallTime (sanity).
    expect(built.ttfvpMs!).toBeLessThanOrEqual(built.wallTimeMs);
  });

  it('stamps TTFVP from tool_start when no thinking burst preceded', async () => {
    const c = new TurnMetricsCollector();
    await new Promise((r) => setTimeout(r, 20));
    c.onToolStart('toolUseId-1');
    expect(c.build(buildContext).ttfvpMs).not.toBeNull();
  });

  it('stamps TTFVP from todo_update for plan-first turns', async () => {
    const c = new TurnMetricsCollector();
    await new Promise((r) => setTimeout(r, 20));
    c.onTodoUpdate();
    expect(c.build(buildContext).ttfvpMs).not.toBeNull();
  });
});

describe('emitHarnessTelemetry — Vercel sink emissions (B3.6)', () => {
  function makeSpy(): {
    sink: TelemetrySink;
    counter: ReturnType<typeof vi.fn>;
    histogram: ReturnType<typeof vi.fn>;
    gauge: ReturnType<typeof vi.fn>;
  } {
    const counter = vi.fn();
    const gauge = vi.fn();
    const histogram = vi.fn();
    return {
      sink: { counter, gauge, histogram } as TelemetrySink,
      counter,
      histogram,
      gauge,
    };
  }

  const baseInput = {
    harnessShape: 'standard' as const,
    modelUsed: 'claude-sonnet-4-6',
    thinkingBlockCount: 2,
    todoUpdateCount: 0,
    ttfvpMs: 800,
    finalTextTokens: 120,
    evalSummaryEmittedCount: 1,
    evalSummaryViolationsCount: 0,
    pendingInputSeenOnLegacy: false,
    toolProgressEventCount: 0,
    interruptedMessageCount: 0,
  };

  it('emits the always-on counters tagged with shape + model', () => {
    const { sink, counter } = makeSpy();
    emitHarnessTelemetry(sink, baseInput);
    const tags = { shape: 'standard', model: 'claude-sonnet-4-6' };
    expect(counter).toHaveBeenCalledWith('audric.harness.thinking_block_count', tags, 2);
    expect(counter).toHaveBeenCalledWith('audric.harness.todo_update_count', tags, 0);
    expect(counter).toHaveBeenCalledWith('audric.harness.eval_summary_emitted_count', tags, 1);
    // [SPEC 8 v0.5.1 audit polish] tool_progress_event_count is the
    // 4th always-on counter — locked here so a future emit-skip tweak
    // for "0" values doesn't accidentally drop the tool-progress signal.
    expect(counter).toHaveBeenCalledWith('audric.harness.tool_progress_event_count', tags, 0);
  });

  it('omits the discrete counters when their values are zero / false', () => {
    const { sink, counter } = makeSpy();
    emitHarnessTelemetry(sink, baseInput);
    const names = counter.mock.calls.map((c) => c[0] as string);
    expect(names).not.toContain('audric.harness.eval_summary_violations_count');
    expect(names).not.toContain('audric.harness.pending_input_seen_on_legacy');
    expect(names).not.toContain('audric.harness.interrupted_message_count');
  });

  it('emits the discrete counters when their values are non-zero / true', () => {
    const { sink, counter } = makeSpy();
    emitHarnessTelemetry(sink, {
      ...baseInput,
      evalSummaryViolationsCount: 1,
      pendingInputSeenOnLegacy: true,
      interruptedMessageCount: 1,
    });
    const names = counter.mock.calls.map((c) => c[0] as string);
    expect(names).toContain('audric.harness.eval_summary_violations_count');
    expect(names).toContain('audric.harness.pending_input_seen_on_legacy');
    expect(names).toContain('audric.harness.interrupted_message_count');
  });

  it('emits histograms for ttfvp + final text tokens, skips when null/zero', () => {
    const { sink, histogram } = makeSpy();
    emitHarnessTelemetry(sink, baseInput);
    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.ttfvp_ms',
      800,
      { shape: 'standard', model: 'claude-sonnet-4-6' },
    );
    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.final_text_tokens',
      120,
      { shape: 'standard', model: 'claude-sonnet-4-6' },
    );

    const { sink: sink2, histogram: hist2 } = makeSpy();
    emitHarnessTelemetry(sink2, { ...baseInput, ttfvpMs: null, finalTextTokens: 0 });
    const names = hist2.mock.calls.map((c) => c[0] as string);
    expect(names).not.toContain('audric.harness.ttfvp_ms');
    expect(names).not.toContain('audric.harness.final_text_tokens');
  });

  it('falls back to shape="legacy" when harnessShape is null (pre-engine-1.5 sessions)', () => {
    const { sink, counter } = makeSpy();
    emitHarnessTelemetry(sink, { ...baseInput, harnessShape: null });
    const firstCall = counter.mock.calls[0];
    expect(firstCall[1]).toEqual({ shape: 'legacy', model: 'claude-sonnet-4-6' });
  });
});

describe('STATIC_SYSTEM_PROMPT — B3.6 budget gate', () => {
  it('stays within the cumulative spec-mandated budget (B3.6 + P2.5)', async () => {
    // [SPEC 8 v0.5.1 B3.6 / Layer 5 / Gap 8] Cache-size regression gate.
    //
    // Ceiling history (each bump cited spec authority + landed with a
    // re-run of the eval corpus):
    //   - Pre-B3.6 baseline:               8,960 tokens   (~35,840 chars)
    //   - Post-B3.6 ceiling:               9,660 tokens   ( +700 budget)
    //   - Post-SPEC 7 P2.5 ceiling:        9,920 tokens   ( +260 budget)
    //   - Post-SPEC 7 P2.8 / F13 ceiling: 10,000 tokens   ( +80 budget)
    //   - Post-F14-fix-2 ceiling:         10,200 tokens   ( +200 budget)
    //   - Post-failed-write-narration:    10,250 tokens   ( +50 budget)
    //   - Post-fee-disclosure (May 2026): 10,300 tokens   ( +50 budget)
    //   - Post-SPEC 9 P9.2 (May 2026):    10,400 tokens   (+100 budget)
    //   - Post-CHIP-Review-2 F-11b APY:   10,425 tokens   ( +25 budget)
    //   - Post-SPEC 21.3 meta-obs ban:    10,500 tokens   ( +75 budget)
    //   - Post-SPEC 24 MPP rewrite:       10,700 tokens   (+200 budget)
    //
    // B3.6 added the "Mid-flight narration & todos" section + the
    // `<eval_summary>` emission contract.
    //
    // SPEC 7 P2.5 (Layer 4) added the "## Payment Intent — compound write
    // requests" section (spec line 825-827, mandatory). The block teaches
    // the LLM to emit ALL composable write tool_use blocks in ONE turn
    // for compound requests so the engine compiles them into one atomic
    // Payment Intent. Without it the LLM keeps emitting sequentially and
    // intents never form. The block was trimmed aggressively (composable
    // list, pre-compile reads pattern, narration framing) to keep the
    // budget impact at +206 tokens — well under the 260-token allowance.
    //
    // SPEC 7 P2.8 / F13 (2026-05-03) added two rules in response to a
    // production timeout incident (Vercel 60s budget exceeded twice on a
    // 6-write compound request):
    //   1. "4+ writes: split across TWO turns" exception to the Payment
    //      Stream rule — better UX (user reviews plan before signing 6
    //      ops) AND splits the time budget across two turns. Pairs with
    //      bumping maxDuration 60→300s in chat/route.ts + resume/route.ts.
    //   2. "If you DO emit a markdown table, NO blank lines between rows"
    //      cosmetic rule (M3 from the same incident) — fixes the markdown
    //      renderer fragmenting comparison tables into single-row blocks.
    // Both rules were trimmed to the bone: ~140 + ~80 chars (~55 tokens
    // total). The +80 ceiling allows ~25 tokens of headroom for future
    // minor edits before requiring another bump.
    //
    // F14-fix-2 (2026-05-03) added two more rules in response to a
    // SECOND 6-op incident on the same day where the bundle composed
    // successfully but the PermissionCard never rendered (a render-path
    // strip dropped `steps` from `shouldClientAutoApprove`'s input,
    // silently re-introducing Bug A inside the card view):
    //   3. "6+ writes: HARD CAP at 5 per bundle" — pairs with a new
    //      MAX_BUNDLE_OPS=5 ceiling in `@t2000/engine` so the LLM can't
    //      compose a bundle that the engine will refuse anyway. Forces
    //      6+ op compound flows to split into two sequential ≤5-op
    //      bundles, each with its own plan-and-confirm round. Bounds
    //      Vercel runtime, quote-freshness window, LLM working memory,
    //      and PermissionCard cognitive load.
    //   4. "Multi-write plans list each WRITE by verb + amount + asset,
    //      NEVER abstract phases" — fixes a UX regression where the
    //      LLM started emitting `update_todo` with meta-phases (Plan /
    //      Confirm / Execute) instead of the 6 named operations after
    //      the F13 plan-and-confirm rule landed. Restores the per-leg
    //      visibility that's the user's audit trail.
    // The two F14-fix-2 rules add ~140 tokens (rule 3: ~70 tokens with
    // example, rule 4: ~70 tokens with good/bad examples). The +200
    // ceiling allows ~60 tokens of headroom for future minor edits.
    //
    // failed-write-narration (May 2026 — `followup-hallucinated-narration`)
    // added one rule in response to a session-1 cascade where a reverted
    // bundle led the LLM to confabulate "settlement delay" / "still
    // processing" narration, implying the user should wait — Sui PTBs are
    // atomic so there is nothing to wait for. The rule (added as a 4th
    // bullet inside "## CRITICAL: Balance data after write actions" so it
    // sits next to its success-path counterparts) defines `isError: true`
    // / `_bundleReverted: true` semantics and bans the confabulated phrases.
    // Adds ~50 tokens; this is the smallest bump in the ceiling history.
    // Paired with the `STATIC_SYSTEM_PROMPT_FAILED_WRITE_NARRATION_RULE`
    // assertion in `spec-consistency.ts` so a future prompt edit cannot
    // silently drop the rule.
    //
    // CHIP-Review-2 F-11b APY (May 2026 — live walkthrough caught a 100x
    // user-visible APY display bug: dashboard hero correctly showed "7.9%"
    // but chat narration and FullPortfolioCanvas surfaced "0.079%" /
    // "0.08%" because the LLM and one canvas template were rendering raw
    // decimal `data.apy` (e.g. 0.0787) with a "%" suffix instead of
    // multiplying by 100. The canvas was patched in-place; the prompt
    // needed a unit-rule clarification appended to the existing
    // "Present amounts as $1,234.56..." line. Trimmed maximally to ~12
    // tokens — the +25 ceiling is the smallest bump in history.
    //
    // fee-disclosure (May 2026 — production screenshot showed Audric
    // replying "No — I don't take a cut. The 0.1% that came out is the
    // Cetus protocol fee, which goes to the DEX. ... I'm here to execute,
    // not extract." That is FACTUALLY WRONG: `OVERLAY_FEE_RATE = 0.001`
    // (Cetus swap), `SAVE_FEE_BPS = 10n` (0.1% on save), `BORROW_FEE_BPS
    // = 5n` (0.05% on borrow) — Audric DOES collect overlay fees. The
    // existing "## Gas & fees" section only described gas-sponsorship,
    // leaving the LLM to confabulate denials when asked about fees
    // directly. Replaced the gas-only section with a unified one that
    // (a) keeps the FULL-balance-on-"all" rule, (b) lists exact percentages
    // per operation, (c) explicitly bans "no fees" / "all your value
    // stays with you" phrases. Trimmed to ~50 tokens after three
    // compression passes (started at ~145 tokens, took budget hits down
    // to ~50 to fit). Founder-approved 2026-05-05 as a critical-trust
    // fix; ceiling bumped +50 with the precedent of failed-write-narration.
    //
    // SPEC 21.3 meta-observations ban (May 2026 — S.137 acceptance smoke
    // recorded the LLM narrating "Same request as before" / "Same pattern
    // again" on bundle saturation turns 8/9/10 — visually noisy, semantically
    // empty, the worst of "the LLM apologising for its own cadence"
    // pattern.) Added one Response-rule bullet forbidding meta-observation
    // narration ("Same request", "Same pattern", "As last time") with one
    // safety-callout exception ("tightening slippage after revert"). Trimmed
    // to ~75 tokens after compression (started at ~210 tokens with full
    // examples and bundle-saturation context; trimmed examples to the
    // three most-leaked phrases and dropped the saturation-history aside).
    // Pairs with `lib/thinking-similarity.ts` render-time Jaccard collapse
    // as the SPEC 21.3 two-layer fix — system prompt forbids emission,
    // UI suppresses anything that slips through. Founder-approved
    // 2026-05-10 as part of the SPEC 21 ship; ceiling bumped +75
    // (10_425 → 10_500).
    //
    // SPEC 24 MPP integration audit (May 2026 — pre-founder-smoke audit
    // discovered audric's STATIC_SYSTEM_PROMPT was completely overriding
    // the engine's `DEFAULT_SYSTEM_PROMPT`, so the SPEC 24 F1 + G1/G2/G3
    // prompt rewrite shipped in `@t2000/engine@1.29.0` and `1.29.1` was
    // dead-on-arrival in production. Audric's prompt was still teaching
    // the LLM to call DROPPED gateway vendors (deepl, openweather, fal,
    // brave) as quick-references, which would silently fail or fall
    // through to GenericMppReceipt during founder smoke. Replaced the
    // pre-SPEC-24 "## MPP services (40+ real-world APIs)" block with the
    // locked 5-service set (openai/elevenlabs/pdfshift/lob/resend) +
    // intent map + G1 (GPT-4o gating: native default, paid only on
    // explicit request) + G2 (list-only-5-services constraint, never
    // enumerate full catalog) + G3 (decline-honestly vs CAN-do-natively
    // split, with translation/summarization correctly classified as
    // native) + DALL-E-based postcard flow (Fal Flux dropped). Rewrote
    // the postcard step 4 to point at mpp_services for the full lob body
    // schema instead of inlining the 570-char JSON, recovering ~430
    // chars vs the pre-SPEC-24 baseline. Net add was ~200 tokens after
    // compression (started at +853 tokens after the literal port,
    // trimmed Multi-step compositions paragraph + dense paragraph form
    // for CANNOT/CAN-do lists + intent-map one-liner). Pinned by new
    // `lib/engine/__tests__/engine-context.test.ts` (12 tests) so a
    // future prompt edit cannot silently re-introduce dropped vendors,
    // drop the G1/G2/G3 wording, or revert the postcard flow to Fal.
    // Founder-approved 2026-05-12 as the only path to unblock founder
    // smoke; ceiling bumped +200 (10_500 → 10_700).
    //
    // Why a hard char ceiling instead of a delta:
    //   - Hardcoding the ceiling beats hardcoding both halves; the test
    //     trips on ANY future edit that pushes the prompt past the
    //     boundary, regardless of whose change it was.
    //
    // If this test fails in the future:
    //   1. Trim the new prompt content first (bullet > prose, fewer examples).
    //   2. Only raise this ceiling with explicit founder approval +
    //      a re-run of the SPEC 7/P1 eval corpus on the new prompt +
    //      a new entry in the ceiling-history table above.
    const { STATIC_SYSTEM_PROMPT } = await import('../engine-context');
    const tokens = Math.ceil(STATIC_SYSTEM_PROMPT.length / 4);
    expect(tokens).toBeLessThanOrEqual(10_700);
  });
});

