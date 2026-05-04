import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
} from '@t2000/engine';
import {
  emitPlanContextPromoted,
  bucketMessageLength,
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
