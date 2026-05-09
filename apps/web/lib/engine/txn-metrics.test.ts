import { describe, it, expect, vi, beforeEach } from 'vitest';

const counterSpy = vi.fn();
const histogramSpy = vi.fn();

vi.mock('@t2000/engine', () => ({
  getTelemetrySink: () => ({
    counter: counterSpy,
    histogram: histogramSpy,
  }),
}));

beforeEach(() => {
  counterSpy.mockClear();
  histogramSpy.mockClear();
});

import {
  emitPrepareDuration,
  emitExecuteDuration,
  emitEnokiSponsorDuration,
  emitEnokiExecuteDuration,
  emitSuiWaitDuration,
} from './txn-metrics';

describe('txn-metrics — prepare', () => {
  it('emits histogram + counter with txType + outcome tags', () => {
    emitPrepareDuration({ txType: 'swap', durationMs: 1234, outcome: 'success' });

    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.prepare_duration_ms',
      1234,
      { txType: 'swap', outcome: 'success' },
    );
    expect(counterSpy).toHaveBeenCalledWith(
      'audric.txn.prepare_outcome_count',
      { txType: 'swap', outcome: 'success' },
    );
  });

  it('handles bundle txType', () => {
    emitPrepareDuration({ txType: 'bundle', durationMs: 800, outcome: 'success' });
    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.prepare_duration_ms',
      800,
      { txType: 'bundle', outcome: 'success' },
    );
  });

  it('handles all outcome variants', () => {
    const outcomes = ['compose_error', 'sponsor_error', 'session_expired'] as const;
    for (const outcome of outcomes) {
      emitPrepareDuration({ txType: 'send', durationMs: 100, outcome });
    }
    expect(histogramSpy).toHaveBeenCalledTimes(3);
  });
});

describe('txn-metrics — execute', () => {
  it('emits histogram + counter with outcome tag (no txType — execute is type-agnostic)', () => {
    emitExecuteDuration({ durationMs: 5678, outcome: 'success' });

    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.execute_duration_ms',
      5678,
      { outcome: 'success' },
    );
    expect(counterSpy).toHaveBeenCalledWith(
      'audric.txn.execute_outcome_count',
      { outcome: 'success' },
    );
  });
});

describe('txn-metrics — Enoki sponsor', () => {
  it('emits histogram with txType + ok tags', () => {
    emitEnokiSponsorDuration({ txType: 'swap', durationMs: 234, ok: true });

    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.enoki_sponsor_ms',
      234,
      { txType: 'swap', ok: 'true' },
    );
    expect(counterSpy).not.toHaveBeenCalled();
  });

  it('marks ok=false on failure', () => {
    emitEnokiSponsorDuration({ txType: 'bundle', durationMs: 500, ok: false });
    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.enoki_sponsor_ms',
      500,
      { txType: 'bundle', ok: 'false' },
    );
  });
});

describe('txn-metrics — Enoki execute', () => {
  it('emits histogram with ok tag', () => {
    emitEnokiExecuteDuration({ durationMs: 100, ok: true });
    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.enoki_execute_ms',
      100,
      { ok: 'true' },
    );
  });
});

describe('txn-metrics — Sui wait', () => {
  it('emits histogram with ok tag (the prime-suspect metric)', () => {
    emitSuiWaitDuration({ durationMs: 12345, ok: true });
    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.sui_wait_ms',
      12345,
      { ok: 'true' },
    );
  });

  it('records failure too', () => {
    emitSuiWaitDuration({ durationMs: 30000, ok: false });
    expect(histogramSpy).toHaveBeenCalledWith(
      'audric.txn.sui_wait_ms',
      30000,
      { ok: 'false' },
    );
  });
});

describe('txn-metrics — telemetry never throws', () => {
  it('swallows errors thrown by the sink (counter)', () => {
    counterSpy.mockImplementationOnce(() => {
      throw new Error('sink down');
    });
    expect(() =>
      emitPrepareDuration({ txType: 'swap', durationMs: 100, outcome: 'success' }),
    ).not.toThrow();
  });

  it('swallows errors thrown by the sink (histogram)', () => {
    histogramSpy.mockImplementationOnce(() => {
      throw new Error('sink down');
    });
    expect(() =>
      emitSuiWaitDuration({ durationMs: 100, ok: true }),
    ).not.toThrow();
  });
});
