import { describe, expect, it } from 'vitest';

import { LEGACY_STABLES, TIER_12_ASSETS, TIER_A_SCENARIOS, TIER_B_SCENARIOS } from './scenarios';

describe('Tier A scenario inventory', () => {
  it('has every scenario id unique (no accidental dupes that would collapse coverage)', () => {
    const ids = TIER_A_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every Tier 1+2 asset in BOTH directions vs USDC', () => {
    for (const asset of TIER_12_ASSETS) {
      const toUsdc = TIER_A_SCENARIOS.find((s) => s.from === asset && s.to === 'USDC' && s.category === 'tier12');
      const fromUsdc = TIER_A_SCENARIOS.find((s) => s.from === 'USDC' && s.to === asset && s.category === 'tier12');
      expect(toUsdc, `missing ${asset} → USDC`).toBeDefined();
      expect(fromUsdc, `missing USDC → ${asset}`).toBeDefined();
    }
  });

  it('covers every legacy stable in BOTH directions vs USDC', () => {
    for (const asset of LEGACY_STABLES) {
      const toUsdc = TIER_A_SCENARIOS.find((s) => s.from === asset && s.to === 'USDC' && s.category === 'legacy');
      const fromUsdc = TIER_A_SCENARIOS.find((s) => s.from === 'USDC' && s.to === asset && s.category === 'legacy');
      expect(toUsdc, `missing ${asset} → USDC`).toBeDefined();
      expect(fromUsdc, `missing USDC → ${asset}`).toBeDefined();
    }
  });

  it('every error-path scenario declares an expectedError code', () => {
    const errorScenarios = TIER_A_SCENARIOS.filter((s) => s.category === 'error');
    expect(errorScenarios.length).toBeGreaterThan(0);
    for (const s of errorScenarios) {
      expect(s.expectedError, `${s.id} missing expectedError`).toBeDefined();
    }
  });

  it('no happy-path scenario declares an expectedError (would be self-contradictory)', () => {
    const nonError = TIER_A_SCENARIOS.filter((s) => s.category !== 'error');
    for (const s of nonError) {
      expect(s.expectedError, `${s.id} (${s.category}) should not declare expectedError`).toBeUndefined();
    }
  });

  it('S.123 SSUI regression scenario is present and asserts ASSET_NOT_SUPPORTED', () => {
    const ssui = TIER_A_SCENARIOS.find((s) => s.id === 'err_unknown_token_ssui');
    expect(ssui).toBeDefined();
    expect(ssui?.from).toBe('SSUI');
    expect(ssui?.expectedError).toBe('ASSET_NOT_SUPPORTED');
  });

  it('total scenario count is 41 (30 tier12 + 6 legacy + 1 cross + 4 error)', () => {
    expect(TIER_A_SCENARIOS).toHaveLength(41);
  });
});

describe('Tier B scenario inventory', () => {
  it('has every scenario id unique', () => {
    const ids = TIER_B_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scenario has positive amountUsdc', () => {
    for (const s of TIER_B_SCENARIOS) {
      expect(s.amountUsdc).toBeGreaterThan(0);
    }
  });

  it('total daily Tier B budget stays under $1 (cap is $0.50/day per scope)', () => {
    const totalUsdcIn = TIER_B_SCENARIOS.reduce((acc, s) => acc + s.amountUsdc, 0);
    expect(totalUsdcIn).toBeLessThanOrEqual(1);
  });
});
