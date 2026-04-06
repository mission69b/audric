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

  const selectRecipient = useCallback((recipient: string, label?: string, cash?: number) => {
    const available = cash !== undefined ? `$${Math.floor(cash)} available` : 'cash balance';
    setState((prev) => ({
      ...prev,
      recipient,
      subFlow: label ?? recipient,
      message: `How much to ${label ?? truncate(recipient)}?\n${available}`,
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
    selectRecipient,
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
      const avail = ctx?.cash ? ` You have ${fmtAmount(ctx.cash)} available.` : '';
      return `Save to earn${rateStr}.${avail}\nChoose an amount:`;
    }
    case 'send': return 'Who do you want to send to?';
    case 'withdraw': {
      const saved = ctx?.savings ? ` You have ${fmtAmount(ctx.savings)} saved.` : '';
      return `Withdraw from savings.${saved}\nChoose an amount:`;
    }
    case 'borrow': {
      const max = ctx?.maxBorrow ? ` You can borrow up to ${fmtAmount(ctx.maxBorrow)}.` : '';
      return `Borrow against your savings.${max}\nChoose an amount:`;
    }
    case 'repay': {
      const debt = ctx?.borrows ? ` Outstanding debt: ${fmtAmount(ctx.borrows)}.` : '';
      return `Repay your loan.${debt}\nChoose an amount:`;
    }
    case 'swap':
      return 'What do you want to swap?\nSelect an asset:';
    default: return 'Choose an option:';
  }
}
