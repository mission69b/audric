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

import { getParallelHeaderLabel } from './ParallelToolsGroup';

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
