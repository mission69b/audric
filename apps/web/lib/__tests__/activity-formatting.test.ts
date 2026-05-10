import { describe, it, expect } from 'vitest';
import {
  STABLE_SYMBOLS,
  buildTitle,
  bundleSubtitle,
  detectBundle,
  formatTokenAmount,
  formatUsd,
  truncAddr,
} from '@/lib/activity-formatting';
import type { ActivityLeg } from '@/lib/activity-types';

// Test fixtures — keep coin types arbitrary; the formatting helpers
// are coin-type agnostic, they only care about the leg's `asset`,
// `decimals`, `amount`, `direction`, and `isStable` fields.
const USDC: ActivityLeg = {
  coinType: '0x...usdc::usdc::USDC',
  asset: 'USDC',
  decimals: 6,
  amount: 1,
  direction: 'out',
  usdValue: 1.0,
  isStable: true,
};

const SUI_LEG: ActivityLeg = {
  coinType: '0x2::sui::SUI',
  asset: 'SUI',
  decimals: 9,
  amount: 4.4431,
  direction: 'in',
  usdValue: 4.99,
  isStable: false,
};

const MANIFEST_LEG: ActivityLeg = {
  coinType: '0xfake::manifest::MANIFEST',
  asset: 'MANIFEST',
  decimals: 11,
  amount: 987.6,
  direction: 'in',
  usdValue: 2.89,
  isStable: false,
};

const GOLD_LEG: ActivityLeg = {
  coinType: '0xfake::gold::GOLD',
  asset: 'GOLD',
  decimals: 9,
  amount: 0.000639,
  direction: 'in',
  usdValue: 2.99,
  isStable: false,
};

describe('STABLE_SYMBOLS', () => {
  it('includes the four production stables', () => {
    expect(STABLE_SYMBOLS.has('USDC')).toBe(true);
    expect(STABLE_SYMBOLS.has('USDsui')).toBe(true);
    expect(STABLE_SYMBOLS.has('USDT')).toBe(true);
    expect(STABLE_SYMBOLS.has('USDe')).toBe(true);
  });
  it('excludes non-stables', () => {
    expect(STABLE_SYMBOLS.has('SUI')).toBe(false);
    expect(STABLE_SYMBOLS.has('MANIFEST')).toBe(false);
  });
});

describe('truncAddr', () => {
  it('truncates long addresses with first6 + ... + last4', () => {
    expect(truncAddr('0x' + 'a'.repeat(64))).toBe('0xaaaa...aaaa');
  });
  it('returns short addresses unchanged', () => {
    expect(truncAddr('0xshort')).toBe('0xshort');
  });
});

describe('formatTokenAmount', () => {
  it('shows 4 dp for amounts >= 1', () => {
    expect(formatTokenAmount(987.6, 11)).toBe('987.6');
    expect(formatTokenAmount(4.4431, 9)).toBe('4.4431');
  });
  it('shows 6 dp for amounts >= 0.01 < 1', () => {
    expect(formatTokenAmount(0.123456, 9)).toBe('0.123456');
  });
  it('shows on-chain decimals for tiny amounts (capped at 9)', () => {
    expect(formatTokenAmount(0.000639, 9)).toBe('0.000639');
  });
  it('trims trailing zeros', () => {
    expect(formatTokenAmount(1, 6)).toBe('1');
    expect(formatTokenAmount(2.5, 6)).toBe('2.5');
  });
});

describe('formatUsd', () => {
  it('shows 2 dp for amounts >= 1', () => {
    expect(formatUsd(987.6)).toBe('$987.60');
    expect(formatUsd(2.89)).toBe('$2.89');
  });
  it('shows 3 dp for amounts >= 0.01 < 1', () => {
    expect(formatUsd(0.567)).toBe('$0.567');
  });
  it('collapses sub-cent amounts to <$0.01', () => {
    expect(formatUsd(0.001)).toBe('<$0.01');
    expect(formatUsd(0)).toBe('<$0.01');
  });
});

describe('detectBundle', () => {
  it('returns false for a single-leg lending tx', () => {
    const result = detectBundle([USDC], ['0xnavi::lending_core::deposit']);
    expect(result.isBundle).toBe(false);
    expect(result.opCount).toBe(0);
  });

  it('returns false for a 2-leg single swap (USDC out + SUI in)', () => {
    const result = detectBundle(
      [USDC, SUI_LEG],
      ['0xrouter::router::new_swap_context_v', '0xpkg::cetus::swap', '0xrouter::router::confirm_swap'],
    );
    expect(result.isBundle).toBe(false);
  });

  it('returns true for multi-currency (>2 legs) — swap+swap+save bundle', () => {
    // Reproduces the user's smoke: swap 5 USDC to SUI then swap 3 USDC
    // to GOLD then save 2 USDC. After Sui collapses balance changes:
    //   USDC: -10 (3 outflows summed), SUI: +4.4, GOLD: +0.000639
    const usdcOut: ActivityLeg = { ...USDC, amount: 10, usdValue: 10 };
    const result = detectBundle(
      [usdcOut, SUI_LEG, GOLD_LEG],
      [
        '0xrouter::router::new_swap_context_v',
        '0xpkg::cetus::swap',
        '0xpkg::bluefin::swap',
        '0xrouter::router::confirm_swap',
        '0xnavi::lending_core::deposit',
      ],
    );
    expect(result.isBundle).toBe(true);
    expect(result.opCount).toBe(3); // 3 currency legs
  });

  it('returns true for cross-protocol bundle (swap+save) with only 2 legs', () => {
    // Example: swap 1 USDC to SUI then save the SUI? Not realistic; a
    // realistic 2-leg cross-protocol case: borrow USDsui then swap to
    // USDC. Here we just want to assert the cross-protocol heuristic
    // fires on the move-call-target classification, not the leg count.
    const result = detectBundle(
      [USDC, SUI_LEG],
      ['0xpkg::cetus::swap', '0xnavi::lending_core::deposit'],
    );
    expect(result.isBundle).toBe(true);
  });

  it('returns false when only the same protocol appears multiple times', () => {
    // Pure swap (multiple Cetus router calls but same protocol)
    const result = detectBundle(
      [USDC, SUI_LEG],
      ['0xpkg::cetus::swap', '0xpkg::cetus::route', '0xrouter::router::confirm_swap'],
    );
    expect(result.isBundle).toBe(false);
  });
});

describe('buildTitle', () => {
  it('renders bundle title with op count', () => {
    expect(buildTitle('bundle', [USDC, SUI_LEG, GOLD_LEG], 3, undefined)).toBe('Bundle (3 ops)');
  });

  it('renders bundle title without op count when zero', () => {
    expect(buildTitle('bundle', [], undefined, undefined)).toBe('Bundle');
  });

  it('renders swap with BOTH legs (the bug fix)', () => {
    // Pre-rebuild this would say `Swapped $987.60 MANIFEST`. Now it
    // says the truth: the user paid 1 USDC and got 987.60 MANIFEST.
    const title = buildTitle('swap', [USDC, MANIFEST_LEG], undefined, undefined);
    expect(title).toBe('Swapped 1 USDC for 987.6 MANIFEST');
  });

  it('renders save (lending out) correctly', () => {
    const saveLeg: ActivityLeg = { ...USDC, amount: 2, usdValue: 2 };
    expect(buildTitle('lending', [saveLeg], undefined, undefined)).toBe('Saved 2 USDC into NAVI');
  });

  it('renders withdraw (lending in) correctly', () => {
    const withdrawLeg: ActivityLeg = { ...USDC, direction: 'in', amount: 18.07, usdValue: 18.07 };
    expect(buildTitle('lending', [withdrawLeg], undefined, undefined)).toBe(
      'Withdrew 18.07 USDC from NAVI',
    );
  });

  it('renders send with truncated counterparty', () => {
    const sendLeg: ActivityLeg = { ...USDC, amount: 5, usdValue: 5 };
    const title = buildTitle('send', [sendLeg], undefined, '0x' + 'a'.repeat(64));
    expect(title).toBe('Sent 5 USDC to 0xaaaa...aaaa');
  });

  it('renders send with resolved counterparty label (saved contact)', () => {
    const sendLeg: ActivityLeg = { ...USDC, amount: 5, usdValue: 5 };
    const title = buildTitle('send', [sendLeg], undefined, '0x' + 'a'.repeat(64), 'Mom');
    expect(title).toBe('Sent 5 USDC to Mom');
  });

  it('renders send with resolved counterparty label (Audric handle)', () => {
    const sendLeg: ActivityLeg = { ...USDC, amount: 5, usdValue: 5 };
    const title = buildTitle(
      'send',
      [sendLeg],
      undefined,
      '0x' + 'a'.repeat(64),
      'alice.audric.sui',
    );
    expect(title).toBe('Sent 5 USDC to alice.audric.sui');
  });

  it('renders receive with resolved counterparty label', () => {
    const recvLeg: ActivityLeg = { ...USDC, direction: 'in', amount: 1, usdValue: 1 };
    const title = buildTitle(
      'receive',
      [recvLeg],
      undefined,
      '0x' + 'b'.repeat(64),
      'alice.audric.sui',
    );
    expect(title).toBe('Received 1 USDC from alice.audric.sui');
  });

  it('falls back to truncated address when label is undefined', () => {
    const sendLeg: ActivityLeg = { ...USDC, amount: 5, usdValue: 5 };
    const title = buildTitle('send', [sendLeg], undefined, '0x' + 'c'.repeat(64), undefined);
    expect(title).toBe('Sent 5 USDC to 0xcccc...cccc');
  });

  it('renders pay with token amount', () => {
    expect(buildTitle('pay', [USDC], undefined, undefined)).toBe('Paid 1 USDC for service');
  });
});

describe('bundleSubtitle', () => {
  it('omits subtitle for single-leg lending (avoids redundancy with title)', () => {
    expect(bundleSubtitle([USDC], 'lending')).toBeUndefined();
  });

  it('shows net OUT USD with "today" caveat for non-stable bundles', () => {
    // Bundle: -10 USDC (stable) + +SUI + +GOLD (non-stable). The OUT
    // side is all USDC ($10), but the legs collectively include
    // non-stables, so we add the "today" caveat.
    const usdcOut: ActivityLeg = { ...USDC, amount: 10, usdValue: 10 };
    const subtitle = bundleSubtitle([usdcOut, SUI_LEG, GOLD_LEG], 'bundle');
    expect(subtitle).toBe('$10.00 today');
  });

  it('omits "today" caveat when every leg is a stable', () => {
    // Pure-stable transaction: subtitle USD == on-chain USD, no
    // historical-vs-today drift to caveat.
    const usdcOut: ActivityLeg = { ...USDC, amount: 5, usdValue: 5 };
    const usdcIn: ActivityLeg = { ...USDC, direction: 'in', amount: 5, usdValue: 5.0 };
    expect(bundleSubtitle([usdcOut, usdcIn], 'swap')).toBe('$5.00');
  });

  it('shows net IN USD for inflow-only rows (withdraw, borrow, receive)', () => {
    // Withdraw 18.07 USDC — single inflow, no outflow.
    const withdrawLeg: ActivityLeg = { ...USDC, direction: 'in', amount: 18.07, usdValue: 18.07 };
    // Note: this is single-leg lending, so the "lending" branch
    // returns undefined. Test the swap branch instead, which
    // exercises the inflow-only fallback.
    const subtitle = bundleSubtitle([withdrawLeg], 'swap');
    expect(subtitle).toBe('$18.07');
  });

  it('returns undefined when no leg has a usdValue (degraded prices)', () => {
    const noPriceLeg: ActivityLeg = { ...MANIFEST_LEG, usdValue: null };
    expect(bundleSubtitle([noPriceLeg], 'swap')).toBeUndefined();
  });

  it('returns undefined for empty legs', () => {
    expect(bundleSubtitle([], 'swap')).toBeUndefined();
  });
});
