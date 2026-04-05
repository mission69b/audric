'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { BalanceHeader } from '@/components/dashboard/BalanceHeader';
import { ContextualChips } from '@/components/dashboard/ContextualChips';
import { ChipBar } from '@/components/dashboard/ChipBar';
import { InputBar } from '@/components/dashboard/InputBar';
import { ConfirmationCard } from '@/components/dashboard/ConfirmationCard';
import { ResultCard } from '@/components/dashboard/ResultCard';
import { AmountChips } from '@/components/dashboard/AmountChips';
import { resolveFlow } from '@/components/dashboard/AgentMarkdown';
import { UnifiedTimeline } from '@/components/dashboard/UnifiedTimeline';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { useChipFlow, type ChipFlowResult, type FlowContext } from '@/hooks/useChipFlow';
import { useFeed } from '@/hooks/useFeed';
import { useEngine } from '@/hooks/useEngine';
import { useBalance } from '@/hooks/useBalance';
import { parseIntent, type ParsedIntent } from '@/lib/intent-parser';
import { mapError } from '@/lib/errors';
import { deriveContextualChips, type AccountState } from '@/lib/contextual-chips';
import { truncateAddress } from '@/lib/format';
import { SUI_NETWORK } from '@/lib/constants';
import { useContacts } from '@/hooks/useContacts';
import { useAgent } from '@/hooks/useAgent';
import { useUsdcSponsor } from '@/hooks/useUsdcSponsor';

const LS_LAST_SAVINGS = 't2000_last_savings';
const LS_LAST_OPEN = 't2000_last_open_date';

function decodeJwtEmail(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    const payload = jwt.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

function getGreeting(email: string | null): string {
  const hour = new Date().getHours();
  const name = email?.split('@')[0] ?? '';
  const nameStr = name ? `, ${name}` : '';
  if (hour < 12) return `Good morning${nameStr}`;
  if (hour < 18) return `Good afternoon${nameStr}`;
  return `Good evening${nameStr}`;
}

function fmtDollar(n: number): string {
  if (n >= 1) return `${Math.floor(n)}`;
  if (n > 0) return n.toFixed(2);
  return '0';
}

function capForFlow(
  flow: string,
  bal: { cash: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number; assetBalances: Record<string, number> },
): number {
  switch (flow) {
    case 'save': return bal.usdc;
    case 'send': return bal.cash;
    case 'withdraw': return bal.savings;
    case 'repay': return bal.borrows;
    case 'borrow': return bal.maxBorrow;
    default: return bal.cash;
  }
}

function getAmountPresets(flow: string, bal: { cash: number; savings: number; borrows: number; maxBorrow: number; sui: number; usdc: number; assetBalances: Record<string, number> }): number[] {
  const rawCap = capForFlow(flow, bal);
  if (rawCap <= 0) return [];

  const cap = Math.floor(rawCap);
  if (cap <= 0) return [];
  if (cap <= 5) return [1, 2, Math.min(5, cap)].filter((v, i, a) => v <= cap && a.indexOf(v) === i);
  if (cap <= 20) return [1, 5, 10].filter((v) => v <= cap);
  if (cap <= 100) return [5, 10, 25].filter((v) => v <= cap);
  if (cap <= 500) return [25, 50, 100].filter((v) => v <= cap);
  return [50, 100, 200];
}

function SendRecipientInput({
  contacts,
  onSelectContact,
  onSubmit,
}: {
  contacts: Array<{ name: string; address: string }>;
  onSelectContact: (address: string, name: string) => void;
  onSubmit: (input: string) => void;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const input = value.trim();
    if (!input) return;
    onSubmit(input);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setValue(text.trim());
      }
    } catch {
      // clipboard access denied
    }
  };

  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-3 feed-row shadow-[var(--shadow-card)]">
      <p className="text-sm text-muted">Who do you want to send to?</p>
      {contacts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {contacts.map((c) => (
            <button
              key={c.address}
              onClick={() => onSelectContact(c.address, c.name)}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted hover:border-border-bright hover:text-foreground transition"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Address (0x...) or contact name"
          autoFocus
          className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-dim outline-none focus:border-border-bright"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
        {value.trim() ? (
          <button
            onClick={handleSubmit}
            className="bg-foreground rounded-lg px-4 py-2 text-sm font-medium text-background tracking-[0.05em] uppercase transition hover:opacity-80 active:scale-[0.97]"
          >
            Go
          </button>
        ) : (
          <button
            onClick={handlePaste}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm text-muted transition hover:text-foreground hover:border-border-bright active:scale-[0.97]"
          >
            📋 Paste
          </button>
        )}
      </div>
    </div>
  );
}

function useOvernightEarnings(savings: number, loading: boolean) {
  return useMemo(() => {
    if (loading || typeof window === 'undefined') {
      return { earnings: undefined, isFirstOpenToday: false };
    }

    const today = new Date().toDateString();
    const lastOpen = localStorage.getItem(LS_LAST_OPEN);
    const isFirstOpenToday = lastOpen !== today;

    let earnings: number | undefined;
    if (isFirstOpenToday && savings > 0) {
      const lastSavings = parseFloat(localStorage.getItem(LS_LAST_SAVINGS) ?? '0');
      if (lastSavings > 0 && savings > lastSavings) {
        earnings = savings - lastSavings;
      }
    }

    localStorage.setItem(LS_LAST_OPEN, today);
    if (savings > 0) {
      localStorage.setItem(LS_LAST_SAVINGS, savings.toString());
    }

    return { earnings, isFirstOpenToday };
  }, [savings, loading]);
}

function DashboardContent() {
  const { address, session, expiringSoon, logout, refresh } = useZkLogin();
  useUsdcSponsor(address);
  const chipFlow = useChipFlow();
  const feed = useFeed();
  const contactsHook = useContacts(address);
  const { agent } = useAgent();
  const engine = useEngine({ address, jwt: session?.jwt });
  const balanceQuery = useBalance(address);
  const incomingQuery = useQuery({
    queryKey: ['incoming-tx', address],
    enabled: !!address,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch(`/api/history?address=${address}&limit=5`);
      const data = await res.json();
      const items = (data.items ?? []) as Array<{
        direction: string; amount?: number; asset?: string;
        counterparty?: string; timestamp: number;
      }>;
      return items
        .filter((tx) => tx.direction === 'in' && tx.amount && tx.amount > 0)
        .map((tx) => ({
          amount: tx.amount!,
          asset: tx.asset ?? 'USDC',
          from: tx.counterparty ?? '',
          timestamp: tx.timestamp,
        }));
    },
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentBudget, setAgentBudget] = useState(0.50);
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const balance = {
    total: balanceQuery.data?.total ?? 0,
    cash: balanceQuery.data?.cash ?? 0,
    savings: balanceQuery.data?.savings ?? 0,
    borrows: balanceQuery.data?.borrows ?? 0,
    savingsRate: balanceQuery.data?.savingsRate ?? 0,
    healthFactor: balanceQuery.data?.healthFactor ?? null,
    maxBorrow: balanceQuery.data?.maxBorrow ?? 0,
    pendingRewards: balanceQuery.data?.pendingRewards ?? 0,
    bestSaveRate: balanceQuery.data?.bestSaveRate ?? null,
    currentRate: balanceQuery.data?.currentRate ?? 0,
    savingsBreakdown: balanceQuery.data?.savingsBreakdown ?? [],
    sui: balanceQuery.data?.sui ?? 0,
    suiUsd: balanceQuery.data?.suiUsd ?? 0,
    suiPrice: balanceQuery.data?.suiPrice ?? 0,
    usdc: balanceQuery.data?.usdc ?? 0,
    assetBalances: balanceQuery.data?.assetBalances ?? {},
    assetUsdValues: balanceQuery.data?.assetUsdValues ?? {},
    loading: balanceQuery.isLoading,
    error: balanceQuery.isError,
  };


  useEffect(() => {
    if (!address) return;
    fetch(`/api/user/preferences?address=${address}`)
      .then((r) => r.json())
      .then((data) => {
        const budget = data.limits?.agentBudget;
        if (typeof budget === 'number' && budget >= 0) setAgentBudget(budget);
      })
      .catch(() => {});
  }, [address]);

  const overnightData = useOvernightEarnings(balance.savings, balance.loading);
  const dailyReportShown = useRef(false);
  const confirmResolverRef = useRef<((approved: boolean) => void) | null>(null);

  useEffect(() => {
    if (dailyReportShown.current || balance.loading || !overnightData.isFirstOpenToday) return;
    if (balance.total <= 0) return;
    dailyReportShown.current = true;

    const reportLines = [
      `Total: $${balance.total.toFixed(2)}`,
      `Cash: $${balance.cash.toFixed(2)}`,
      `Savings: $${balance.savings.toFixed(2)}`,
    ].filter(Boolean);
    if (balance.borrows > 0) {
      reportLines.push(`Debt: $${balance.borrows.toFixed(2)}`);
      if (balance.healthFactor && balance.healthFactor !== Infinity) {
        reportLines.push(`Health Factor: ${balance.healthFactor.toFixed(1)}`);
      }
    }
    if (balance.savingsRate > 0) reportLines.push(`Savings APY: ${balance.savingsRate.toFixed(1)}%`);
    const assetLines: string[] = [];
    const bd = balanceQuery.data;
    if (bd) {
      if (bd.sui > 0) assetLines.push(`SUI: ${bd.sui.toFixed(4)}`);
      if (bd.usdc > 0) assetLines.push(`USDC: ${bd.usdc.toFixed(2)}`);
      for (const [symbol, amt] of Object.entries(bd.assetBalances)) {
        if (amt > 0) assetLines.push(`${symbol}: ${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}`);
      }
    }

    feed.addItem({
      type: 'report',
      sections: [
        { title: 'Good morning', lines: reportLines },
        ...(assetLines.length > 0 ? [{ title: 'Assets', lines: assetLines }] : []),
      ],
    });
  }, [balance, balanceQuery.data, overnightData.isFirstOpenToday, feed]);

  const accountState: AccountState = {
    cash: balance.cash,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    pendingRewards: balance.pendingRewards,
    currentRate: balance.currentRate > 0 ? balance.currentRate : undefined,
    bestRate: balance.bestSaveRate?.rate ?? undefined,
    healthFactor: balance.healthFactor ?? undefined,
    overnightEarnings: overnightData.earnings,
    isFirstOpenToday: overnightData.isFirstOpenToday,
    sessionExpiringSoon: expiringSoon,
    recentIncoming: incomingQuery.data,
  };

  const flowContext: FlowContext = {
    cash: balance.cash,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    maxBorrow: balance.maxBorrow,
  };

  const [lastAgentAction, setLastAgentAction] = useState<string | undefined>();

  const contextualChips = deriveContextualChips(accountState, { lastAgentAction }).filter(
    (c) => !dismissedCards.has(c.id),
  );

  const handleDismissChip = useCallback((id: string) => {
    setDismissedCards((prev) => new Set(prev).add(id));
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!address) return;
    feed.addItem({ type: 'ai-text', text: 'Loading transaction history...' });
    try {
      const res = await fetch(`/api/history?address=${address}&limit=20`);
      const data = await res.json();
      feed.removeLastItem();
      if (data.items && data.items.length > 0) {
        feed.addItem({
          type: 'transaction-history',
          transactions: data.items,
          network: data.network ?? SUI_NETWORK,
        });
      } else {
        feed.addItem({
          type: 'ai-text',
          text: 'No transactions found yet. Make your first save or send to see your activity here.',
          chips: [{ label: 'Save', flow: 'save' }, { label: 'Receive', flow: 'receive' }],
        });
      }
    } catch {
      feed.removeLastItem();
      feed.addItem({
        type: 'ai-text',
        text: 'Could not load transaction history right now. Try again later.',
      });
    }
  }, [address, feed]);

  const executeIntent = useCallback(
    (intent: ParsedIntent) => {
      if (!intent) return;

      switch (intent.action) {
        case 'save': {
          const cap = capForFlow('save', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'No USDC available to save right now.', chips: [{ label: 'Receive', flow: 'receive' }] });
          } else {
            chipFlow.startFlow('save', flowContext);
            const amt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        }
        case 'send': {
          const cap = capForFlow('send', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'No funds available to send right now.', chips: [{ label: 'Receive', flow: 'receive' }] });
          } else {
            chipFlow.startFlow('send', flowContext);
            const resolved = contactsHook.resolveContact(intent.to);
            if (resolved) {
              chipFlow.selectRecipient(resolved, intent.to, flowContext.cash);
            } else {
              chipFlow.selectRecipient(intent.to, undefined, flowContext.cash);
            }
            const sendAmt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (sendAmt > 0) chipFlow.selectAmount(sendAmt);
          }
          break;
        }
        case 'withdraw':
          if (balance.savings <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any savings to withdraw.',
              chips: [{ label: 'Save', flow: 'save' }],
            });
          } else {
            chipFlow.startFlow('withdraw', flowContext);
            const amt = intent.amount === -1 ? balance.savings : intent.amount > 0 ? Math.min(intent.amount, balance.savings) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        case 'borrow': {
          const cap = capForFlow('borrow', balance);
          if (cap <= 0) {
            feed.addItem({ type: 'ai-text', text: 'Nothing available to borrow. You need savings deposited as collateral first.', chips: [{ label: 'Save', flow: 'save' }] });
          } else {
            chipFlow.startFlow('borrow', flowContext);
            const amt = intent.amount === -1 ? cap : intent.amount > 0 ? Math.min(intent.amount, cap) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        }
        case 'repay':
          if (balance.borrows <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'You don\'t have any active debt to repay.',
              chips: [{ label: 'Borrow', flow: 'borrow' }],
            });
          } else {
            chipFlow.startFlow('repay', flowContext);
            const amt = intent.amount === -1 ? balance.borrows : intent.amount > 0 ? Math.min(intent.amount, balance.borrows) : 0;
            if (amt > 0) chipFlow.selectAmount(amt);
          }
          break;
        case 'claim-rewards':
          if (balance.pendingRewards <= 0) {
            feed.addItem({
              type: 'ai-text',
              text: 'No pending rewards to claim right now.',
            });
          } else {
            feed.addItem({ type: 'ai-text', text: `Claiming $${balance.pendingRewards.toFixed(2)} in rewards...` });
            (async () => {
              try {
                if (!agent) throw new Error('Not authenticated');
                const sdk = await agent.getInstance();
                const res = await sdk.claimRewards();
                feed.removeLastItem();
                feed.addItem({
                  type: 'result',
                  success: true,
                  title: `Claimed $${balance.pendingRewards.toFixed(2)} in rewards`,
                  details: `Tx: ${res.tx.slice(0, 8)}...${res.tx.slice(-6)}`,
                });
                balanceQuery.refetch();
                setTimeout(() => balanceQuery.refetch(), 3000);
              } catch (err) {
                feed.removeLastItem();
                const msg = err instanceof Error ? err.message : 'Failed to claim rewards';
                feed.addItem({
                  type: 'ai-text',
                  text: `Claim failed: ${msg}`,
                  chips: [{ label: 'Try again', flow: 'claim-rewards' }],
                });
              }
            })();
          }
          break;
        case 'address':
          feed.addItem({
            type: 'receipt',
            title: 'Deposit Address',
            code: address ?? '',
            qr: true,
            meta: [
              { label: 'Network', value: 'Sui (mainnet)' },
              { label: 'Token', value: 'USDC' },
            ],
            instructions: [
              {
                title: 'From Binance',
                steps: [
                  'Go to Withdraw → search "USDC"',
                  'Select network: **Sui**',
                  'Paste your address above',
                  'Enter amount and confirm',
                ],
              },
              {
                title: 'From Coinbase',
                steps: [
                  'Go to Send → select USDC',
                  'Choose network: **Sui**',
                  'Paste your address above',
                  'Enter amount and confirm',
                ],
              },
              {
                title: 'From any Sui wallet',
                steps: [
                  'Send USDC to the address above',
                ],
              },
            ],
          });
          break;
        case 'balance': {
          const bd = balanceQuery.data;
          const stats: string[] = [
            `<<stat label="Cash" value="$${balance.cash.toFixed(2)}" status="${balance.cash > 0 ? 'safe' : 'neutral'}">>`,
            `<<stat label="Savings" value="$${balance.savings.toFixed(2)}" status="${balance.savings > 0 ? 'safe' : 'neutral'}">>`,
          ];
          stats.push(`<<stat label="Total" value="$${balance.total.toFixed(2)}" status="${balance.total > 0 ? 'safe' : 'neutral'}">>`)
          if (balance.borrows > 0) {
            stats.push(`<<stat label="Debt" value="$${balance.borrows.toFixed(2)}" status="${balance.borrows > 1 ? 'warning' : 'safe'}">>`)
            if (balance.healthFactor && balance.healthFactor !== Infinity) {
              stats.push(`<<stat label="Health" value="${balance.healthFactor.toFixed(0)}" status="${balance.healthFactor > 2 ? 'safe' : 'danger'}">>`)
            }
          }
          if (bd) {
            if (bd.sui > 0) stats.push(`<<stat label="SUI" value="${bd.sui.toFixed(4)} ($${bd.suiUsd.toFixed(2)})" status="safe">>`);
            if (bd.usdc > 0) stats.push(`<<stat label="USDC" value="${bd.usdc.toFixed(2)}" status="safe">>`);
            for (const [symbol, amt] of Object.entries(bd.assetBalances)) {
              if (amt > 0) stats.push(`<<stat label="${symbol}" value="${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}" status="safe">>`);
            }
          }
          feed.addItem({ type: 'ai-text', text: stats.join('\n') });
          break;
        }
        case 'report': {
          const rd = balanceQuery.data;
          const rStats: string[] = [
            `<<stat label="Cash" value="$${balance.cash.toFixed(2)}" status="${balance.cash > 0 ? 'safe' : 'neutral'}">>`,
            `<<stat label="Savings" value="$${balance.savings.toFixed(2)}" status="${balance.savings > 0 ? 'safe' : 'neutral'}">>`,
          ];
          if (balance.borrows > 0) {
            rStats.push(`<<stat label="Debt" value="$${balance.borrows.toFixed(2)}" status="${balance.borrows > 1 ? 'warning' : 'safe'}">>`)
          } else {
            rStats.push(`<<stat label="Debt" value="$0.00" status="safe">>`);
          }
          if (balance.savingsRate > 0) {
            rStats.push(`<<stat label="Yield" value="${balance.savingsRate.toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.healthFactor && balance.healthFactor !== Infinity && balance.borrows > 0) {
            rStats.push(`<<stat label="Health" value="${balance.healthFactor.toFixed(0)}" status="${balance.healthFactor > 2 ? 'safe' : 'danger'}">>`)
          }
          if (rd) {
            if (rd.sui > 0) rStats.push(`<<stat label="SUI" value="${rd.sui.toFixed(4)} ($${rd.suiUsd.toFixed(2)})" status="safe">>`);
            if (rd.usdc > 0) rStats.push(`<<stat label="USDC" value="${rd.usdc.toFixed(2)}" status="safe">>`);
            for (const [symbol, amt] of Object.entries(rd.assetBalances)) {
              if (amt > 0) rStats.push(`<<stat label="${symbol}" value="${amt < 0.01 ? amt.toFixed(8) : amt.toFixed(4)}" status="safe">>`);
            }
          }
          feed.addItem({ type: 'ai-text', text: rStats.join('\n') });
          break;
        }
        case 'history':
          fetchHistory();
          break;
        case 'rates': {
          const rtStats: string[] = [];
          if (balance.savingsRate > 0) {
            rtStats.push(`<<stat label="Your Rate" value="${balance.savingsRate.toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.bestSaveRate) {
            const isBetter = balance.bestSaveRate.rate > balance.savingsRate + 0.3;
            rtStats.push(`<<stat label="Best Available" value="${balance.bestSaveRate.rate.toFixed(1)}% APY" status="${isBetter ? 'safe' : 'neutral'}">>`)
            rtStats.push(`<<stat label="Protocol" value="${balance.bestSaveRate.protocol}" status="neutral">>`)
          }
          if (balance.savings > 0 && balance.savingsRate > 0) {
            const monthly = (balance.savings * (balance.savingsRate / 100)) / 12;
            rtStats.push(`<<stat label="Monthly Earnings" value="~$${monthly.toFixed(2)}" status="neutral">>`);
          }
          if (rtStats.length === 0) {
            feed.addItem({ type: 'ai-text', text: 'No rate data available yet — rates refresh every 30s.' });
          } else {
            feed.addItem({
              type: 'ai-text',
              text: rtStats.join('\n'),
              chips: balance.cash > 5
                ? [{ label: 'Save', flow: 'save' }]
                : [],
            });
          }
          break;
        }
        case 'help':
          feed.addItem({
            type: 'ai-text',
            text: 'Here\'s what I can help with:\n\n• Save — Earn yield on idle USDC\n• Send — Transfer USDC to anyone\n• Borrow — Against your savings\n• Report — Full financial summary\n\nI can also search the web, send emails, translate, generate images, and more — just type what you need.',
          });
          break;
      }
    },
    [chipFlow, feed, address, balance, balanceQuery, flowContext, agent, contactsHook, fetchHistory],
  );

  const handleChipClick = useCallback(
    (flow: string) => {
      if (flow === 'refresh-session') { refresh(); return; }

      if (flow === 'claim-rewards') { chipFlow.reset(); executeIntent({ action: 'claim-rewards' }); return; }
      if (flow === 'help') { chipFlow.reset(); executeIntent({ action: 'help' }); return; }
      if (flow === 'report') { chipFlow.reset(); executeIntent({ action: 'report' }); return; }
      if (flow === 'history') { chipFlow.reset(); executeIntent({ action: 'history' }); return; }
      if (flow === 'receive') { chipFlow.reset(); executeIntent({ action: 'address' }); return; }
      if (flow === 'balance') { chipFlow.reset(); executeIntent({ action: 'balance' }); return; }
      if (flow === 'rates') { chipFlow.reset(); executeIntent({ action: 'rates' }); return; }

      if (flow === 'save-all') {
        chipFlow.startFlow('save', flowContext);
        chipFlow.selectAmount(balance.cash);
        return;
      }
      if (flow === 'risk-explain') {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'Your health factor measures how safe your loan is. Below 1.5 means you\'re close to liquidation — repaying even a small amount brings it back to a safer level.',
          chips: [{ label: 'Repay $50', flow: 'repay' }],
        });
        return;
      }
      if (flow === 'repay' && balance.borrows <= 0) {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any active debt to repay.',
          chips: [{ label: 'Borrow', flow: 'borrow' }],
        });
        return;
      }
      if (flow === 'withdraw' && balance.savings <= 0) {
        chipFlow.reset();
        feed.addItem({
          type: 'ai-text',
          text: 'You don\'t have any savings to withdraw. Save first to earn yield.',
          chips: [{ label: 'Save', flow: 'save' }],
        });
        return;
      }
      chipFlow.startFlow(flow, flowContext);
    },
    [chipFlow, feed, executeIntent, balance, flowContext, refresh],
  );

  const handleInputSubmit = useCallback(
    async (text: string) => {
      if (!address) return;
      engine.sendMessage(text);
    },
    [address, engine],
  );

  const handleFeedChipClick = useCallback(
    (flowOrLabel: string) => {
      const intent = parseIntent(flowOrLabel);
      if (intent) {
        executeIntent(intent);
        return;
      }
      const flow = resolveFlow(flowOrLabel) ?? flowOrLabel;
      handleChipClick(flow);
    },
    [handleChipClick, executeIntent],
  );

  const handleNewConversation = useCallback(() => {
    engine.clearMessages();
    feed.clear();
    chipFlow.reset();
  }, [engine, feed, chipFlow]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const extractReceivedAmount = useCallback((
    balanceChanges: Array<{ coinType: string; amount: string; owner?: unknown }> | undefined,
    toToken: string,
    userAddress?: string,
  ): string | null => {
    if (!balanceChanges?.length) return null;

    const KNOWN_TOKENS: Record<string, { type: string; decimals: number }> = {
      SUI:   { type: '0x2::sui::SUI', decimals: 9 },
      USDC:  { type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC', decimals: 6 },
      USDT:  { type: '0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT', decimals: 6 },
      CETUS: { type: '0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS', decimals: 9 },
      DEEP:  { type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP', decimals: 6 },
      NAVX:  { type: '0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX', decimals: 9 },
      vSUI:  { type: '0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT', decimals: 9 },
      WAL:   { type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL', decimals: 9 },
      ETH:   { type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH', decimals: 8 },
    };

    const norm = (addr: string) => addr.toLowerCase().replace(/^0x0*/, '0x');

    const isUserOwned = (bc: { owner?: unknown }): boolean => {
      if (!userAddress) return true;
      const o = bc.owner as Record<string, string> | null | undefined;
      if (!o || typeof o !== 'object') return false;
      const addr = o.AddressOwner ?? o.ObjectOwner;
      if (!addr) return false;
      return norm(addr) === norm(userAddress);
    };

    const findBest = (type: string, decimals: number): string | null => {
      const positives = balanceChanges!
        .filter((bc) => bc.coinType === type && Number(bc.amount) > 0);

      if (positives.length === 0) return null;

      const userMatch = positives.find(isUserOwned);
      const best = userMatch ?? positives.reduce((a, b) =>
        Number(a.amount) > Number(b.amount) ? a : b,
      );

      const precision = decimals >= 8 ? 4 : 2;
      return (Number(best.amount) / 10 ** decimals).toFixed(precision);
    };

    const entry = KNOWN_TOKENS[toToken.toUpperCase()];
    const targetType = entry?.type ?? toToken;
    const knownDecimals = entry?.decimals;

    if (knownDecimals != null) return findBest(targetType, knownDecimals);

    if (targetType.includes('::')) return findBest(targetType, 9);

    return null;
  }, []);

  const handleExecuteAction = useCallback(
    async (toolName: string, input: unknown): Promise<{ success: boolean; data: unknown }> => {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();
      const inp = (input ?? {}) as Record<string, unknown>;

      switch (toolName) {
        case 'save_deposit': {
          const res = await sdk.save({ amount: Number(inp.amount), asset: inp.asset as string | undefined, protocol: inp.protocol as string | undefined });
          balanceQuery.refetch();
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount, asset: inp.asset } };
        }
        case 'withdraw': {
          const res = await sdk.withdraw({ amount: Number(inp.amount), asset: inp.asset as string | undefined, protocol: inp.protocol as string | undefined });
          balanceQuery.refetch();
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount, asset: inp.asset } };
        }
        case 'send_transfer': {
          const res = await sdk.send({ to: String(inp.to), amount: Number(inp.amount), asset: inp.asset as string | undefined });
          balanceQuery.refetch();
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount, to: inp.to } };
        }
        case 'borrow': {
          const res = await sdk.borrow({ amount: Number(inp.amount), protocol: inp.protocol as string | undefined });
          balanceQuery.refetch();
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount } };
        }
        case 'repay_debt': {
          const res = await sdk.repay({ amount: Number(inp.amount), protocol: inp.protocol as string | undefined });
          balanceQuery.refetch();
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount } };
        }
        case 'claim_rewards': {
          const res = await sdk.claimRewards();
          balanceQuery.refetch();
          return { success: true, data: { success: true, tx: res.tx } };
        }
        case 'swap_execute': {
          try {
            const res = await sdk.swap({
              from: String(inp.from),
              to: String(inp.to),
              amount: Number(inp.amount),
              slippage: inp.slippage ? Number(inp.slippage) : undefined,
              byAmountIn: inp.byAmountIn as boolean | undefined,
            });
            balanceQuery.refetch();
            setTimeout(() => balanceQuery.refetch(), 3000);
            const received = extractReceivedAmount(res.balanceChanges, String(inp.to), agent.address);
            return { success: true, data: { success: true, tx: res.tx, from: inp.from, to: inp.to, amount: inp.amount, received: received ?? 'unknown' } };
          } catch (swapErr) {
            const msg = swapErr instanceof Error ? swapErr.message : String(swapErr);
            console.error('[swap_execute] failed:', msg);
            return { success: false, data: { success: false, error: msg, from: inp.from, to: inp.to, amount: inp.amount } };
          }
        }
        case 'volo_stake': {
          const res = await sdk.stakeVSui({ amount: Number(inp.amount) });
          balanceQuery.refetch();
          setTimeout(() => balanceQuery.refetch(), 3000);
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount } };
        }
        case 'volo_unstake': {
          const res = await sdk.unstakeVSui({ amount: Number(inp.amount ?? 0) });
          balanceQuery.refetch();
          setTimeout(() => balanceQuery.refetch(), 3000);
          return { success: true, data: { success: true, tx: res.tx, amount: inp.amount } };
        }
        case 'pay_api': {
          const serviceResult = await sdk.payService({
            url: inp.url as string,
            rawBody: inp.body ? JSON.parse(String(inp.body)) : undefined,
          });
          return { success: true, data: serviceResult };
        }
        case 'save_contact': {
          await contactsHook.addContact(String(inp.name), String(inp.address));
          return { success: true, data: { saved: true, name: inp.name, address: inp.address } };
        }
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    },
    [agent, balanceQuery, contactsHook],
  );

  const handleSaveContact = useCallback(
    async (name: string, addr: string) => {
      await contactsHook.addContact(name, addr);
      feed.addItem({
        type: 'ai-text',
        text: `Saved "${name}" as a contact. Next time you send, just type their name.`,
      });
    },
    [contactsHook, feed],
  );

  const handleAmountSelect = useCallback(
    (amount: number) => {
      const flow = chipFlow.state.flow ?? '';
      const cap = capForFlow(flow, balance);

      if (amount === -1) {
        chipFlow.selectAmount(cap);
      } else {
        chipFlow.selectAmount(Math.min(amount, cap));
      }
    },
    [chipFlow, balance],
  );

  const handleConfirm = useCallback(async () => {
    chipFlow.confirm();

    const flow = chipFlow.state.flow;
    const cap = capForFlow(flow ?? '', balance);
    const rawAmount = chipFlow.state.amount ?? 0;
    const amount = Math.min(rawAmount, cap);

    try {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();

      let txDigest = '';
      let flowLabel = '';

      const protocol = chipFlow.state.protocol ?? undefined;

      switch (flow) {
        case 'save': {
          const res = await sdk.save({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Saved';
          break;
        }
        case 'send': {
          const recipient = chipFlow.state.recipient;
          if (!recipient) throw new Error('No recipient specified');
          let sendAsset: string | undefined;
          let sendAmount = amount;
          if (amount > balance.usdc && balance.sui > 0) {
            sendAsset = 'SUI';
            sendAmount = balance.suiPrice > 0 ? amount / balance.suiPrice : 0;
          }
          const res = await sdk.send({ to: recipient, amount: sendAmount, asset: sendAsset });
          txDigest = res.tx;
          flowLabel = 'Sent';
          break;
        }
        case 'withdraw': {
          const primary = balance.savingsBreakdown.length > 0
            ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
            : null;
          const fromAsset = primary?.asset ?? 'USDC';
          const toAsset = fromAsset !== 'USDC' ? 'USDC' : undefined;
          const res = await sdk.withdraw({
            amount,
            protocol: protocol ?? primary?.protocolId,
            fromAsset: fromAsset !== 'USDC' ? fromAsset : undefined,
            toAsset,
          });
          txDigest = res.tx;
          flowLabel = 'Withdrew';
          break;
        }
        case 'borrow': {
          const res = await sdk.borrow({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Borrowed';
          break;
        }
        case 'repay': {
          const res = await sdk.repay({ amount, protocol });
          txDigest = res.tx;
          flowLabel = 'Repaid';
          break;
        }
        default:
          throw new Error(`Unknown flow: ${flow}`);
      }

      const explorerBase = SUI_NETWORK === 'testnet'
        ? 'https://suiscan.xyz/testnet/tx'
        : 'https://suiscan.xyz/mainnet/tx';
      const txUrl = txDigest ? `${explorerBase}/${txDigest}` : undefined;
      const result: ChipFlowResult = {
        success: true,
        title: `${flowLabel} $${amount.toFixed(2)}`,
        details: txDigest
          ? `Tx: ${txDigest.slice(0, 8)}...${txDigest.slice(-6)}`
          : 'Transaction confirmed on-chain.',
        txUrl,
      };
      chipFlow.setResult(result);

      feed.addItem({
        type: 'result',
        success: true,
        title: result.title,
        details: result.details,
        txUrl,
      });

      balanceQuery.refetch();
      setTimeout(() => balanceQuery.refetch(), 3000);

      if (
        flow === 'send' &&
        chipFlow.state.recipient &&
        !contactsHook.isKnownAddress(chipFlow.state.recipient)
      ) {
        feed.addItem({
          type: 'contact-prompt',
          address: chipFlow.state.recipient,
        });
      }
    } catch (err) {
      const errorData = mapError(err);
      chipFlow.setError(errorData.type === 'error' ? errorData.message : 'Transaction failed');
      feed.addItem(errorData);
    }
  }, [chipFlow, feed, agent, contactsHook, balanceQuery]);

  const getConfirmationDetails = () => {
    const flow = chipFlow.state.flow;
    const amount = chipFlow.state.amount ?? 0;
    const details: { label: string; value: string }[] = [];

    details.push({ label: 'Amount', value: `$${amount.toFixed(2)}` });

    if (flow === 'withdraw') {
      const primary = balance.savingsBreakdown.length > 0
        ? balance.savingsBreakdown.reduce((a, b) => a.amount > b.amount ? a : b)
        : null;
      if (primary && primary.asset !== 'USDC') {
        details.push({ label: 'Conversion', value: `${primary.asset} → USDC (auto)` });
      }
    }

    if (flow === 'send' && chipFlow.state.recipient) {
      details.push({ label: 'To', value: chipFlow.state.subFlow ?? chipFlow.state.recipient });
    }

    if (flow === 'save' && balance.savingsRate > 0) {
      details.push({ label: 'APY', value: `${balance.savingsRate.toFixed(1)}%` });
      const monthly = (amount * (balance.savingsRate / 100)) / 12;
      if (monthly >= 0.01) details.push({ label: 'Est. monthly', value: `+$${monthly.toFixed(2)}` });
    }

    if (flow === 'borrow' && balance.savingsRate > 0) {
      details.push({ label: 'Collateral', value: `$${Math.floor(balance.savings)}` });
    }

    details.push({ label: 'Gas', value: 'Sponsored' });

    return {
      title: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
      confirmLabel: `${flow?.charAt(0).toUpperCase()}${flow?.slice(1)} $${amount.toFixed(2)}`,
      details,
    };
  };

  if (!address || !session) return null;

  const isInFlow = chipFlow.state.phase !== 'idle';
  const isEmpty = engine.messages.length === 0 && feed.items.length === 0 && !isInFlow;
  const email = decodeJwtEmail(session?.jwt);
  const greeting = getGreeting(email);

  const settingsPanel = (
    <SettingsPanel
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      address={address}
      email={email}
      network={SUI_NETWORK}
      sessionExpiresAt={session.expiresAt}
      contacts={contactsHook.contacts}
      onRemoveContact={contactsHook.removeContact}
      onSignOut={logout}
      onRefreshSession={refresh}
      jwt={session.jwt}
      activeSessionId={engine.sessionId}
      onLoadSession={engine.loadSession}
      onNewConversation={handleNewConversation}
    />
  );

  if (isEmpty && !engine.isStreaming) {
    return (
      <main className="flex flex-1 flex-col min-h-dvh">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-4">
          <BalanceHeader
            address={address}
            balance={balance}
            compact={false}
            onSettingsClick={() => setSettingsOpen(true)}
          />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 -mt-8">
          <p className="text-sm text-muted mb-6">{greeting}</p>

          <div className="w-full max-w-2xl mb-6">
            <InputBar
              onSubmit={handleInputSubmit}
              placeholder="Ask anything..."
            />
          </div>

          {contextualChips.length > 0 && (
            <div className="w-full max-w-2xl mb-6">
              <ContextualChips
                chips={contextualChips}
                onChipFlow={handleChipClick}
                onAgentPrompt={(prompt) => handleInputSubmit(prompt)}
                onDismiss={handleDismissChip}
              />
            </div>
          )}

          <div className="w-full max-w-2xl overflow-x-auto scrollbar-none">
            <ChipBar
              onChipClick={handleChipClick}
              activeFlow={chipFlow.state.flow}
            />
          </div>
        </div>

        {settingsPanel}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col pb-32">
      <div className={`sticky top-0 z-20 bg-background/95 backdrop-blur-sm transition-[border-color] duration-200 border-b ${scrolled ? 'border-border/50' : 'border-transparent'}`}>
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-4">
          <BalanceHeader
            address={address}
            balance={balance}
            compact={scrolled}
            onSettingsClick={() => setSettingsOpen(true)}
          />
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 space-y-3">

        {chipFlow.state.phase === 'result' && chipFlow.state.result && (
          <ResultCard
            success={chipFlow.state.result.success}
            title={chipFlow.state.result.title}
            details={chipFlow.state.result.details}
            txUrl={chipFlow.state.result.txUrl}
            onDismiss={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'confirming' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={handleConfirm}
            onCancel={chipFlow.reset}
          />
        )}

        {chipFlow.state.phase === 'executing' && (
          <ConfirmationCard
            {...getConfirmationDetails()}
            onConfirm={() => {}}
            onCancel={() => {}}
            loading
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow && chipFlow.state.flow !== 'send' && (() => {
          const f = chipFlow.state.flow!;
          return (
            <AmountChips
              amounts={getAmountPresets(f, balance)}
              allLabel={
                f === 'withdraw' ? `All $${fmtDollar(balance.savings)}` :
                f === 'save' ? `All $${fmtDollar(balance.cash)}` :
                f === 'repay' ? `All $${fmtDollar(balance.borrows)}` :
                f === 'borrow' && balance.maxBorrow > 0 ? `Max $${fmtDollar(balance.maxBorrow)}` :
                undefined
              }
              onSelect={handleAmountSelect}
              message={chipFlow.state.message ?? undefined}
            />
          );
        })()}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && !chipFlow.state.recipient && (
          <SendRecipientInput
            contacts={contactsHook.contacts}
            onSelectContact={(addr, name) => chipFlow.selectRecipient(addr, name, balance.cash)}
            onSubmit={(input) => {
              const resolved = contactsHook.resolveContact(input);
              if (resolved) {
                chipFlow.selectRecipient(resolved, input, balance.cash);
              } else {
                chipFlow.selectRecipient(input, undefined, balance.cash);
              }
            }}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'send' && chipFlow.state.recipient && (
          <AmountChips
            amounts={getAmountPresets('send', balance)}
            allLabel={`All $${fmtDollar(balance.cash)}`}
            onSelect={handleAmountSelect}
            message={chipFlow.state.message ?? undefined}
          />
        )}

        {!isInFlow && (
          <UnifiedTimeline
            engine={engine}
            feed={feed}
            onChipClick={handleFeedChipClick}
            onCopy={handleCopy}
            onSaveContact={handleSaveContact}
            onExecuteAction={handleExecuteAction}
            onConfirmResolve={(approved) => {
              const resolver = confirmResolverRef.current;
              if (resolver) {
                confirmResolverRef.current = null;
                feed.updateLastItem((prev) => {
                  if (prev.type !== 'agent-response') return prev;
                  return { ...prev, confirm: undefined };
                });
                resolver(approved);
              }
            }}
          />
        )}

      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-border bg-background/95 backdrop-blur-sm safe-bottom z-30">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-3 space-y-3">
          {engine.isStreaming ? (
            <>
              <InputBar
                onSubmit={handleInputSubmit}
                onCancel={engine.cancel}
                disabled
                placeholder="Ask a follow up..."
              />
              <div className="flex items-center justify-between">
                <button
                  onClick={engine.cancel}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted hover:text-foreground hover:border-foreground transition active:scale-[0.97]"
                >
                  <span className="text-base leading-none">&#9632;</span> Stop
                </button>
                {engine.usage && (
                  <span className="text-[10px] text-dim font-mono">
                    {engine.usage.inputTokens + engine.usage.outputTokens} tokens
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-2 overflow-x-auto scrollbar-none flex-1">
                  <ChipBar
                    onChipClick={handleChipClick}
                    activeFlow={chipFlow.state.flow}
                    disabled={chipFlow.state.phase === 'executing'}
                  />
                </div>
                {isInFlow && chipFlow.state.phase !== 'result' && (
                  <button
                    onClick={chipFlow.reset}
                    className="text-xs text-muted hover:text-foreground transition shrink-0"
                  >
                    Cancel
                  </button>
                )}
                {!isInFlow && engine.messages.length > 0 && (
                  <button
                    onClick={handleNewConversation}
                    className="text-xs text-muted hover:text-foreground transition shrink-0"
                  >
                    New
                  </button>
                )}
              </div>
              <InputBar
                onSubmit={handleInputSubmit}
                disabled={chipFlow.state.phase === 'executing'}
                placeholder={engine.messages.length > 0 ? 'Ask a follow up...' : 'Ask anything...'}
              />
            </>
          )}
        </div>
      </div>

      {settingsPanel}
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
