import { describe, it, expect } from 'vitest';
import { getHfStatus, formatHf } from '../HealthCard';

describe('HealthCard — getHfStatus', () => {
  // Regression coverage for the bug where a no-debt account was rendered
  // as "Critical 0.00". JSON.stringify(Infinity) === "null" → the client
  // received either `null`, `undefined`, or 0, and `getHfStatus(0)` used
  // to return 'critical'. Any of those inputs must now resolve to
  // 'healthy' as long as borrowed is at/below dust.
  it.each([
    ['null HF, zero debt', null, 0],
    ['undefined HF, zero debt', undefined, 0],
    ['zero HF, zero debt', 0, 0],
    ['NaN HF, zero debt', Number.NaN, 0],
    ['null HF, dust debt', null, 0.000018],
    ['real HF but dust debt', 0.0001, 0.000018],
  ])('treats %s as healthy', (_label, hf, borrowed) => {
    expect(getHfStatus(hf, borrowed)).toBe('healthy');
  });

  it('still flags real critical positions when there is real debt', () => {
    expect(getHfStatus(1.05, 5)).toBe('critical');
    expect(getHfStatus(1.3, 5)).toBe('danger');
    expect(getHfStatus(1.7, 5)).toBe('warning');
    expect(getHfStatus(3.0, 5)).toBe('healthy');
  });

  it('handles non-finite values with real debt by defaulting to healthy', () => {
    // We can't claim "critical" on infinite/null HF when there IS debt
    // — that's a data error, not an underwater position. Better to be
    // optimistic in display than to scare the user with a false alarm.
    expect(getHfStatus(null, 5)).toBe('healthy');
    expect(getHfStatus(undefined, 5)).toBe('healthy');
    expect(getHfStatus(Number.POSITIVE_INFINITY, 5)).toBe('healthy');
  });
});

describe('HealthCard — formatHf', () => {
  it('renders ∞ and pins the gauge to max for no-debt accounts', () => {
    expect(formatHf(null, 0)).toEqual({ display: '∞', gaugeValue: 5 });
    expect(formatHf(0, 0)).toEqual({ display: '∞', gaugeValue: 5 });
    expect(formatHf(undefined, 0)).toEqual({ display: '∞', gaugeValue: 5 });
  });

  it('renders ∞ when HF itself is non-finite', () => {
    expect(formatHf(Number.POSITIVE_INFINITY, 5)).toEqual({ display: '∞', gaugeValue: 5 });
    expect(formatHf(Number.NaN, 5)).toEqual({ display: '∞', gaugeValue: 5 });
  });

  it('renders the numeric HF when there is real debt and a finite value', () => {
    expect(formatHf(8.49, 5)).toEqual({ display: '8.49', gaugeValue: 8.49 });
    expect(formatHf(1.05, 5)).toEqual({ display: '1.05', gaugeValue: 1.05 });
  });

  it('treats sub-cent borrowed dust as no-debt', () => {
    expect(formatHf(0.0001, 0.000018)).toEqual({ display: '∞', gaugeValue: 5 });
  });

  it('NEVER renders "0.00" for a no-debt account', () => {
    // This was the visible symptom — the literal string "Critical 0.00"
    // appearing right next to "$0.00 borrowed". Lock it in.
    const cases: Array<[number | null | undefined, number]> = [
      [null, 0],
      [undefined, 0],
      [0, 0],
      [Number.NaN, 0],
    ];
    for (const [hf, borrowed] of cases) {
      expect(formatHf(hf, borrowed).display).not.toBe('0.00');
    }
  });
});
