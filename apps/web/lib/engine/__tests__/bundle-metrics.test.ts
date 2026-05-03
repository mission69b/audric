import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  setTelemetrySink,
  resetTelemetrySink,
  type TelemetrySink,
} from '@t2000/engine';
import {
  emitBundleProposed,
  emitBundleOutcome,
  emitBundleComposeDuration,
  emitSwapComposeDuration,
} from '../bundle-metrics';

/**
 * SPEC 7 P2.7 — Telemetry helper tests.
 *
 * Lock the wire-shape of the three soak metrics so a refactor of
 * `getTelemetrySink()` or the namespace string can't silently regress
 * dashboard queries. The 48h soak decision matrix in
 * `spec/runbooks/RUNBOOK_spec7_p27_ramp.md` reads from these counters
 * with literal name + tag strings — anything that breaks the contract
 * silently breaks the soak.
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

describe('emitBundleProposed', () => {
  it('emits bundle_proposed_count for a multi-step bundle with tags', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleProposed([
      { toolName: 'swap_execute' },
      { toolName: 'save_deposit' },
      { toolName: 'send_transfer' },
    ]);

    expect(counter).toHaveBeenCalledOnce();
    expect(counter).toHaveBeenCalledWith('audric.harness.bundle_proposed_count', {
      stepCount: 3,
      hasSwap: 'true',
      hasNavi: 'true',
      hasTransfer: 'true',
      hasVolo: 'false',
    });
  });

  it('does not emit for single-step actions (single-write path is covered by per-tool metrics)', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleProposed([{ toolName: 'send_transfer' }]);

    expect(counter).not.toHaveBeenCalled();
  });

  it('does not emit for empty step list', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleProposed([]);

    expect(counter).not.toHaveBeenCalled();
  });

  it('classifies all NAVI tools (save_deposit/withdraw/borrow/repay_debt/claim_rewards) under hasNavi', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleProposed([
      { toolName: 'borrow' },
      { toolName: 'send_transfer' },
    ]);

    expect(counter).toHaveBeenCalledWith(
      'audric.harness.bundle_proposed_count',
      expect.objectContaining({ hasNavi: 'true' }),
    );
  });

  it('classifies volo_stake/volo_unstake under hasVolo (separate from NAVI)', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleProposed([
      { toolName: 'swap_execute' },
      { toolName: 'volo_stake' },
    ]);

    expect(counter).toHaveBeenCalledWith(
      'audric.harness.bundle_proposed_count',
      expect.objectContaining({ hasVolo: 'true', hasNavi: 'false', hasSwap: 'true' }),
    );
  });

  it('emits cleanly when telemetry sink throws (telemetry is fire-and-forget)', () => {
    const throwingSink: TelemetrySink = {
      counter: () => {
        throw new Error('boom');
      },
      gauge: vi.fn(),
      histogram: vi.fn(),
    };
    setTelemetrySink(throwingSink);

    expect(() =>
      emitBundleProposed([
        { toolName: 'swap_execute' },
        { toolName: 'save_deposit' },
      ]),
    ).not.toThrow();
  });
});

describe('emitBundleOutcome', () => {
  it('emits bundle_outcome_count{outcome=executed} for the happy path', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleOutcome({ outcome: 'executed', stepCount: 3 });

    expect(counter).toHaveBeenCalledOnce();
    expect(counter).toHaveBeenCalledWith('audric.harness.bundle_outcome_count', {
      outcome: 'executed',
      stepCount: 3,
    });
  });

  it('emits bundle_outcome_count{outcome=reverted} with the right step count', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleOutcome({ outcome: 'reverted', stepCount: 2 });

    expect(counter).toHaveBeenCalledWith('audric.harness.bundle_outcome_count', {
      outcome: 'reverted',
      stepCount: 2,
    });
  });

  it('emits bundle_outcome_count{outcome=compose_error} with optional reason tag', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleOutcome({
      outcome: 'compose_error',
      stepCount: 3,
      reason: 'Unknown tool: foo',
    });

    expect(counter).toHaveBeenCalledWith('audric.harness.bundle_outcome_count', {
      outcome: 'compose_error',
      stepCount: 3,
      reason: 'Unknown tool: foo',
    });
  });

  it('emits bundle_outcome_count{outcome=sponsorship_failed} with statusCode + reason', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleOutcome({
      outcome: 'sponsorship_failed',
      stepCount: 3,
      statusCode: 400,
      reason: 'CommandArgumentError { arg_idx: 1, kind: ArgumentWithoutValue }',
    });

    expect(counter).toHaveBeenCalledWith('audric.harness.bundle_outcome_count', {
      outcome: 'sponsorship_failed',
      stepCount: 3,
      statusCode: 400,
      reason: 'CommandArgumentError { arg_idx: 1, kind: ArgumentWithoutValue }',
    });
  });

  it('omits optional tags when undefined', () => {
    const { sink, counter } = makeSpy();
    setTelemetrySink(sink);

    emitBundleOutcome({ outcome: 'executed', stepCount: 4 });

    const tagsArg = counter.mock.calls[0]![1] as Record<string, unknown>;
    expect(tagsArg).not.toHaveProperty('reason');
    expect(tagsArg).not.toHaveProperty('statusCode');
  });

  it('emits cleanly when telemetry sink throws', () => {
    const throwingSink: TelemetrySink = {
      counter: () => {
        throw new Error('boom');
      },
      gauge: vi.fn(),
      histogram: vi.fn(),
    };
    setTelemetrySink(throwingSink);

    expect(() => emitBundleOutcome({ outcome: 'executed', stepCount: 3 })).not.toThrow();
  });
});

describe('emitBundleComposeDuration', () => {
  it('emits histogram with stepCount tag', () => {
    const { sink, histogram } = makeSpy();
    setTelemetrySink(sink);

    emitBundleComposeDuration(3, 245);

    expect(histogram).toHaveBeenCalledOnce();
    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.bundle_compose_duration_ms',
      245,
      { stepCount: 3 },
    );
  });

  it('emits cleanly when telemetry sink throws', () => {
    const throwingSink: TelemetrySink = {
      counter: vi.fn(),
      gauge: vi.fn(),
      histogram: () => {
        throw new Error('boom');
      },
    };
    setTelemetrySink(throwingSink);

    expect(() => emitBundleComposeDuration(2, 100)).not.toThrow();
  });
});

describe('emitSwapComposeDuration', () => {
  it('emits histogram + counter on success path with stepCount=1 (single-step swap)', () => {
    const { sink, histogram, counter } = makeSpy();
    setTelemetrySink(sink);

    emitSwapComposeDuration({ stepCount: 1, durationMs: 187, outcome: 'success' });

    expect(histogram).toHaveBeenCalledOnce();
    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.swap_compose_duration_ms',
      187,
      { stepCount: 1, outcome: 'success' },
    );
    expect(counter).toHaveBeenCalledOnce();
    expect(counter).toHaveBeenCalledWith(
      'audric.harness.swap_compose_count',
      { stepCount: 1, outcome: 'success' },
    );
  });

  it('emits with stepCount=4 (bundled swap) — Phase 3a max-bundle case', () => {
    const { sink, histogram, counter } = makeSpy();
    setTelemetrySink(sink);

    emitSwapComposeDuration({ stepCount: 4, durationMs: 612, outcome: 'success' });

    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.swap_compose_duration_ms',
      612,
      { stepCount: 4, outcome: 'success' },
    );
    expect(counter).toHaveBeenCalledWith(
      'audric.harness.swap_compose_count',
      { stepCount: 4, outcome: 'success' },
    );
  });

  it('emits with outcome=compose_error when composeTx throws locally', () => {
    const { sink, histogram, counter } = makeSpy();
    setTelemetrySink(sink);

    emitSwapComposeDuration({ stepCount: 2, durationMs: 43, outcome: 'compose_error' });

    expect(histogram).toHaveBeenCalledWith(
      'audric.harness.swap_compose_duration_ms',
      43,
      { stepCount: 2, outcome: 'compose_error' },
    );
    expect(counter).toHaveBeenCalledWith(
      'audric.harness.swap_compose_count',
      { stepCount: 2, outcome: 'compose_error' },
    );
  });

  it('emits cleanly when telemetry sink throws (telemetry must not block writes)', () => {
    const throwingSink: TelemetrySink = {
      counter: () => {
        throw new Error('boom');
      },
      gauge: vi.fn(),
      histogram: () => {
        throw new Error('boom');
      },
    };
    setTelemetrySink(throwingSink);

    expect(() =>
      emitSwapComposeDuration({ stepCount: 1, durationMs: 100, outcome: 'success' }),
    ).not.toThrow();
  });
});
