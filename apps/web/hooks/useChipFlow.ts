'use client';

import { useCallback, useState } from 'react';

export type ChipFlowPhase =
  | 'idle'
  | 'l2-chips'
  | 'confirming'
  | 'executing'
  | 'result';

export interface SwapQuote {
  toAmount: number;
  priceImpact: number;
  rate: string;
}

export interface ChipFlowState {
  phase: ChipFlowPhase;
  flow: string | null;
  subFlow: string | null;
  amount: number | null;
  recipient: string | null;
  asset: string | null;
  toAsset: string | null;
  protocol: string | null;
  message: string | null;
  result: ChipFlowResult | null;
  error: string | null;
  quote: SwapQuote | null;
}

export interface ChipFlowResult {
  success: boolean;
  title: string;
  details: string;
  txUrl?: string;
}

export interface ConfirmationData {
  title: string;
  details: { label: string; value: string }[];
}

const INITIAL_STATE: ChipFlowState = {
  phase: 'idle',
  flow: null,
  subFlow: null,
  amount: null,
  recipient: null,
  asset: null,
  toAsset: null,
  protocol: null,
  message: null,
  result: null,
  error: null,
  quote: null,
};

export interface FlowContext {
  cash?: number;
  usdc?: number;
  /**
   * [CHIP_REVIEW_2 F-2 / 2026-05-07] USDsui wallet balance — drives the
   * Save/Send asset picker's auto-skip path. When `usdc > 0 && usdsui > 0`
   * the L1.5 picker renders; when only one is non-zero the picker
   * silently auto-defaults so USDC-only wallets see no extra step.
   */
  usdsui?: number;
  savings?: number;
  borrows?: number;
  savingsRate?: number;
  bestRate?: number;
  maxBorrow?: number;
  protocol?: string;
  asset?: string;
}

export function useChipFlow() {
  const [state, setState] = useState<ChipFlowState>(INITIAL_STATE);

  const startFlow = useCallback((flow: string, context?: FlowContext) => {
    setState({
      ...INITIAL_STATE,
      phase: 'l2-chips',
      flow,
      protocol: context?.protocol ?? null,
      asset: context?.asset ?? null,
      message: getFlowMessage(flow, context),
    });
  }, []);

  const selectAmount = useCallback((amount: number) => {
    setState((prev) => ({ ...prev, amount, phase: 'confirming' }));
  }, []);

  /**
   * [CHIP_REVIEW_2 F-1/F-2/F-3 / 2026-05-07] Select an asset for save / send
   * / borrow / repay. The asset picker is L1.5 — we stay in `l2-chips`
   * phase but populate `state.asset`, which advances the dashboard's render
   * logic to the amount picker. A separate setter from `selectFromAsset`
   * (which is swap-specific and also writes `toAsset`) so the call sites
   * are unambiguous about which flow they're in.
   *
   * USDsui-aware message (save case): when the user picks a non-USDC
   * stable, the amount picker should advertise the right symbol so the
   * "$X available" text doesn't lie.
   */
  const selectAsset = useCallback((asset: string) => {
    setState((prev) => {
      let nextMessage = prev.message;
      if (prev.flow === 'save') {
        nextMessage = `Save ${asset} to earn interest.\nChoose an amount:`;
      } else if (prev.flow === 'send') {
        nextMessage = prev.subFlow ? `How much ${asset} to ${prev.subFlow}?` : `How much ${asset} to send?`;
      } else if (prev.flow === 'borrow') {
        nextMessage = `Borrow ${asset} against your savings.\nChoose an amount:`;
      } else if (prev.flow === 'repay') {
        nextMessage = `Repay your ${asset} debt.\nChoose an amount:`;
      }
      return { ...prev, asset, message: nextMessage };
    });
  }, []);

  /**
   * [CHIP_REVIEW_2 F-1/F-2/F-3] Step back from the amount picker to the
   * asset picker. Mirrors `clearToAsset` for swap. Without this, picking
   * the wrong asset (e.g. USDsui when you meant USDC) forced a full
   * Cancel → re-start. Now the user can step back without losing their
   * recipient (in the send case) or their flow context.
   */
  const clearAsset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      asset: null,
      amount: null,
      message: prev.flow === 'send'
        ? `What asset do you want to send${prev.subFlow ? ` to ${prev.subFlow}` : ''}?`
        : prev.flow === 'save'
          ? 'Which stable do you want to save?'
          : prev.flow === 'borrow'
            ? 'Which stable do you want to borrow?'
            : prev.flow === 'repay'
              ? 'Which debt do you want to repay?'
              : 'Pick an asset:',
    }));
  }, []);

  const selectRecipient = useCallback((recipient: string, label?: string, cash?: number) => {
    const available = cash !== undefined ? `$${Math.floor(cash)} available` : 'wallet balance';
    setState((prev) => ({
      ...prev,
      recipient,
      subFlow: label ?? recipient,
      message: `How much to ${label ?? truncate(recipient)}?\n${available}`,
    }));
  }, []);

  // [B1 polish F3] Step back from "send → amount" to "send → recipient".
  // Mirrors `clearToAsset` for swap. Without this, a typo on the recipient
  // (e.g. picked the wrong @username) forced a full Cancel → re-Send →
  // re-pick from scratch. Now: tap "Change recipient" and only the
  // recipient + amount + subFlow reset; the flow stays in `send` so the
  // user lands back on the recipient picker, not at idle.
  const clearRecipient = useCallback(() => {
    setState((prev) => ({
      ...prev,
      recipient: null,
      amount: null,
      subFlow: null,
      message: 'Who do you want to send to?',
    }));
  }, []);

  const selectFromAsset = useCallback((asset: string, autoTarget?: string) => {
    setState((prev) => ({
      ...prev,
      asset,
      toAsset: autoTarget ?? null,
      message: autoTarget
        ? `How much ${asset} to swap for ${autoTarget}?`
        : `What do you want to swap ${asset} for?`,
    }));
  }, []);

  const selectToAsset = useCallback((toAsset: string) => {
    setState((prev) => ({
      ...prev,
      toAsset,
      message: `How much ${prev.asset} to swap for ${toAsset}?`,
    }));
  }, []);

  const setQuote = useCallback((quote: SwapQuote) => {
    setState((prev) => ({ ...prev, quote }));
  }, []);

  const clearToAsset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      toAsset: null,
      message: `What do you want to swap ${prev.asset} for?`,
    }));
  }, []);

  const confirm = useCallback(() => {
    setState((prev) => ({ ...prev, phase: 'executing' }));
  }, []);

  const setResult = useCallback((result: ChipFlowResult) => {
    setState((prev) => ({ ...prev, phase: 'result', result, error: null }));
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => ({
      ...prev,
      phase: 'result',
      error,
      result: { success: false, title: 'Transaction failed', details: error },
    }));
  }, []);

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    state,
    startFlow,
    selectAmount,
    selectAsset,
    clearAsset,
    selectRecipient,
    clearRecipient,
    selectFromAsset,
    selectToAsset,
    setQuote,
    clearToAsset,
    confirm,
    setResult,
    setError,
    reset,
  };
}

function truncate(s: string): string {
  return s.length > 12 ? `${s.slice(0, 6)}...${s.slice(-4)}` : s;
}

function fmtAmount(n: number): string {
  if (n === 0) return '$0';
  if (n < 1) return `$${n.toFixed(2)}`;
  return `$${Math.floor(n)}`;
}

function getFlowMessage(flow: string, ctx?: FlowContext): string {
  switch (flow) {
    case 'save': {
      const rate = ctx?.bestRate && ctx.bestRate > 0.005
        ? ctx.bestRate
        : ctx?.savingsRate && ctx.savingsRate > 0.005
          ? ctx.savingsRate
          : null;
      const rateStr = rate ? ` ${(rate * 100).toFixed(1)}%` : '';
      // [CHIP_REVIEW_2 F-2 / 2026-05-07] When the user holds BOTH USDC and
      // USDsui, the dashboard renders an L1.5 picker (this `getFlowMessage`
      // text gets replaced by `selectAsset`'s asset-specific message once
      // they choose). For USDC-only / USDsui-only wallets, the picker
      // auto-skips and we go straight to the amount step — show the
      // appropriate "available" hint up front so the message isn't blank.
      const usdc = ctx?.usdc ?? 0;
      const usdsui = ctx?.usdsui ?? 0;
      if (usdc > 0 && usdsui > 0) {
        return `Save to earn${rateStr}.\nWhich stable do you want to save?`;
      }
      const saveableAmt = usdc > 0 ? usdc : usdsui;
      const saveableSym = usdc > 0 ? 'USDC' : usdsui > 0 ? 'USDsui' : 'USDC';
      const fallback = ctx?.cash;
      const displayAmt = saveableAmt > 0 ? saveableAmt : (fallback ?? 0);
      const avail = displayAmt > 0 ? ` You have ${fmtAmount(displayAmt)} ${saveableSym} available.` : '';
      return `Save to earn${rateStr}.${avail}\nChoose an amount:`;
    }
    case 'send': return 'Who do you want to send to?';
    case 'withdraw': {
      const saved = ctx?.savings ? ` You have ${fmtAmount(ctx.savings)} saved.` : '';
      return `Withdraw from savings.${saved}\nChoose an amount:`;
    }
    case 'borrow': {
      // [CHIP_REVIEW_2 F-3 / 2026-05-07] Borrow chip ALWAYS routes through
      // the asset picker (USDC vs USDsui) — both are saveable per v0.51,
      // and the choice carries an interest-rate consequence the user
      // should make explicitly. The L1.5 picker overrides this message
      // immediately, so the wording here is short.
      return 'Which stable do you want to borrow?';
    }
    case 'repay': {
      const debt = ctx?.borrows ? ` Outstanding debt: ${fmtAmount(ctx.borrows)}.` : '';
      // [CHIP_REVIEW_2 F-3 / 2026-05-07] Repay routes through the picker
      // when the user has BOTH USDC and USDsui debts (the dashboard
      // computes eligibility from `borrowsBreakdown`). With one debt
      // currency, the picker auto-skips and the amount step shows.
      return `Repay your loan.${debt}\nWhich debt do you want to repay?`;
    }
    case 'swap':
      return 'What do you want to swap?\nSelect an asset:';
    default: return 'Choose an option:';
  }
}
