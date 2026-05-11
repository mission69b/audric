/**
 * SPEC 23A-A4 — bundleStepDetail row sub-text fitter.
 *
 * Demo 5's BundleStepsList renders a one-line sub-text under every row.
 * Pre-A4 audric declared `BundleClusterRow.detail` but `clusterBundleSteps`
 * always returned `detail: undefined`. These assertions lock the per-tool
 * sub-text shapes so future input-shape changes can't silently regress.
 */

import { describe, expect, it } from 'vitest';
import type { PendingActionStep } from '@t2000/engine';

import { bundleStepDetail } from './PermissionCard';

function step(toolName: string, input: Record<string, unknown>): PendingActionStep {
  return {
    toolName,
    toolUseId: `${toolName}-${Math.random().toString(36).slice(2, 8)}`,
    input,
  } as PendingActionStep;
}

describe('bundleStepDetail (SPEC 23A-A4)', () => {
  it('swap_execute: surfaces "Cetus best-route · X% max slippage" when slippage given', () => {
    expect(bundleStepDetail(step('swap_execute', { from: 'USDC', to: 'SUI', amount: 200, maxSlippage: 0.003 }))).toBe(
      'Cetus best-route · 0.30% max slippage',
    );
  });

  it('swap_execute: defaults to "Cetus best-route" when no slippage on input', () => {
    expect(bundleStepDetail(step('swap_execute', { from: 'USDC', to: 'SUI', amount: 200 }))).toBe(
      'Cetus best-route',
    );
  });

  it('save_deposit: surfaces "Into NAVI lending pool · USDC earns variable APY"', () => {
    expect(bundleStepDetail(step('save_deposit', { amount: 50, asset: 'USDC' }))).toBe(
      'Into NAVI lending pool · USDC earns variable APY',
    );
  });

  it('save_deposit: substitutes USDsui when asset overrides default', () => {
    expect(bundleStepDetail(step('save_deposit', { amount: 50, asset: 'USDsui' }))).toBe(
      'Into NAVI lending pool · USDsui earns variable APY',
    );
  });

  it('borrow: includes the asset symbol in the "drawn against collateral" line', () => {
    expect(bundleStepDetail(step('borrow', { amount: 100, asset: 'USDC' }))).toBe(
      'NAVI lending · USDC drawn against collateral',
    );
  });

  it('repay_debt: includes the asset in the debt-reduction line', () => {
    expect(bundleStepDetail(step('repay_debt', { amount: 100, asset: 'USDsui' }))).toBe(
      'Reduces NAVI USDsui debt',
    );
  });

  it('send_transfer: 0x address → "to 0xabcd…ef12"', () => {
    expect(
      bundleStepDetail(
        step('send_transfer', {
          amount: 100,
          asset: 'USDC',
          to: '0xa3f9000000000000000000000000000000000000000000000000000000000b27c',
        }),
      ),
    ).toBe('to 0xa3f9…b27c');
  });

  it('send_transfer: SuiNS name → "to alex.sui" (verbatim)', () => {
    expect(bundleStepDetail(step('send_transfer', { amount: 100, to: 'alex.sui' }))).toBe(
      'to alex.sui',
    );
  });

  it('send_transfer: contact name → "to Mom" (verbatim)', () => {
    expect(bundleStepDetail(step('send_transfer', { amount: 100, to: 'Mom' }))).toBe('to Mom');
  });

  it('send_transfer: undefined when `to` is missing or empty', () => {
    expect(bundleStepDetail(step('send_transfer', { amount: 100 }))).toBeUndefined();
    expect(bundleStepDetail(step('send_transfer', { amount: 100, to: '' }))).toBeUndefined();
  });

  it('volo_stake / volo_unstake: surface their static helper line', () => {
    expect(bundleStepDetail(step('volo_stake', { amount: 5 }))).toBe(
      'Liquid staking · receive vSUI',
    );
    expect(bundleStepDetail(step('volo_unstake', { amount: 5 }))).toBe(
      'Unstake liquid vSUI back to SUI',
    );
  });

  it('claim_rewards / harvest_rewards: surface the right NAVI flow line', () => {
    expect(bundleStepDetail(step('claim_rewards', {}))).toBe('NAVI accrued rewards');
    expect(bundleStepDetail(step('harvest_rewards', {}))).toBe(
      'Claim → swap → re-save (1 PTB)',
    );
  });

  it('pay_api: surfaces the trimmed MPP URL', () => {
    expect(bundleStepDetail(step('pay_api', { url: 'https://mpp.t2000.ai/lob/print', body: {} }))).toBe(
      'lob/print',
    );
  });

  it('returns undefined for tool names with no fitter', () => {
    expect(bundleStepDetail(step('this_tool_does_not_exist', {}))).toBeUndefined();
  });
});
