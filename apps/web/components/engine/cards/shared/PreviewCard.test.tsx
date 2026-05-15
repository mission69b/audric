/**
 * Day 9 (a) — PreviewCard unit tests.
 *
 * 4 stories from TOOL_UX_DESIGN_v07a.md Day 9 spec, one per write tool:
 *   - save_deposit  preview (asset row + APY block, no HF)
 *   - withdraw      preview (asset row + APY block + optional HF projection)
 *   - borrow        preview (asset row + HF projection always shown)
 *   - repay_debt    preview (asset row + HF projection — improving)
 *
 * Plus interaction tests: confirm/cancel handlers fire, busy state disables.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PreviewCard } from './PreviewCard';
import { AssetAmountBlock } from './AssetAmountBlock';

describe('PreviewCard — save_deposit story', () => {
  it('renders heading + body + confirm label without HF gauge', () => {
    const { container } = render(
      <PreviewCard
        heading="Save"
        body={
          <AssetAmountBlock
            asset="USDC"
            amount={50}
            usdValue={50}
            label="Deposit"
          />
        }
        confirmLabel="Confirm save"
        onConfirm={() => {}}
        feeBreakdown={{ label: '0.1% NAVI overlay', usdValue: 0.05 }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Save');
    expect(text).toContain('Deposit');
    expect(text).toContain('USDC');
    expect(text).toContain('$50.00');
    expect(text).toContain('Confirm save');
    expect(text).toContain('0.1% NAVI overlay');
    expect(text).toContain('$0.05');
    expect(text).not.toContain('Health factor');
  });
});

describe('PreviewCard — withdraw story (with HF projection)', () => {
  it('renders HF gauge with projection arrow when healthFactorImpact passed', () => {
    const { container } = render(
      <PreviewCard
        heading="Withdraw"
        body={
          <AssetAmountBlock
            asset="USDC"
            amount={20}
            usdValue={20}
            label="Withdraw"
          />
        }
        confirmLabel="Confirm withdraw"
        healthFactorImpact={{
          current: 2.10,
          projected: 1.65,
          liquidationThreshold: 1.0,
          label: 'after withdraw',
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Health factor');
    expect(text).toContain('2.10');
    expect(text).toContain('after withdraw');
    expect(text).toContain('↓');
    expect(text).toContain('1.65');
  });
});

describe('PreviewCard — borrow story', () => {
  it('renders heading + amount + projected HF down (red if <1.5)', () => {
    const { container } = render(
      <PreviewCard
        heading="Borrow"
        body={
          <AssetAmountBlock
            asset="USDC"
            amount={100}
            usdValue={100}
            label="Borrow"
          />
        }
        confirmLabel="Confirm borrow"
        onConfirm={() => {}}
        healthFactorImpact={{
          current: 2.50,
          projected: 1.30,
          liquidationThreshold: 1.0,
          label: 'after borrow',
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Borrow');
    expect(text).toContain('Confirm borrow');
    expect(text).toContain('after borrow');
    const projectionRow = container.querySelector('.text-warning-solid');
    expect(projectionRow).not.toBeNull();
  });
});

describe('PreviewCard — repay_debt story (HF improving)', () => {
  it('renders ↑ arrow when projected HF improves', () => {
    const { container } = render(
      <PreviewCard
        heading="Repay debt"
        body={
          <AssetAmountBlock
            asset="USDC"
            amount={50}
            usdValue={50}
            label="Repay"
          />
        }
        confirmLabel="Confirm repay"
        healthFactorImpact={{
          current: 1.20,
          projected: 1.85,
          liquidationThreshold: 1.0,
          label: 'after repay',
        }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Repay');
    expect(text).toContain('after repay');
    expect(text).toContain('↑');
    const successRow = container.querySelector('.text-success-solid');
    expect(successRow).not.toBeNull();
  });
});

describe('PreviewCard — interactions', () => {
  it('fires onConfirm when confirm button clicked', () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <PreviewCard
        heading="Save"
        body={<div>body</div>}
        confirmLabel="Confirm save"
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(getByText('Confirm save'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires onCancel when cancel button clicked', () => {
    const onCancel = vi.fn();
    const { getByText } = render(
      <PreviewCard
        heading="Save"
        body={<div>body</div>}
        confirmLabel="Confirm save"
        onCancel={onCancel}
      />,
    );
    fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables both buttons when busy', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText } = render(
      <PreviewCard
        heading="Save"
        body={<div>body</div>}
        confirmLabel="Confirm save"
        onConfirm={onConfirm}
        onCancel={onCancel}
        busy
      />,
    );
    const confirmBtn = getByText('Confirming…') as HTMLButtonElement;
    const cancelBtn = getByText('Cancel') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);
    expect(cancelBtn.disabled).toBe(true);
    fireEvent.click(confirmBtn);
    fireEvent.click(cancelBtn);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('omits the cancel button when onCancel is not provided', () => {
    const { container } = render(
      <PreviewCard
        heading="Save"
        body={<div>body</div>}
        confirmLabel="Confirm save"
        onConfirm={() => {}}
      />,
    );
    expect(container.textContent).not.toContain('Cancel');
  });

  it('omits the confirm button when onConfirm is not provided', () => {
    const { container } = render(
      <PreviewCard
        heading="Save"
        body={<div>body</div>}
        confirmLabel="Confirm save"
        onCancel={() => {}}
      />,
    );
    expect(container.textContent).not.toContain('Confirm save');
  });
});
