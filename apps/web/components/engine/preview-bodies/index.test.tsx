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
  it('renders Deposit row + Pool APY + 0.10% SAVE_FEE_BPS overlay for default USDC', () => {
    const { container } = render(
      <SaveDepositPreviewBody input={{ amount: 50 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Deposit');
    expect(text).toContain('USDC');
    expect(text).toContain('50.00');
    expect(text).toContain('Pool APY');
    expect(text).toContain('4.62%');
    // SAVE_FEE_BPS = 10n → 0.10%, fee USD = 50 * 0.001 = $0.05
    expect(text).toContain('0.10% NAVI overlay');
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
  it('renders Withdraw row + Yield foregone label, NO fee row', () => {
    const { container } = render(
      <WithdrawPreviewBody input={{ amount: 25 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Withdraw');
    expect(text).toContain('25.00');
    expect(text).toContain('Yield foregone');
    expect(text).toContain('4.62%');
    // Withdraw is fee-free per audric prepare route — no fee row.
    expect(text).not.toContain('NAVI overlay');
    expect(text).not.toContain('overlay');
  });

  it('routes USDsui asset', () => {
    const { container } = render(
      <WithdrawPreviewBody input={{ amount: 25, asset: 'USDsui' }} />,
    );
    expect(container.textContent ?? '').toContain('USDsui');
  });
});

describe('BorrowPreviewBody', () => {
  it('renders Borrow row + 0.05% BORROW_FEE_BPS overlay, NO APY row', () => {
    const { container } = render(
      <BorrowPreviewBody input={{ amount: 100 }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Borrow');
    expect(text).toContain('100.00');
    // BORROW_FEE_BPS = 5n → 0.05%, fee USD = 100 * 0.0005 = $0.05
    expect(text).toContain('0.05% NAVI overlay');
    expect(text).toContain('$0.05');
    // No APY row — engine doesn't thread borrow APY onto PendingAction.
    expect(text).not.toContain('Borrow rate ·');
    // Caption explains why the rate is omitted.
    expect(text).toContain('Variable rate');
    expect(text).toContain('locked at execute time');
  });

  it('routes USDsui asset', () => {
    const { container } = render(
      <BorrowPreviewBody input={{ amount: 100, asset: 'USDsui' }} />,
    );
    expect(container.textContent ?? '').toContain('USDsui');
  });
});

describe('RepayPreviewBody', () => {
  it('renders Repay row, NO APY row, NO fee row', () => {
    const { container } = render(
      <RepayPreviewBody input={{ amount: 50, asset: 'USDC' }} />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Repay');
    expect(text).toContain('50.00');
    // No fee — repay is fee-free per audric prepare route.
    expect(text).not.toContain('NAVI overlay');
    // No APY — engine doesn't thread borrow rate. Caption explains.
    expect(text).not.toContain('Borrow rate cleared');
    expect(text).toContain('current variable borrow rate');
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

  it('uses canonical SDK fee bps for save_deposit (no override accepted)', () => {
    // Fee bps come from @t2000/sdk SAVE_FEE_BPS — no per-render override
    // surface; if the SDK constant changes, every consumer updates together.
    const node = renderPreviewBody('save_deposit', { amount: 100 });
    const out = rb(node);
    const text = out!.container.textContent ?? '';
    expect(text).toContain('0.10% NAVI overlay');
    // 100 * 0.001 = $0.10
    expect(text).toContain('$0.10');
  });

  it('uses canonical SDK fee bps for borrow', () => {
    const node = renderPreviewBody('borrow', { amount: 200 });
    const out = rb(node);
    const text = out!.container.textContent ?? '';
    expect(text).toContain('0.05% NAVI overlay');
    // 200 * 0.0005 = $0.10
    expect(text).toContain('$0.10');
  });

  it('omits fees for withdraw + repay_debt (none charged on-chain)', () => {
    for (const tool of ['withdraw', 'repay_debt']) {
      const node = renderPreviewBody(tool, { amount: 100 });
      const out = rb(node);
      const text = out!.container.textContent ?? '';
      expect(text).not.toContain('NAVI overlay');
      expect(text).not.toContain('overlay');
    }
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
