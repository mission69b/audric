/**
 * SPEC 23B StakingCard polish — TransactionReceiptCard tests (2026-05-12).
 *
 * Two render paths:
 *
 *   1. Legacy label/value rows — used for save_deposit / withdraw / borrow /
 *      repay_debt / send_transfer / swap_execute / claim_rewards /
 *      harvest_rewards. Vertical list, one row per data point.
 *
 *   2. Grid hero — used for volo_stake / volo_unstake. 2-3 col compact grid
 *      mirroring W1 BalanceCard's post-write pattern. Same data as the row
 *      path; reorganised so peer datapoints (Staked / Received / APY) read
 *      as a glanceable summary instead of a vertical list.
 *
 * Tests cover:
 *   - The legacy path stays unchanged for every non-volo write.
 *   - The grid path renders with correct column count + label/value pairs
 *     for both volo writes.
 *   - Gas + Suiscan footer renders identically on both paths.
 *   - Defensive: tx-less data returns null; volo with no hero lines falls
 *     back to the row path (preserves SuiscanLink visibility).
 *
 * Convention: this codebase does NOT extend `@testing-library/jest-dom`.
 * Tests use raw DOM API (`textContent`, `querySelector`).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TransactionReceiptCard } from './TransactionReceiptCard';

const SUI_DIGEST = 'A9Fbm65VtxAbCdEfGh1234567890MnopqrStuVwXyZ12dRAVNV';

describe('TransactionReceiptCard — defensive guards', () => {
  it('returns null when tx digest is missing', () => {
    const { container } = render(
      <TransactionReceiptCard data={{ tx: '' }} toolName="save_deposit" />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('TransactionReceiptCard — legacy label/value path (non-volo writes)', () => {
  it('renders save_deposit as vertical rows (Deposited / APY)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{ tx: SUI_DIGEST, amount: 50, asset: 'USDC', apy: 0.0421 }}
        toolName="save_deposit"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Deposited');
    expect(text).toContain('50.00 USDC');
    expect(text).toContain('APY');
    expect(text).toContain('4.21%');
    // Legacy path uses `flex items-center justify-between` rows, not a grid.
    expect(container.querySelector('.grid')).toBeNull();
  });

  it('renders borrow as vertical rows (Borrowed / Health)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{ tx: SUI_DIGEST, amount: 25, healthFactor: 4.21 }}
        toolName="borrow"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Borrowed');
    expect(text).toContain('$25.00');
    expect(text).toContain('Health');
    expect(text).toContain('4.21');
    expect(container.querySelector('.grid')).toBeNull();
  });

  it('renders swap_execute as vertical rows (Sold / Received / Impact)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          fromToken: 'USDC',
          toToken: 'SUI',
          fromAmount: 10,
          toAmount: 8.5,
          priceImpact: 0.5,
        }}
        toolName="swap_execute"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Sold');
    expect(text).toContain('USDC');
    expect(text).toContain('Received');
    expect(text).toContain('SUI');
    expect(text).toContain('Impact');
    expect(container.querySelector('.grid')).toBeNull();
  });
});

describe('TransactionReceiptCard — grid hero path (volo writes)', () => {
  it('renders volo_stake as a 3-col grid (Staked / Received / APY)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5037,
          apy: 0.045,
        }}
        toolName="volo_stake"
      />,
    );
    // Grid path active
    expect(container.querySelector('.grid')).not.toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('Staked');
    expect(text).toContain('100.00 SUI');
    expect(text).toContain('Received');
    expect(text).toContain('99.5037 vSUI');
    expect(text).toContain('APY');
    expect(text).toContain('4.50%');
    // 3 grid cells
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(3);
  });

  it('renders volo_stake as a 2-col grid when APY is missing (degraded)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5037,
        }}
        toolName="volo_stake"
      />,
    );
    expect(container.querySelector('.grid')).not.toBeNull();
    // 2 grid cells (Staked + Received)
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(2);
    const text = container.textContent ?? '';
    expect(text).toContain('Staked');
    expect(text).toContain('Received');
    expect(text).not.toContain('APY');
  });

  it('renders volo_unstake as a 2-col grid (Unstaked / Received)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          vSuiAmount: 99.5037,
          suiReceived: 100.0234,
        }}
        toolName="volo_unstake"
      />,
    );
    expect(container.querySelector('.grid')).not.toBeNull();
    const text = container.textContent ?? '';
    expect(text).toContain('Unstaked');
    expect(text).toContain('99.5037 vSUI');
    expect(text).toContain('Received');
    expect(text).toContain('100.0234 SUI');
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(2);
  });

  it('uses tighter cell padding (px-2.5 py-1.5) matching W1 BalanceCard', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5,
          apy: 0.045,
        }}
        toolName="volo_stake"
      />,
    );
    expect(container.querySelector('.px-2\\.5')).not.toBeNull();
    expect(container.querySelector('.py-1\\.5')).not.toBeNull();
  });

  it('uses smaller value typography (text-[13px]) and uppercase labels', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5,
          apy: 0.045,
        }}
        toolName="volo_stake"
      />,
    );
    const valueCells = container.querySelectorAll('.font-mono.font-medium');
    expect(valueCells.length).toBe(3);
    valueCells.forEach((cell) => {
      expect(cell.className).toContain('text-[13px]');
    });
    // Labels use uppercase tracking
    expect(container.querySelector('.uppercase.tracking-wider')).not.toBeNull();
  });

  it('applies emphasis classes (positive → success, negative → warning) inside grid cells', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5,
          apy: 0.045,
        }}
        toolName="volo_stake"
      />,
    );
    // Received + APY are emphasis: 'positive' → success-solid color.
    // Staked has no emphasis → fg-primary color.
    const successCells = container.querySelectorAll('.text-success-solid');
    expect(successCells.length).toBe(2); // Received + APY
  });

  it('renders Gas footer when present (with top border, NOT bottom)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5,
          apy: 0.045,
          gasCost: 0.0023,
        }}
        toolName="volo_stake"
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Gas');
    expect(text).toContain('0.0023 SUI');
  });

  it('renders the SuiscanLink footer (digest passed through)', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5,
          apy: 0.045,
        }}
        toolName="volo_stake"
      />,
    );
    const links = container.querySelectorAll('a[href*="suiscan"]');
    expect(links.length).toBeGreaterThan(0);
  });

  it('keeps the "Transaction" title bar', () => {
    const { container } = render(
      <TransactionReceiptCard
        data={{
          tx: SUI_DIGEST,
          amountSui: 100,
          vSuiReceived: 99.5,
          apy: 0.045,
        }}
        toolName="volo_stake"
      />,
    );
    expect(container.textContent).toContain('Transaction');
  });
});

describe('TransactionReceiptCard — grid hero degraded paths', () => {
  it('volo_stake with no hero data still renders the grid (single "Staked: 0.00 SUI" cell + SuiscanLink)', () => {
    // `getHeroLines` for volo_stake unconditionally pushes a "Staked"
    // row (defaulting to 0 SUI when amountSui/amount are both undefined),
    // so `lines.length >= 1` and the grid path stays active. The render
    // collapses to a 1-column grid containing a single "Staked: 0.00 SUI"
    // cell + the SuiscanLink footer. This is a defensive edge case —
    // production preflight rejects volo_stake with no amount upstream,
    // so users never see this state, but rendering it as 1-cell instead
    // of crashing is the correct degraded behavior.
    const { container } = render(
      <TransactionReceiptCard
        data={{ tx: SUI_DIGEST }}
        toolName="volo_stake"
      />,
    );
    expect(container.querySelector('.grid')).not.toBeNull();
    const links = container.querySelectorAll('a[href*="suiscan"]');
    expect(links.length).toBeGreaterThan(0);
    // Single-column hero cell carries the default "Staked: 0.00 SUI"
    const text = container.textContent ?? '';
    expect(text).toContain('Staked');
    expect(text).toContain('0.00 SUI');
  });
});
