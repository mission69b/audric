/**
 * SPEC 23A-A2 — getParallelHeaderLabel
 *
 * Header copy varies by tool composition. Buckets pulled from
 * `audric_demos_v2/demos/*.html`:
 *
 *   pure pay_api          → "DISPATCHING N MPP CALLS"
 *   pure mpp_services     → "QUERYING N VENDORS IN PARALLEL · MPP DISCOVERY"
 *   mpp_services + pay    → "DISPATCHING N MPP CALLS · DISCOVERY + QUOTES"
 *   anything else         → "DISPATCHING N READS · PARALLEL"
 */

import { describe, expect, it } from 'vitest';

import { getParallelHeaderLabel, shouldUseMppGrid } from './ParallelToolsGroup';
import type { ToolTimelineBlock } from '@/lib/engine-types';

describe('getParallelHeaderLabel', () => {
  it('returns "DISPATCHING N READS · PARALLEL" for pure read mix (demo 01)', () => {
    const tools = [
      { toolName: 'balance_check' },
      { toolName: 'savings_info' },
      { toolName: 'rates_info' },
      { toolName: 'health_check' },
      { toolName: 'transaction_history' },
    ];
    expect(getParallelHeaderLabel(tools)).toBe('DISPATCHING 5 READS · PARALLEL');
  });

  it('returns "DISPATCHING N MPP CALLS" for pure pay_api mix (demos 03, 04)', () => {
    const tools = [
      { toolName: 'pay_api' },
      { toolName: 'pay_api' },
      { toolName: 'pay_api' },
      { toolName: 'pay_api' },
    ];
    expect(getParallelHeaderLabel(tools)).toBe('DISPATCHING 4 MPP CALLS');
  });

  it('returns "QUERYING N VENDORS IN PARALLEL · MPP DISCOVERY" for pure mpp_services mix (demo 06)', () => {
    const tools = [
      { toolName: 'mpp_services' },
      { toolName: 'mpp_services' },
      { toolName: 'mpp_services' },
      { toolName: 'mpp_services' },
    ];
    expect(getParallelHeaderLabel(tools)).toBe(
      'QUERYING 4 VENDORS IN PARALLEL · MPP DISCOVERY',
    );
  });

  it('returns "DISPATCHING N MPP CALLS · DISCOVERY + QUOTES" for pay_api + mpp_services mix (demo 05)', () => {
    const tools = [
      { toolName: 'mpp_services' },
      { toolName: 'mpp_services' },
      { toolName: 'pay_api' },
      { toolName: 'pay_api' },
      { toolName: 'pay_api' },
    ];
    expect(getParallelHeaderLabel(tools)).toBe(
      'DISPATCHING 5 MPP CALLS · DISCOVERY + QUOTES',
    );
  });

  it('falls through to READS bucket when reads + mpp tools mix (out-of-bucket combo)', () => {
    const tools = [
      { toolName: 'balance_check' },
      { toolName: 'mpp_services' },
      { toolName: 'pay_api' },
    ];
    expect(getParallelHeaderLabel(tools)).toBe('DISPATCHING 3 READS · PARALLEL');
  });

  it('returns generic label for empty input (defensive)', () => {
    expect(getParallelHeaderLabel([])).toBe('RUNNING TASKS IN PARALLEL');
  });

  it('handles single-tool case (precondition is N≥2 in caller, but registry still computes)', () => {
    expect(getParallelHeaderLabel([{ toolName: 'pay_api' }])).toBe(
      'DISPATCHING 1 MPP CALLS',
    );
    expect(getParallelHeaderLabel([{ toolName: 'mpp_services' }])).toBe(
      'QUERYING 1 VENDORS IN PARALLEL · MPP DISCOVERY',
    );
    expect(getParallelHeaderLabel([{ toolName: 'balance_check' }])).toBe(
      'DISPATCHING 1 READS · PARALLEL',
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-MPP5 — shouldUseMppGrid detection rule (2026-05-12)
//
// Decides whether a parallel cluster routes through MppReceiptGrid (CSS
// grid, side-by-side) or the chronological vertical stack. Two conditions
// must both hold:
//   1. ≥ 2 settled tools (single pay_api stays inline; nothing to grid).
//   2. ALL settled tools are pay_api (mixed clusters keep the stack —
//      pay_api + balance_check shouldn't grid because the balance card
//      is wider and visually distinct from MPP receipts).
// ───────────────────────────────────────────────────────────────────────────

function mockTool(
  toolName: string,
  status: ToolTimelineBlock['status'] = 'done',
): ToolTimelineBlock {
  return {
    type: 'tool',
    toolName,
    toolUseId: `${toolName}-${Math.random().toString(36).slice(2, 8)}`,
    input: {},
    status,
    result: undefined,
    isError: false,
    startedAt: 0,
    endedAt: 100,
  } as ToolTimelineBlock;
}

describe('shouldUseMppGrid', () => {
  it('returns true for 2 pay_api both settled', () => {
    expect(shouldUseMppGrid([mockTool('pay_api'), mockTool('pay_api')])).toBe(true);
  });

  it('returns true for 4 pay_api all settled (DALL-E + ElevenLabs + Lob + Resend)', () => {
    expect(
      shouldUseMppGrid([
        mockTool('pay_api'),
        mockTool('pay_api'),
        mockTool('pay_api'),
        mockTool('pay_api'),
      ]),
    ).toBe(true);
  });

  it('returns false for 1 pay_api (single receipt renders inline, nothing to grid)', () => {
    expect(shouldUseMppGrid([mockTool('pay_api')])).toBe(false);
  });

  it('returns false for empty cluster', () => {
    expect(shouldUseMppGrid([])).toBe(false);
  });

  it('returns false for mixed pay_api + balance_check (visual weight differs)', () => {
    expect(
      shouldUseMppGrid([mockTool('pay_api'), mockTool('balance_check')]),
    ).toBe(false);
  });

  it('returns false for mixed pay_api + mpp_services (mixed shapes)', () => {
    expect(
      shouldUseMppGrid([mockTool('pay_api'), mockTool('mpp_services')]),
    ).toBe(false);
  });

  it('returns false for non-pay_api parallel reads', () => {
    expect(
      shouldUseMppGrid([
        mockTool('balance_check'),
        mockTool('savings_info'),
        mockTool('rates_info'),
      ]),
    ).toBe(false);
  });

  it('ignores still-running tools (only counts settled)', () => {
    // 2 pay_api but one is still running → only 1 settled → false
    expect(
      shouldUseMppGrid([mockTool('pay_api'), mockTool('pay_api', 'running')]),
    ).toBe(false);
  });

  it('counts errored tools as settled (failed pay_api still gets a card slot)', () => {
    // 2 pay_api, one done, one error → both settled, both pay_api → true
    // The errored one renders via ErrorReceipt (B-MPP6 v1.1) but still
    // belongs in the grid layout.
    expect(
      shouldUseMppGrid([mockTool('pay_api'), mockTool('pay_api', 'error')]),
    ).toBe(true);
  });

  it('returns true when interrupted tools are excluded (only done counts)', () => {
    // 1 done + 1 interrupted (excluded by the settled filter) = 1 settled
    // → false (need ≥ 2)
    expect(
      shouldUseMppGrid([
        mockTool('pay_api'),
        mockTool('pay_api', 'interrupted'),
      ]),
    ).toBe(false);
  });
});
