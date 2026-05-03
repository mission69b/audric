import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
} from '@t2000/engine';
import { emitPostWriteRefreshMetrics } from '../post-write-refresh-metrics';

/**
 * Backlog-1 — Lock the wire-shape of the three BlockVision freshness
 * signals. The dashboards that consume these read literal name + tag
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
  vi.useRealTimers();
});

describe('emitPostWriteRefreshMetrics — happy path (canonical balance_check payload)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-04T00:00:01.500Z'));
  });

  it('emits all three signals when result carries blockvision provenance', () => {
    const { sink, counter, histogram } = makeSpy();
    setTelemetrySink(sink);

    // defiPricedAt 1.5s ago — the canonical "fresh refresh" age post the
    // 1500ms Sui RPC indexer-lag wait.
    const pricedAt = new Date('2026-05-04T00:00:00.000Z').getTime();

    emitPostWriteRefreshMetrics({
      stepCount: 4,
      isError: false,
      result: {
        defiSource: 'blockvision',
        defiPricedAt: pricedAt,
        // ...rest of balance_check payload (irrelevant to telemetry)
        total: 100,
      },
    });

    expect(counter).toHaveBeenCalledTimes(2);
    expect(counter).toHaveBeenCalledWith('audric.harness.post_write_refresh_outcome', {
      outcome: 'ok',
      stepCount: 4,
    });
    expect(counter).toHaveBeenCalledWith('audric.harness.post_write_refresh_defi_source', {
      source: 'blockvision',
      stepCount: 4,
    });

    expect(histogram).toHaveBeenCalledOnce();
    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.post_write_refresh_age_ms',
      1500,
      { stepCount: 4, defiSource: 'blockvision' },
    );
  });

  it('emits stepCount=1 for single-write resumes', () => {
    const { sink, counter, histogram } = makeSpy();
    setTelemetrySink(sink);

    emitPostWriteRefreshMetrics({
      stepCount: 1,
      isError: false,
      result: {
        defiSource: 'blockvision',
        defiPricedAt: Date.now() - 800,
      },
    });

    expect(counter).toHaveBeenCalledWith(
      'audric.harness.post_write_refresh_outcome',
      expect.objectContaining({ stepCount: 1 }),
    );
    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.post_write_refresh_age_ms',
      800,
      { stepCount: 1, defiSource: 'blockvision' },
    );
  });

  it('forwards each defiSource discriminator to the source counter', () => {
    for (const source of ['blockvision', 'partial', 'partial-stale', 'degraded'] as const) {
      const { sink, counter } = makeSpy();
      setTelemetrySink(sink);

      emitPostWriteRefreshMetrics({
        stepCount: 2,
        isError: false,
        result: { defiSource: source, defiPricedAt: Date.now() - 500 },
      });

      expect(counter).toHaveBeenCalledWith(
        'audric.harness.post_write_refresh_defi_source',
        { source, stepCount: 2 },
      );
    }
  });

  it('clamps negative ages to zero (defensive against clock skew)', () => {
    const { sink, histogram } = makeSpy();
    setTelemetrySink(sink);

    // pricedAt in the future relative to Date.now() — synthetic clock skew.
    emitPostWriteRefreshMetrics({
      stepCount: 3,
      isError: false,
      result: {
        defiSource: 'blockvision',
        defiPricedAt: Date.now() + 5_000,
      },
    });

    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.post_write_refresh_age_ms',
      0,
      { stepCount: 3, defiSource: 'blockvision' },
    );
  });
});

describe('emitPostWriteRefreshMetrics — error path', () => {
  it('emits outcome=error and skips the source/age signals', () => {
    const { sink, counter, histogram } = makeSpy();
    setTelemetrySink(sink);

    // Engine refresh-error result shape: `{ error: '...' }` — no
    // defiSource, no defiPricedAt. Should not synthesize zero-age or
    // unknown-source noise.
    emitPostWriteRefreshMetrics({
      stepCount: 2,
      isError: true,
      result: { error: 'Post-write refresh: invalid input for balance_check' },
    });

    expect(counter).toHaveBeenCalledOnce();
    expect(counter).toHaveBeenCalledWith('audric.harness.post_write_refresh_outcome', {
      outcome: 'error',
      stepCount: 2,
    });
    expect(histogram).not.toHaveBeenCalled();
  });
});

describe('emitPostWriteRefreshMetrics — defensive payload handling', () => {
  it('emits outcome only when result is undefined (refresh fired but payload not present)', () => {
    const { sink, counter, histogram } = makeSpy();
    setTelemetrySink(sink);

    emitPostWriteRefreshMetrics({ stepCount: 1, isError: false });

    expect(counter).toHaveBeenCalledOnce();
    expect(counter).toHaveBeenCalledWith(
      'audric.harness.post_write_refresh_outcome',
      { outcome: 'ok', stepCount: 1 },
    );
    expect(histogram).not.toHaveBeenCalled();
  });

  it('skips source counter when defiSource is missing or invalid', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitPostWriteRefreshMetrics({
      stepCount: 1,
      isError: false,
      result: { defiSource: 'not-a-real-source', defiPricedAt: Date.now() - 100 },
    });

    expect(counter).toHaveBeenCalledTimes(1); // outcome only
    expect(counter).toHaveBeenCalledWith(
      'audric.harness.post_write_refresh_outcome',
      expect.anything(),
    );
  });

  it('skips age histogram when defiPricedAt is missing', () => {
    const { sink, counter, histogram } = makeSpy();
    setTelemetrySink(sink);

    emitPostWriteRefreshMetrics({
      stepCount: 1,
      isError: false,
      result: { defiSource: 'blockvision' },
    });

    // outcome + source counters fire; histogram does NOT (no priced-at)
    expect(counter).toHaveBeenCalledTimes(2);
    expect(histogram).not.toHaveBeenCalled();
  });

  it('skips age histogram when defiPricedAt is non-numeric or zero', () => {
    const { sink, histogram } = makeSpy();
    setTelemetrySink(sink);

    for (const bogus of [0, -1, NaN, '1700000000000', null, undefined]) {
      emitPostWriteRefreshMetrics({
        stepCount: 1,
        isError: false,
        result: { defiSource: 'blockvision', defiPricedAt: bogus },
      });
    }

    expect(histogram).not.toHaveBeenCalled();
  });

  it('falls through silently when telemetry sink throws', () => {
    const sink: TelemetrySink = {
      counter: vi.fn(() => {
        throw new Error('sink crashed');
      }),
      gauge: vi.fn(),
      histogram: vi.fn(),
    };
    setTelemetrySink(sink);

    expect(() =>
      emitPostWriteRefreshMetrics({
        stepCount: 4,
        isError: false,
        result: { defiSource: 'blockvision', defiPricedAt: Date.now() - 100 },
      }),
    ).not.toThrow();
  });
});
