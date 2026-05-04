import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
} from '@t2000/engine';
import {
  emitPlanContextPromoted,
  emitExpectsConfirmSet,
  emitConfirmFlowDispatch,
  bucketMessageLength,
  bucketStepCount,
  detectLangHint,
} from '../plan-context-metrics';

/**
 * [SPEC 15 Phase 1 / 2026-05-04] Lock the wire shape of the
 * `audric.confirm_flow.plan_context_promoted` counter. Dashboards that
 * answer "is Phase 1 catching real misses?" read literal name + tag
 * strings; a silent rename here would silently break the dashboard
 * without throwing anywhere visible.
 */

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

afterEach(() => {
  resetTelemetrySink();
});

describe('bucketMessageLength', () => {
  it.each<[number, '0-10' | '11-30' | '31-100' | '101+']>([
    [0, '0-10'],
    [1, '0-10'],
    [10, '0-10'],
    [11, '11-30'],
    [30, '11-30'],
    [31, '31-100'],
    [100, '31-100'],
    [101, '101+'],
    [500, '101+'],
  ])('bucket(%i) === %s', (len, expected) => {
    expect(bucketMessageLength(len)).toBe(expected);
  });
});

describe('detectLangHint', () => {
  it.each([
    ['yes', 'en'],
    ['Confirmed', 'en'],
    ['do it bro', 'en'],
    ['execute now please', 'en'],
    ['', 'en'],
  ] as const)('"%s" → %s', (msg, expected) => {
    expect(detectLangHint(msg)).toBe(expected);
  });

  it.each([
    ['sí', 'non_en'],
    ['vamos', 'en'], // ASCII-only Spanish word — by design, lang hint is crude
    ['はい', 'non_en'],
    ['好的', 'non_en'],
    ['✅', 'non_en'],
    ['🚀', 'non_en'],
    ['café', 'non_en'],
    ['naïve', 'non_en'],
  ] as const)('"%s" → %s', (msg, expected) => {
    expect(detectLangHint(msg)).toBe(expected);
  });
});

describe('emitPlanContextPromoted — wire shape', () => {
  it('emits one counter with all four tags when matched_regex=true', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitPlanContextPromoted({
      message: 'Confirmed',
      matchedRegex: true,
      priorWriteVerbCount: 3,
    });

    expect(counter).toHaveBeenCalledTimes(1);
    expect(counter).toHaveBeenCalledWith('audric.confirm_flow.plan_context_promoted', {
      matched_regex: 'true',
      msg_length_bucket: '0-10',
      msg_lang_hint: 'en',
      prior_write_verb_count: 3,
    });
  });

  it('emits matched_regex=false when Fix 1 regex would have missed', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitPlanContextPromoted({
      message: 'do it bro',
      matchedRegex: false,
      priorWriteVerbCount: 2,
    });

    expect(counter).toHaveBeenCalledWith('audric.confirm_flow.plan_context_promoted', {
      matched_regex: 'false',
      msg_length_bucket: '0-10',
      msg_lang_hint: 'en',
      prior_write_verb_count: 2,
    });
  });

  it('buckets a 30-char message into 11-30', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    const msg = 'yes please change leg 3 to 0.1'; // exactly 30 chars
    expect(msg.length).toBe(30);

    emitPlanContextPromoted({
      message: msg,
      matchedRegex: false,
      priorWriteVerbCount: 3,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.plan_context_promoted',
      expect.objectContaining({ msg_length_bucket: '11-30' }),
    );
  });

  it('buckets a 101-char modification request into 101+', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    const msg = 'a'.repeat(101);

    emitPlanContextPromoted({
      message: msg,
      matchedRegex: false,
      priorWriteVerbCount: 3,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.plan_context_promoted',
      expect.objectContaining({ msg_length_bucket: '101+' }),
    );
  });

  it('flags non-English when the message contains a non-ASCII letter', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitPlanContextPromoted({
      message: 'sí',
      matchedRegex: false,
      priorWriteVerbCount: 2,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.plan_context_promoted',
      expect.objectContaining({ msg_lang_hint: 'non_en' }),
    );
  });

  it('handles empty message (msg_length_bucket=0-10, msg_lang_hint=en)', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitPlanContextPromoted({
      message: '',
      matchedRegex: false,
      priorWriteVerbCount: 2,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.plan_context_promoted',
      expect.objectContaining({
        msg_length_bucket: '0-10',
        msg_lang_hint: 'en',
      }),
    );
  });

  it('does not throw when the telemetry sink throws (fire-and-forget contract)', () => {
    const counter = vi.fn(() => {
      throw new Error('telemetry sink down');
    });
    setTelemetrySink({ counter, gauge: vi.fn(), histogram: vi.fn() } as TelemetrySink);

    expect(() =>
      emitPlanContextPromoted({
        message: 'yes',
        matchedRegex: true,
        priorWriteVerbCount: 2,
      }),
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// SPEC 15 Phase 2 — Confirm chips telemetry wire shape
// ─────────────────────────────────────────────────────────────────────────

describe('bucketStepCount', () => {
  it.each<[number, '2' | '3' | '4']>([
    [1, '2'], // floor: anything below 2 is treated as 2
    [2, '2'],
    [3, '3'],
    [4, '4'],
    [5, '4'], // ceiling: anything above 4 is treated as 4 (Phase 3a cap)
  ])('bucket(%i) === %s', (n, expected) => {
    expect(bucketStepCount(n)).toBe(expected);
  });
});

describe('emitExpectsConfirmSet — wire shape', () => {
  it('emits has_swap=true + step_count_bucket=3 for a 3-op swap-bearing bundle', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitExpectsConfirmSet({ hasSwap: true, stepCount: 3 });

    expect(counter).toHaveBeenCalledTimes(1);
    expect(counter).toHaveBeenCalledWith('audric.confirm_flow.expects_confirm_set', {
      has_swap: 'true',
      step_count_bucket: '3',
    });
  });

  it('emits has_swap=false for a non-swap bundle', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitExpectsConfirmSet({ hasSwap: false, stepCount: 2 });

    expect(counter).toHaveBeenCalledWith('audric.confirm_flow.expects_confirm_set', {
      has_swap: 'false',
      step_count_bucket: '2',
    });
  });

  it('caps step_count_bucket at 4 (Phase 3a MAX_BUNDLE_OPS)', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitExpectsConfirmSet({ hasSwap: true, stepCount: 4 });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.expects_confirm_set',
      expect.objectContaining({ step_count_bucket: '4' }),
    );
  });

  it('does not throw when the sink throws', () => {
    const counter = vi.fn(() => {
      throw new Error('telemetry sink down');
    });
    setTelemetrySink({ counter, gauge: vi.fn(), histogram: vi.fn() } as TelemetrySink);

    expect(() => emitExpectsConfirmSet({ hasSwap: true, stepCount: 3 })).not.toThrow();
  });
});

describe('emitConfirmFlowDispatch — wire shape', () => {
  it('emits via=chip,outcome=dispatched,admitted_via=chip for a chip-Yes click', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitConfirmFlowDispatch({
      via: 'chip',
      outcome: 'dispatched',
      admittedVia: 'chip',
      stepCount: 3,
    });

    expect(counter).toHaveBeenCalledWith('audric.confirm_flow.dispatch_count', {
      via: 'chip',
      outcome: 'dispatched',
      admitted_via: 'chip',
      step_count_bucket: '3',
    });
  });

  it('emits via=chip,outcome=cancelled for a chip-No click', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitConfirmFlowDispatch({
      via: 'chip',
      outcome: 'cancelled',
      admittedVia: 'chip',
      stepCount: 2,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.dispatch_count',
      expect.objectContaining({ via: 'chip', outcome: 'cancelled' }),
    );
  });

  it('emits via=text,admitted_via=regex for a typed "yes" caught by Fix 1 regex', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitConfirmFlowDispatch({
      via: 'text',
      outcome: 'dispatched',
      admittedVia: 'regex',
      stepCount: 3,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.dispatch_count',
      expect.objectContaining({ via: 'text', admitted_via: 'regex' }),
    );
  });

  it('emits via=text,admitted_via=plan_context for a Phase 1.5 override', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitConfirmFlowDispatch({
      via: 'text',
      outcome: 'dispatched',
      admittedVia: 'plan_context',
      stepCount: 4,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.dispatch_count',
      expect.objectContaining({ via: 'text', admitted_via: 'plan_context', step_count_bucket: '4' }),
    );
  });

  it('emits outcome=stash_mismatch for chip-Yes against stale bundleId (ghost-dispatch race)', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitConfirmFlowDispatch({
      via: 'chip',
      outcome: 'stash_mismatch',
      admittedVia: 'chip',
      stepCount: 3,
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.confirm_flow.dispatch_count',
      expect.objectContaining({
        via: 'chip',
        outcome: 'stash_mismatch',
        admitted_via: 'chip',
      }),
    );
  });

  it('does not throw when the sink throws', () => {
    const counter = vi.fn(() => {
      throw new Error('telemetry sink down');
    });
    setTelemetrySink({ counter, gauge: vi.fn(), histogram: vi.fn() } as TelemetrySink);

    expect(() =>
      emitConfirmFlowDispatch({
        via: 'chip',
        outcome: 'dispatched',
        admittedVia: 'chip',
        stepCount: 3,
      }),
    ).not.toThrow();
  });
});
