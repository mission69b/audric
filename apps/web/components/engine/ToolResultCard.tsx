'use client';

import type { ToolExecution } from '@/lib/engine-types';

interface RateEntry {
  saveApy: number;
  borrowApy: number;
  ltv?: number;
  price?: number;
}

interface BalanceData {
  available?: number;
  savings?: number;
  debt?: number;
  total?: number;
  holdings?: { symbol: string; balance: number; usdValue: number }[];
}

interface SavingsPosition {
  symbol: string;
  amount: number;
  valueUsd: number;
  apy: number;
  type: 'supply' | 'borrow';
  protocol?: string;
}

interface SavingsData {
  positions?: SavingsPosition[];
  earnings?: { currentApy: number; dailyEarning: number; supplied: number };
}

interface YieldPool {
  pool: string;
  protocol: string;
  apy: number;
  tvl: number;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(2);
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface/50 overflow-hidden my-1.5">
      <div className="px-3 py-1.5 border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-widest text-dim">{title}</span>
      </div>
      <div className="px-3 py-2 text-xs">{children}</div>
    </div>
  );
}

function RatesCard({ data }: { data: Record<string, RateEntry> }) {
  const entries = Object.entries(data)
    .filter(([, v]) => v && typeof v.saveApy === 'number')
    .sort(([, a], [, b]) => b.saveApy - a.saveApy)
    .slice(0, 8);

  if (!entries.length) return null;

  return (
    <CardShell title="Lending Rates">
      <table className="w-full">
        <thead>
          <tr className="text-dim text-[10px]">
            <th className="text-left font-medium pb-1">Asset</th>
            <th className="text-right font-medium pb-1">Supply</th>
            <th className="text-right font-medium pb-1">Borrow</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {entries.map(([symbol, rate]) => (
            <tr key={symbol} className="border-t border-border/50">
              <td className="py-1 text-foreground font-medium">{symbol}</td>
              <td className="py-1 text-right text-emerald-400">{fmtPct(rate.saveApy)}%</td>
              <td className="py-1 text-right text-amber-400">{fmtPct(rate.borrowApy)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
}

function BalanceCard({ data }: { data: BalanceData }) {
  return (
    <CardShell title="Balance">
      <div className="flex gap-4 mb-2 font-mono">
        {data.total != null && (
          <div>
            <span className="text-dim text-[10px] block">Total</span>
            <span className="text-foreground font-medium">${fmtUsd(data.total)}</span>
          </div>
        )}
        {data.available != null && (
          <div>
            <span className="text-dim text-[10px] block">Cash</span>
            <span className="text-foreground">${fmtUsd(data.available)}</span>
          </div>
        )}
        {(data.savings ?? 0) > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Savings</span>
            <span className="text-emerald-400">${fmtUsd(data.savings!)}</span>
          </div>
        )}
        {(data.debt ?? 0) > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Debt</span>
            <span className="text-amber-400">${fmtUsd(data.debt!)}</span>
          </div>
        )}
      </div>
      {data.holdings && data.holdings.length > 0 && (
        <div className="space-y-0.5 font-mono text-[11px]">
          {data.holdings.slice(0, 6).map((h) => (
            <div key={h.symbol} className="flex justify-between">
              <span className="text-foreground">{h.symbol}</span>
              <span className="text-dim">
                {h.balance.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                {h.usdValue > 0 ? ` · $${fmtUsd(h.usdValue)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

function SavingsCard({ data }: { data: SavingsData }) {
  const supplies = data.positions?.filter((p) => p.type === 'supply') ?? [];
  const borrows = data.positions?.filter((p) => p.type === 'borrow') ?? [];

  if (!supplies.length && !borrows.length) return null;

  return (
    <CardShell title="Savings Positions">
      {supplies.length > 0 && (
        <table className="w-full mb-1">
          <thead>
            <tr className="text-dim text-[10px]">
              <th className="text-left font-medium pb-1">Supply</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {supplies.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-dim">
                  {p.amount.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                  {p.valueUsd > 0 ? ` · $${fmtUsd(p.valueUsd)}` : ''}
                </td>
                <td className="py-1 text-right text-emerald-400">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {borrows.length > 0 && (
        <table className="w-full">
          <thead>
            <tr className="text-dim text-[10px]">
              <th className="text-left font-medium pb-1">Borrow</th>
              <th className="text-right font-medium pb-1">Amount</th>
              <th className="text-right font-medium pb-1">APY</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {borrows.map((p, i) => (
              <tr key={i} className="border-t border-border/50">
                <td className="py-1 text-foreground font-medium">{p.symbol}</td>
                <td className="py-1 text-right text-dim">${fmtUsd(p.valueUsd)}</td>
                <td className="py-1 text-right text-amber-400">{(p.apy * 100).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.earnings && (
        <div className="flex gap-4 mt-2 pt-2 border-t border-border/50 font-mono text-[11px]">
          <div>
            <span className="text-dim block text-[10px]">Blended APY</span>
            <span className="text-emerald-400">{(data.earnings.currentApy * 100).toFixed(2)}%</span>
          </div>
          <div>
            <span className="text-dim block text-[10px]">Daily</span>
            <span className="text-foreground">${data.earnings.dailyEarning.toFixed(4)}</span>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function fmtTvl(tvl: number): string {
  if (tvl >= 1e9) return `$${(tvl / 1e9).toFixed(1)}B`;
  if (tvl >= 1e6) return `$${(tvl / 1e6).toFixed(1)}M`;
  if (tvl >= 1e3) return `$${(tvl / 1e3).toFixed(0)}K`;
  return `$${tvl.toFixed(0)}`;
}

function YieldCard({ data }: { data: YieldPool[] }) {
  const pools = data.slice(0, 8);
  if (!pools.length) return null;

  return (
    <CardShell title="Top Yields">
      <table className="w-full">
        <thead>
          <tr className="text-dim text-[10px]">
            <th className="text-left font-medium pb-1">Pool</th>
            <th className="text-left font-medium pb-1">Protocol</th>
            <th className="text-right font-medium pb-1">APY</th>
            <th className="text-right font-medium pb-1">TVL</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {pools.map((p, i) => (
            <tr key={i} className="border-t border-border/50">
              <td className="py-1 text-foreground font-medium truncate max-w-[100px]">{p.pool}</td>
              <td className="py-1 text-dim">{p.protocol}</td>
              <td className="py-1 text-right text-emerald-400">{p.apy.toFixed(2)}%</td>
              <td className="py-1 text-right text-dim">{fmtTvl(p.tvl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
}

interface PortfolioData {
  totalValue: number;
  walletValue: number;
  savingsValue: number;
  debtValue: number;
  healthFactor: number | null;
  allocations: { symbol: string; amount: number; usdValue: number; percentage: number }[];
  stablePercentage: number;
  insights: { type: string; message: string }[];
}

function PortfolioCard({ data }: { data: PortfolioData }) {
  return (
    <CardShell title="Portfolio Analysis">
      <div className="flex gap-4 mb-2 font-mono">
        <div>
          <span className="text-dim text-[10px] block">Total</span>
          <span className="text-foreground font-medium">${fmtUsd(data.totalValue)}</span>
        </div>
        <div>
          <span className="text-dim text-[10px] block">Wallet</span>
          <span className="text-foreground">${fmtUsd(data.walletValue)}</span>
        </div>
        {data.savingsValue > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Savings</span>
            <span className="text-emerald-400">${fmtUsd(data.savingsValue)}</span>
          </div>
        )}
        {data.debtValue > 0 && (
          <div>
            <span className="text-dim text-[10px] block">Debt</span>
            <span className="text-amber-400">${fmtUsd(data.debtValue)}</span>
          </div>
        )}
      </div>
      {data.allocations.length > 0 && (
        <div className="space-y-1 mb-2">
          {data.allocations.slice(0, 6).map((a) => (
            <div key={a.symbol} className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-foreground w-12">{a.symbol}</span>
              <div className="flex-1 bg-border/30 rounded-full h-1.5 overflow-hidden">
                <div className="bg-foreground/60 h-full rounded-full" style={{ width: `${Math.min(a.percentage, 100)}%` }} />
              </div>
              <span className="text-dim w-10 text-right">{a.percentage.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
      {data.insights.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border/50 text-[11px]">
          {data.insights.map((i, idx) => (
            <div key={idx} className={i.type === 'warning' ? 'text-amber-400' : 'text-dim'}>
              {i.type === 'warning' ? '⚠ ' : '→ '}{i.message}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

interface TxExplanation {
  digest: string;
  sender: string;
  status: string;
  gasUsed: string;
  timestamp?: string;
  effects: { type: string; description: string }[];
  summary: string;
}

function ExplainTxCard({ data }: { data: TxExplanation }) {
  return (
    <CardShell title="Transaction">
      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-dim">Digest</span>
          <span className="text-foreground">{data.digest.slice(0, 12)}...{data.digest.slice(-6)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Status</span>
          <span className={data.status === 'success' ? 'text-emerald-400' : 'text-amber-400'}>{data.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Gas</span>
          <span className="text-foreground">{data.gasUsed}</span>
        </div>
        {data.timestamp && (
          <div className="flex justify-between">
            <span className="text-dim">Time</span>
            <span className="text-foreground">{new Date(data.timestamp).toLocaleString()}</span>
          </div>
        )}
      </div>
      {data.effects.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-0.5 text-[11px]">
          {data.effects.filter((e) => e.type !== 'event').map((e, i) => (
            <div key={i} className="text-foreground font-mono">
              {e.type === 'send' ? '↑' : '↓'} {e.description}
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}

const SUISCAN_TX_URL = 'https://suiscan.xyz/mainnet/tx';

interface TxReceiptData {
  tx: string;
  gasCost?: number;
  amount?: number;
  asset?: string;
  apy?: number;
  savingsBalance?: number;
  to?: string;
  contactName?: string;
  // swap: engine uses fromToken/toToken, client uses from/to/received
  fromToken?: string;
  toToken?: string;
  fromAmount?: number;
  toAmount?: number;
  from?: string;
  received?: number | string;
  priceImpact?: number;
  route?: string;
  // volo_stake: engine uses amountSui, client uses amount
  amountSui?: number;
  vSuiReceived?: number;
  // volo_unstake: engine uses vSuiAmount, client uses amount
  vSuiAmount?: number;
  suiReceived?: number;
  fee?: number;
  healthFactor?: number;
  remainingDebt?: number;
  rewards?: { asset: string; amount: number; estimatedValueUsd?: number }[];
  totalValueUsd?: number;
}

function fmtAmt(n: number, decimals = 2): string {
  if (n < 1 && n > 0) return n.toFixed(6);
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function TxReceiptRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-dim">{label}</span>
      <span className="text-foreground text-right">{children}</span>
    </div>
  );
}

function TransactionReceiptCard({ data, toolName }: { data: TxReceiptData; toolName: string }) {
  if (!data.tx) return null;

  const txUrl = `${SUISCAN_TX_URL}/${data.tx}`;
  const shortTx = `${data.tx.slice(0, 8)}...${data.tx.slice(-6)}`;

  // Normalize: client-side execution uses `from/to/received`, engine uses `fromToken/toToken/toAmount`
  const swapFrom = data.fromToken ?? data.from;
  const swapTo = data.toToken ?? (toolName === 'swap_execute' ? data.to : undefined);
  const swapFromAmt = data.fromAmount ?? data.amount ?? 0;
  const receivedRaw = data.toAmount ?? data.received;
  const swapToAmt = typeof receivedRaw === 'number' ? receivedRaw : (typeof receivedRaw === 'string' && receivedRaw !== 'unknown' ? parseFloat(receivedRaw) : undefined);
  const stakeAmt = data.amountSui ?? data.amount ?? 0;
  const unstakeAmt = data.vSuiAmount ?? data.amount ?? 0;

  return (
    <CardShell title="Transaction">
      <div className="space-y-1 font-mono text-[11px]">
        {toolName === 'swap_execute' && swapFrom && swapTo && (
          <>
            <TxReceiptRow label="Sold">
              {fmtAmt(swapFromAmt)} {String(swapFrom)}
            </TxReceiptRow>
            {swapToAmt != null && !isNaN(swapToAmt) && (
              <TxReceiptRow label="Received">
                {fmtAmt(swapToAmt, 4)} {String(swapTo)}
              </TxReceiptRow>
            )}
            {data.priceImpact != null && data.priceImpact > 0.01 && (
              <TxReceiptRow label="Impact">
                <span className={data.priceImpact > 1 ? 'text-amber-400' : ''}>{data.priceImpact.toFixed(2)}%</span>
              </TxReceiptRow>
            )}
          </>
        )}

        {toolName === 'send_transfer' && (
          <>
            <TxReceiptRow label="Amount">${fmtAmt(data.amount ?? 0)}</TxReceiptRow>
            <TxReceiptRow label="To">{data.contactName ?? `${String(data.to ?? '').slice(0, 10)}...`}</TxReceiptRow>
          </>
        )}

        {toolName === 'save_deposit' && (
          <>
            <TxReceiptRow label="Deposited">{fmtAmt(data.amount ?? 0)} {data.asset ?? 'USDC'}</TxReceiptRow>
            {data.apy != null && (
              <TxReceiptRow label="APY">
                <span className="text-emerald-400">{(data.apy * 100).toFixed(2)}%</span>
              </TxReceiptRow>
            )}
          </>
        )}

        {toolName === 'withdraw' && (
          <TxReceiptRow label="Withdrawn">{fmtAmt(data.amount ?? 0)} {data.asset ?? 'USDC'}</TxReceiptRow>
        )}

        {toolName === 'borrow' && (
          <>
            <TxReceiptRow label="Borrowed">${fmtAmt(data.amount ?? 0)}</TxReceiptRow>
            {data.healthFactor != null && (
              <TxReceiptRow label="Health">
                <span className={data.healthFactor < 1.5 ? 'text-amber-400' : 'text-emerald-400'}>
                  {data.healthFactor.toFixed(2)}
                </span>
              </TxReceiptRow>
            )}
          </>
        )}

        {toolName === 'repay_debt' && (
          <>
            <TxReceiptRow label="Repaid">${fmtAmt(data.amount ?? 0)}</TxReceiptRow>
            {data.remainingDebt != null && (
              <TxReceiptRow label="Remaining">${fmtAmt(data.remainingDebt)}</TxReceiptRow>
            )}
          </>
        )}

        {toolName === 'claim_rewards' && data.totalValueUsd != null && (
          <TxReceiptRow label="Claimed">${fmtAmt(data.totalValueUsd)}</TxReceiptRow>
        )}

        {toolName === 'volo_stake' && (
          <>
            <TxReceiptRow label="Staked">{fmtAmt(stakeAmt)} SUI</TxReceiptRow>
            {data.vSuiReceived != null && (
              <TxReceiptRow label="Received">{fmtAmt(data.vSuiReceived, 4)} vSUI</TxReceiptRow>
            )}
            {data.apy != null && (
              <TxReceiptRow label="APY">
                <span className="text-emerald-400">{(data.apy * 100).toFixed(2)}%</span>
              </TxReceiptRow>
            )}
          </>
        )}

        {toolName === 'volo_unstake' && (
          <>
            <TxReceiptRow label="Unstaked">{fmtAmt(unstakeAmt, 4)} vSUI</TxReceiptRow>
            {data.suiReceived != null && (
              <TxReceiptRow label="Received">{fmtAmt(data.suiReceived, 4)} SUI</TxReceiptRow>
            )}
          </>
        )}

        {data.gasCost != null && data.gasCost > 0 && (
          <TxReceiptRow label="Gas">{data.gasCost.toFixed(4)} SUI</TxReceiptRow>
        )}

        <div className="pt-1.5 mt-1.5 border-t border-border/50 flex justify-between items-center">
          <span className="text-dim">{shortTx}</span>
          <a
            href={txUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-info hover:opacity-70 transition text-[10px] flex items-center gap-1"
          >
            View on Suiscan
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="inline-block">
              <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </CardShell>
  );
}

const WRITE_TOOL_NAMES = new Set([
  'save_deposit', 'withdraw', 'send_transfer', 'swap_execute',
  'volo_stake', 'volo_unstake', 'borrow', 'repay_debt', 'claim_rewards',
]);

const CARD_RENDERERS: Record<string, (result: unknown) => React.ReactNode | null> = {
  rates_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <RatesCard data={data as Record<string, RateEntry>} />;
  },
  balance_check: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <BalanceCard data={data as BalanceData} />;
  },
  savings_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SavingsCard data={data as SavingsData} />;
  },
  defillama_yield_pools: (result) => {
    const data = extractData(result);
    if (!Array.isArray(data)) return null;
    return <YieldCard data={data as YieldPool[]} />;
  },
  portfolio_analysis: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <PortfolioCard data={data as PortfolioData} />;
  },
  explain_tx: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ExplainTxCard data={data as TxExplanation} />;
  },
};

function extractData(result: unknown): unknown {
  if (result && typeof result === 'object' && 'data' in result) {
    return (result as { data: unknown }).data;
  }
  return result;
}

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
        return <TransactionReceiptCard data={data as TxReceiptData} toolName={tool.toolName} />;
      }
    } catch {
      return null;
    }
  }

  return null;
}
