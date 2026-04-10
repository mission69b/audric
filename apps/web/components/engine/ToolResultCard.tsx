'use client';

import type { ToolExecution } from '@/lib/engine-types';
import { extractData } from './cards/primitives';
import { RatesCard } from './cards/RatesCard';
import { BalanceCard } from './cards/BalanceCard';
import { SavingsCard } from './cards/SavingsCard';
import { YieldCard } from './cards/YieldCard';
import { PortfolioCard } from './cards/PortfolioCard';
import { ExplainTxCard } from './cards/ExplainTxCard';
import { TransactionReceiptCard } from './cards/TransactionReceiptCard';
import { HealthCard } from './cards/HealthCard';
import { TransactionHistoryCard } from './cards/TransactionHistoryCard';
import { SwapQuoteCard } from './cards/SwapQuoteCard';
import { AllowanceCard } from './cards/AllowanceCard';
import { PaymentLinkCard } from './cards/PaymentLinkCard';
import { InvoiceCard } from './cards/InvoiceCard';

const WRITE_TOOL_NAMES = new Set([
  'save_deposit', 'withdraw', 'send_transfer', 'swap_execute',
  'volo_stake', 'volo_unstake', 'borrow', 'repay_debt', 'claim_rewards', 'pay_api',
]);

const CARD_RENDERERS: Record<string, (result: unknown) => React.ReactNode | null> = {
  rates_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <RatesCard data={data as Record<string, { saveApy: number; borrowApy: number }>} />;
  },
  balance_check: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <BalanceCard data={data as Parameters<typeof BalanceCard>[0]['data']} />;
  },
  savings_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SavingsCard data={data as Parameters<typeof SavingsCard>[0]['data']} />;
  },
  defillama_yield_pools: (result) => {
    const data = extractData(result);
    if (!Array.isArray(data)) return null;
    return <YieldCard data={data as Parameters<typeof YieldCard>[0]['data']} />;
  },
  portfolio_analysis: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <PortfolioCard data={data as Parameters<typeof PortfolioCard>[0]['data']} />;
  },
  explain_tx: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ExplainTxCard data={data as Parameters<typeof ExplainTxCard>[0]['data']} />;
  },
  health_check: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <HealthCard data={data as Parameters<typeof HealthCard>[0]['data']} />;
  },
  transaction_history: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <TransactionHistoryCard data={data as Parameters<typeof TransactionHistoryCard>[0]['data']} />;
  },
  swap_quote: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SwapQuoteCard data={data as Parameters<typeof SwapQuoteCard>[0]['data']} />;
  },
  allowance_status: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <AllowanceCard data={data as Parameters<typeof AllowanceCard>[0]['data']} />;
  },
  create_payment_link: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <PaymentLinkCard data={data} />;
  },
  list_payment_links: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <PaymentLinkCard data={data} />;
  },
  create_invoice: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <InvoiceCard data={data} />;
  },
  list_invoices: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <InvoiceCard data={data} />;
  },
};

export function ToolResultCard({ tool }: { tool: ToolExecution }) {
  if (tool.status !== 'done' || !tool.result || tool.isError) return null;

  const renderer = CARD_RENDERERS[tool.toolName];
  if (renderer) {
    try {
      return <>{renderer(tool.result)}</>;
    } catch {
      return null;
    }
  }

  if (WRITE_TOOL_NAMES.has(tool.toolName)) {
    try {
      const data = extractData(tool.result);
      if (data && typeof data === 'object' && 'tx' in data) {
        return <TransactionReceiptCard data={data as Parameters<typeof TransactionReceiptCard>[0]['data']} toolName={tool.toolName} />;
      }
    } catch {
      return null;
    }
  }

  return null;
}
