import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
} from '@t2000/engine';
import { emitQuoteRefreshFired } from '../quote-refresh-metrics';

/**
 * SPEC 15 v0.6 — Unified quote-refresh telemetry tests.
 *
 * Locks the wire-shape (`audric.quote_refresh.fired{surface}`) so a
 * dashboard query rooted on this counter can't silently break on
 * refactor. Mirrors the `bundle-metrics.test.ts` shape.
 */

function makeSpy(): {
  sink: TelemetrySink;
  counter: ReturnType<typeof vi.fn>;
} {
  const counter = vi.fn();
  return {
    sink: {
      counter,
      gauge: vi.fn(),
      histogram: vi.fn(),
    } as TelemetrySink,
    counter,
  };
}

afterEach(() => {
  resetTelemetrySink();
});

describe('emitQuoteRefreshFired', () => {
  it('emits audric.quote_refresh.fired with surface=chip', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitQuoteRefreshFired({ surface: 'chip' });

    expect(counter).toHaveBeenCalledTimes(1);
    expect(counter).toHaveBeenCalledWith('audric.quote_refresh.fired', {
      surface: 'chip',
    });
  });

  it('emits audric.quote_refresh.fired with surface=permission_card', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitQuoteRefreshFired({ surface: 'permission_card' });

    expect(counter).toHaveBeenCalledTimes(1);
    expect(counter).toHaveBeenCalledWith('audric.quote_refresh.fired', {
      surface: 'permission_card',
    });
  });

  it('never throws when the sink itself raises (telemetry must not block hot paths)', () => {
    const { sink, counter } = makeSpy();
    counter.mockImplementation(() => {
      throw new Error('sink down');
    });
    setTelemetrySink(sink);

    expect(() => emitQuoteRefreshFired({ surface: 'chip' })).not.toThrow();
  });

  it('namespace is always `audric.quote_refresh.fired` — locks the dashboard query name', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitQuoteRefreshFired({ surface: 'chip' });
    emitQuoteRefreshFired({ surface: 'permission_card' });

    for (const call of counter.mock.calls) {
      expect(call[0]).toBe('audric.quote_refresh.fired');
    }
  });
});
