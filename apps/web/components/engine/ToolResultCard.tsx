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
import { PaymentLinkCard } from './cards/PaymentLinkCard';
import { InvoiceCard } from './cards/InvoiceCard';
import { ServiceCatalogCard } from './cards/ServiceCatalogCard';
import { SearchResultsCard } from './cards/SearchResultsCard';
import { YieldEarningsCard } from './cards/YieldEarningsCard';
import { ActivitySummaryCard } from './cards/ActivitySummaryCard';
import { StakingCard } from './cards/StakingCard';
import { ProtocolCard } from './cards/ProtocolCard';
import { PriceCard } from './cards/PriceCard';

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
  mpp_services: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ServiceCatalogCard data={data as Parameters<typeof ServiceCatalogCard>[0]['data']} />;
  },
  web_search: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SearchResultsCard data={data as Parameters<typeof SearchResultsCard>[0]['data']} />;
  },
  yield_summary: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <YieldEarningsCard data={data as Parameters<typeof YieldEarningsCard>[0]['data']} />;
  },
  activity_summary: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ActivitySummaryCard data={data as Parameters<typeof ActivitySummaryCard>[0]['data']} />;
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
  volo_stats: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <StakingCard data={data as Parameters<typeof StakingCard>[0]['data']} />;
  },
  protocol_deep_dive: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ProtocolCard data={data as Parameters<typeof ProtocolCard>[0]['data']} />;
  },
  defillama_token_prices: (result) => {
    const data = extractData(result);
    if (!Array.isArray(data)) return null;
    return <PriceCard data={data as Parameters<typeof PriceCard>[0]['data']} />;
  },
  defillama_price_change: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <PriceCard data={data as Parameters<typeof PriceCard>[0]['data']} />;
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
