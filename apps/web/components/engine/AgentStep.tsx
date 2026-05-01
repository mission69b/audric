'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

export type StepStatus = 'pending' | 'running' | 'done' | 'error';

interface AgentStepProps {
  icon?: string;
  label: string;
  status: StepStatus;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  children?: React.ReactNode;
  /**
   * [SPEC 8 v0.5.1 B3.2] Optional dimmed metadata that renders to the
   * right of the label as `LABEL · meta`. Used by `ToolBlockView` to
   * surface "attempt N · 1.4s" when a tool went through HTTP retries.
   * Undefined (the common case) renders no extra text.
   */
  meta?: string;
}

const STEP_ICONS: Record<string, string> = {
  balance_check: '💰',
  savings_info: '📊',
  health_check: '🛡️',
  rates_info: '📈',
  transaction_history: '📋',
  save_deposit: '🏦',
  withdraw: '📤',
  send_transfer: '🔄',
  borrow: '💳',
  repay_debt: '✅',
  claim_rewards: '🎁',
  pay_api: '⚡',
  swap_execute: '🔄',
  volo_stake: '🥩',
  volo_unstake: '🥩',
  volo_stats: '📊',
  mpp_services: '🔍',
  token_prices: '💲',
  web_search: '🔍',
  explain_tx: '🔎',
  portfolio_analysis: '📊',
  protocol_deep_dive: '🛡️',
  save_contact: '📇',
  render_canvas: '🖼️',
  create_payment_link: '🔗',
  list_payment_links: '🔗',
  cancel_payment_link: '🔗',
  create_invoice: '📄',
  list_invoices: '📄',
  cancel_invoice: '📄',
  spending_analytics: '💸',
  swap_quote: '🔄',
  yield_summary: '📈',
  activity_summary: '📋',
  record_advice: '📝',
  resolve_suins: '🪪',
  update_todo: '🗒️',
};

const STEP_LABELS: Record<string, string> = {
  balance_check: 'BALANCE CHECK',
  savings_info: 'SAVINGS INFO',
  health_check: 'HEALTH CHECK',
  rates_info: 'RATES INFO',
  transaction_history: 'TRANSACTION HISTORY',
  save_deposit: 'DEPOSIT',
  withdraw: 'WITHDRAW',
  send_transfer: 'SEND TRANSFER',
  borrow: 'BORROW',
  repay_debt: 'REPAY',
  claim_rewards: 'CLAIM REWARDS',
  pay_api: 'API CALL',
  swap_execute: 'SWAP',
  volo_stake: 'STAKE SUI',
  volo_unstake: 'UNSTAKE VSUI',
  volo_stats: 'VOLO STATS',
  mpp_services: 'DISCOVER SERVICES',
  token_prices: 'TOKEN PRICES',
  web_search: 'WEB SEARCH',
  explain_tx: 'EXPLAIN TRANSACTION',
  portfolio_analysis: 'PORTFOLIO ANALYSIS',
  protocol_deep_dive: 'PROTOCOL DEEP DIVE',
  save_contact: 'SAVE CONTACT',
  render_canvas: 'DRAW CANVAS',
  create_payment_link: 'CREATE PAYMENT LINK',
  list_payment_links: 'LIST PAYMENT LINKS',
  cancel_payment_link: 'CANCEL PAYMENT LINK',
  create_invoice: 'CREATE INVOICE',
  list_invoices: 'LIST INVOICES',
  cancel_invoice: 'CANCEL INVOICE',
  spending_analytics: 'SPENDING ANALYTICS',
  swap_quote: 'SWAP QUOTE',
  yield_summary: 'YIELD SUMMARY',
  activity_summary: 'ACTIVITY SUMMARY',
  record_advice: 'RECORD ADVICE',
  resolve_suins: 'RESOLVE SUINS',
  update_todo: 'UPDATING PLAN',
};

export function getStepIcon(toolName: string): string {
  return STEP_ICONS[toolName] ?? '⚙️';
}

export function getStepLabel(toolName: string): string {
  return STEP_LABELS[toolName] ?? toolName.replace(/_/g, ' ').toUpperCase();
}

function StatusDot({ status }: { status: StepStatus }) {
  switch (status) {
    case 'pending':
      return <span className="w-4 h-4 rounded-full border border-border-strong shrink-0" aria-hidden="true" />;
    case 'running':
      return (
        <span className="w-4 h-4 rounded-full border-2 border-fg-primary border-t-transparent shrink-0 animate-spin" aria-hidden="true" />
      );
    case 'done':
      return (
        <span className="w-4 h-4 rounded-full bg-success-solid shrink-0 flex items-center justify-center" aria-hidden="true">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case 'error':
      return <span className="w-4 h-4 rounded-full bg-error-solid shrink-0" aria-hidden="true" />;
  }
}

export function AgentStep({
  icon,
  label,
  status,
  collapsible = false,
  defaultExpanded = true,
  children,
  meta,
}: AgentStepProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const content = (
    <div className="flex items-center gap-2 py-1">
      <StatusDot status={status} />
      {icon && <span className="text-sm leading-none shrink-0">{icon}</span>}
      <span className={`font-mono text-[10px] tracking-[0.1em] uppercase ${status === 'done' || status === 'error' ? 'text-fg-secondary' : 'text-fg-primary'}`}>
        {label}
      </span>
      {meta && (
        <span className="font-mono text-[10px] tracking-[0.05em] uppercase text-fg-muted">
          · {meta}
        </span>
      )}
      {collapsible && (
        <span
          className={`inline-flex text-fg-muted transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          <Icon name="chevron-down" size={10} />
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-0.5" role="status" aria-label={`${label}: ${status}`}>
      {collapsible ? (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center hover:opacity-70 transition-opacity"
          aria-expanded={expanded}
        >
          {content}
        </button>
      ) : (
        content
      )}
      {children && expanded && (
        <div className="ml-[5px] pl-4 border-l border-border-subtle">
          {children}
        </div>
      )}
    </div>
  );
}
