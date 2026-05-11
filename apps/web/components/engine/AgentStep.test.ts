/**
 * SPEC 23A-A3 — getStepIcon glyph fidelity vs `audric_demos_v2/demos/*.html`.
 *
 * These assertions lock the demo-aligned glyphs so a future refactor can't
 * silently regress them back to the generic 🔄 / 🔍 / 📇 set.
 */

import { describe, expect, it } from 'vitest';

import { getStepIcon } from './AgentStep';

describe('getStepIcon — demo glyph fidelity (SPEC 23A-A3)', () => {
  it('swap_execute uses ⇆ (demo 01 CETUS · SUI ROUTE row)', () => {
    expect(getStepIcon('swap_execute')).toBe('⇆');
  });

  it('swap_quote shares the same ⇆ glyph as swap_execute (consistency)', () => {
    expect(getStepIcon('swap_quote')).toBe('⇆');
  });

  it('mpp_services uses ⊞ (demo 05 DISCOVER MPP row)', () => {
    expect(getStepIcon('mpp_services')).toBe('⊞');
  });

  it('save_contact uses 👤 (demo 01 CONTACT · "MOM" row)', () => {
    expect(getStepIcon('save_contact')).toBe('👤');
  });

  it('balance_check keeps 💰 (already at demo bar)', () => {
    expect(getStepIcon('balance_check')).toBe('💰');
  });

  it('rates_info / yield_summary keep 📈 (already at demo bar)', () => {
    expect(getStepIcon('rates_info')).toBe('📈');
    expect(getStepIcon('yield_summary')).toBe('📈');
  });

  it('falls through to ⚙️ for unknown tool names', () => {
    expect(getStepIcon('this_tool_does_not_exist')).toBe('⚙️');
  });
});
