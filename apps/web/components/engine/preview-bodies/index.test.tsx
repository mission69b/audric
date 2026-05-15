/**
 * SPEC 37 v0.7a Phase 2 Day 17-22 — Write-tool preview bodies unit tests.
 *
 * Convention: raw DOM API only — `textContent`, `querySelector`.
 *
 * Coverage (5 bodies × core scenarios):
 *   - SaveDepositPreviewBody: USDC default, USDsui asset, fee math
 *   - WithdrawPreviewBody: yield-foregone label, asset routing
 *   - BorrowPreviewBody: borrow rate label
 *   - RepayPreviewBody: borrow rate cleared label
 *   - HarvestRewardsPreviewBody: default slippage, custom slippage, threshold
 *   - APY override props
 *   - Dispatcher: known tool returns body, unknown tool returns null
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SaveDepositPreviewBody,
  WithdrawPreviewBody,
  BorrowPreviewBody,
  RepayPreviewBody,
  HarvestRewardsPreviewBody,
  renderPreviewBody,
  SUPPORTED_PREVIEW_TOOLS,
} from './index';

// Shim the body-renderer outputs through React render so we can assert on textContent.
function rb(node: ReturnType<typeof renderPreviewBody>) {
  if (node === null) return null;
  return render(<>{node}</>);
}

describe('SaveDepositPreviewBody', () => {
  it('renders Deposit row + Pool APY for default USDC', () => {
    const { container } = render(
      <SaveDepositPreviewBody input={{ amount: 50 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Deposit');
    expect(text).toContain('USDC');
    expect(text).toContain('50.00');
    expect(text).toContain('Pool APY');
    expect(text).toContain('4.62%');
    expect(text).toContain('0.10% NAVI overlay');
    // Fee math: 50 * 0.001 = 0.05
    expect(text).toContain('$0.05');
  });

  it('routes USDsui asset to USDsui APY', () => {
    const { container } = render(
      <SaveDepositPreviewBody input={{ amount: 100, asset: 'USDsui' }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('USDsui');
    expect(text).toContain('5.20%');
  });

  it('honors APY override', () => {
    const { container } = render(
      <SaveDepositPreviewBody
        input={{ amount: 50 }}
        ratesOverride={{ usdcApyBps: 580 }}
      />,
    );
    expect(container.textContent ?? '').toContain('5.80%');
  });
});

describe('WithdrawPreviewBody', () => {
  it('renders Withdraw row + Yield foregone label', () => {
    const { container } = render(
      <WithdrawPreviewBody input={{ amount: 25 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Withdraw');
    expect(text).toContain('25.00');
    expect(text).toContain('Yield foregone');
    expect(text).toContain('4.62%');
  });

  it('routes USDsui asset', () => {
    const { container } = render(
      <WithdrawPreviewBody input={{ amount: 25, asset: 'USDsui' }} />,
    );
    expect(container.textContent ?? '').toContain('USDsui');
  });
});

describe('BorrowPreviewBody', () => {
  it('renders Borrow row + Borrow rate label', () => {
    const { container } = render(
      <BorrowPreviewBody input={{ amount: 100 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Borrow');
    expect(text).toContain('100.00');
    expect(text).toContain('Borrow rate');
  });

  it('honors overlayFeeBps override', () => {
    const { container } = render(
      <BorrowPreviewBody input={{ amount: 100 }} overlayFeeBps={25} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('0.25% NAVI overlay');
    // 100 * 0.0025 = 0.25
    expect(text).toContain('$0.25');
  });
});

describe('RepayPreviewBody', () => {
  it('renders Repay row + Borrow rate cleared label', () => {
    const { container } = render(
      <RepayPreviewBody input={{ amount: 50, asset: 'USDC' }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Repay');
    expect(text).toContain('50.00');
    expect(text).toContain('Borrow rate cleared');
  });
});

describe('HarvestRewardsPreviewBody', () => {
  it('renders default 1.00% slippage when input is empty', () => {
    const { container } = render(<HarvestRewardsPreviewBody input={{}} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Compound all pending rewards');
    expect(text).toContain('claim');
    expect(text).toContain('swap each non-USDC reward to USDC');
    expect(text).toContain('deposit merged USDC into savings');
    expect(text).toContain('Per-swap slippage');
    expect(text).toContain('1.00%');
    expect(text).toContain('0.10% Cetus + 0.10% NAVI');
    expect(text).not.toContain('Threshold');
  });

  it('renders custom slippage when provided', () => {
    const { container } = render(
      <HarvestRewardsPreviewBody input={{ slippage: 0.005 }} />,
    );
    expect(container.textContent ?? '').toContain('0.50%');
  });

  it('renders threshold row when minRewardUsd > 0', () => {
    const { container } = render(
      <HarvestRewardsPreviewBody input={{ minRewardUsd: 1.5 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Threshold');
    expect(text).toContain('Min reward');
    expect(text).toContain('$1.50');
  });

  it('hides threshold row when minRewardUsd is 0', () => {
    const { container } = render(
      <HarvestRewardsPreviewBody input={{ minRewardUsd: 0 }} />,
    );
    expect(container.textContent ?? '').not.toContain('Threshold');
  });
});

describe('renderPreviewBody dispatcher', () => {
  it('returns a body for every supported tool', () => {
    for (const toolName of SUPPORTED_PREVIEW_TOOLS) {
      const node = renderPreviewBody(toolName, { amount: 10 });
      expect(node).not.toBeNull();
      const out = rb(node);
      expect(out).not.toBeNull();
    }
  });

  it('returns null for unknown tools', () => {
    const node = renderPreviewBody('unknown_tool', { amount: 10 });
    expect(node).toBeNull();
  });

  it('threads ratesOverride through to the body', () => {
    const node = renderPreviewBody(
      'save_deposit',
      { amount: 50 },
      { ratesOverride: { usdcApyBps: 700 } },
    );
    const out = rb(node);
    expect(out!.container.textContent).toContain('7.00%');
  });

  it('threads overlayFeeBps through to the body', () => {
    const node = renderPreviewBody(
      'save_deposit',
      { amount: 100 },
      { overlayFeeBps: 50 },
    );
    const out = rb(node);
    const text = out!.container.textContent ?? '';
    expect(text).toContain('0.50% NAVI overlay');
    expect(text).toContain('$0.50');
  });

  it('lists all 5 supported tools', () => {
    expect(new Set(SUPPORTED_PREVIEW_TOOLS)).toEqual(
      new Set([
        'save_deposit',
        'withdraw',
        'borrow',
        'repay_debt',
        'harvest_rewards',
      ]),
    );
  });
});
