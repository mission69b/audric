'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { ContextualChips } from '@/components/dashboard/ContextualChips';
import { ChipBar } from '@/components/dashboard/ChipBar';
import { ChipExpand } from '@/components/dashboard/ChipExpand';
import { InputBar } from '@/components/dashboard/InputBar';
import { useChipExpand } from '@/hooks/useChipExpand';
import { ConfirmationCard } from '@/components/dashboard/ConfirmationCard';
import { ResultCard } from '@/components/dashboard/ResultCard';
import { AmountChips } from '@/components/dashboard/AmountChips';
import { SwapAssetPicker, type SwapAsset } from '@/components/dashboard/SwapAssetPicker';
import { resolveFlow } from '@/components/dashboard/AgentMarkdown';
import { UnifiedTimeline } from '@/components/dashboard/UnifiedTimeline';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { EmailCaptureModal } from '@/components/auth/EmailCaptureModal';
import { AppShell } from '@/components/shell/AppShell';
import { useChipFlow, type ChipFlowResult, type FlowContext } from '@/hooks/useChipFlow';
import { useFeed } from '@/hooks/useFeed';
import { useEngine } from '@/hooks/useEngine';
import { useBalance } from '@/hooks/useBalance';
import { parseIntent, type ParsedIntent } from '@/lib/intent-parser';
import { mapError } from '@/lib/errors';
import { deriveContextualChips, type AccountState } from '@/lib/contextual-chips';
import { SUI_NETWORK } from '@/lib/constants';
import { useContacts } from '@/hooks/useContacts';
import { useAgent, ServiceDeliveryError } from '@/hooks/useAgent';
import { useUsdcSponsor } from '@/hooks/useUsdcSponsor';
import { COIN_REGISTRY } from '@/lib/token-registry';
import { parseActualAmount, buildSwapDisplayData } from '@/lib/balance-changes';
import { useAllowanceStatus } from '@/hooks/useAllowanceStatus';
import { type DashboardTab } from '@/components/dashboard/DashboardTabs';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { useActivityFeed } from '@/hooks/useActivityFeed';
import { BriefingCard } from '@/components/dashboard/BriefingCard';
import { NewConversationView } from '@/components/dashboard/NewConversationView';
import { FirstLoginView } from '@/components/dashboard/FirstLoginView';
import { TosBanner } from '@/components/dashboard/TosBanner';
import { GracePeriodBanner } from '@/components/dashboard/GracePeriodBanner';
import { useOvernightBriefing } from '@/hooks/useOvernightBriefing';
import { useDashboardInsights } from '@/hooks/useDashboardInsights';
import { useUserStatus } from '@/hooks/useUserStatus';
import { usePanel } from '@/hooks/usePanel';
import { PortfolioPanel } from '@/components/panels/PortfolioPanel';
import { ActivityPanel } from '@/components/panels/ActivityPanel';
import { PayPanel } from '@/components/panels/PayPanel';
import { GoalsPanel } from '@/components/panels/GoalsPanel';
import { ReportsPanel } from '@/components/panels/ReportsPanel';
import { ContactsPanel } from '@/components/panels/ContactsPanel';
import { AutomationsPanel } from '@/components/panels/AutomationsPanel';
import { StorePanel } from '@/components/panels/StorePanel';

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

export interface DashboardContentProps {
  initialSessionId?: string;
}

export function DashboardContent({ initialSessionId }: DashboardContentProps = {}) {
  const { address, session, expiringSoon, logout, refresh } = useZkLogin();
  const { panel, setPanel } = usePanel();
  useUsdcSponsor(address);
  const allowance = useAllowanceStatus(address);

  const needsAllowance = !allowance.loading && !allowance.allowanceId && !allowance.skipped && !!address;

  const chipFlow = useChipFlow();
  const feed = useFeed();
  const contactsHook = useContacts(address);
  const { agent } = useAgent();
  const engine = useEngine({ address, jwt: session?.jwt });

  const initialSessionLoaded = useRef(false);
  useEffect(() => {
    if (initialSessionLoaded.current || !initialSessionId || !session?.jwt) return;
    initialSessionLoaded.current = true;
    engine.loadSession(initialSessionId);
  }, [initialSessionId, session?.jwt, engine.loadSession]);

  useEffect(() => {
    if (!engine.sessionId) return;
    const target = `/chat/${engine.sessionId}`;
    if (window.location.pathname !== target) {
      window.history.replaceState(window.history.state, '', target);
    }
  }, [engine.sessionId]);

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
  const [activeTab, setActiveTab] = useState<DashboardTab>('chat');
  const activityFeed = useActivityFeed(address);
  const briefing = useOvernightBriefing(address, session?.jwt ?? null);
  const userStatus = useUserStatus(address, session?.jwt);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [agentBudget, setAgentBudget] = useState(0.50);
  const [dismissedCards, setDismissedCards] = useState<Set<string>>(new Set());
  const [scrolled, setScrolled] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const emailCheckedRef = useRef(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!address || !session?.jwt || emailCheckedRef.current) return;
    emailCheckedRef.current = true;
    fetch(`/api/user/email?address=${address}`, {
      headers: { 'x-zklogin-jwt': session.jwt },
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.emailVerified) setEmailModalOpen(true);
      })
      .catch(() => {});
  }, [address, session?.jwt]);

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

  const chipExpand = useChipExpand({ idleUsdc: balance.usdc, currentApy: balance.savingsRate });

  const dashInsights = useDashboardInsights({
    address,
    jwt: session?.jwt ?? null,
    idleUsdc: balance.usdc,
    savings: balance.savings,
    savingsRate: balance.savingsRate,
    debt: balance.borrows,
    healthFactor: balance.healthFactor ?? null,
  });

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
    if (balance.savingsRate > 0) reportLines.push(`Savings APY: ${(balance.savingsRate * 100).toFixed(1)}%`);
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
    usdc: balance.usdc,
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
    usdc: balance.usdc,
    savings: balance.savings,
    borrows: balance.borrows,
    savingsRate: balance.savingsRate,
    bestRate: balance.bestSaveRate?.rate,
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
            rStats.push(`<<stat label="Yield" value="${(balance.savingsRate * 100).toFixed(1)}% APY" status="safe">>`);
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
            rtStats.push(`<<stat label="Your Rate" value="${(balance.savingsRate * 100).toFixed(1)}% APY" status="safe">>`);
          }
          if (balance.bestSaveRate) {
            const isBetter = balance.bestSaveRate.rate > balance.savingsRate + 0.003;
            rtStats.push(`<<stat label="Best Available" value="${(balance.bestSaveRate.rate * 100).toFixed(1)}% APY" status="${isBetter ? 'safe' : 'neutral'}">>`)
            rtStats.push(`<<stat label="Protocol" value="${balance.bestSaveRate.protocol}" status="neutral">>`)
          }
          if (balance.savings > 0 && balance.savingsRate > 0) {
            const monthly = (balance.savings * balance.savingsRate) / 12;
            rtStats.push(`<<stat label="Monthly Earnings" value="~$${monthly.toFixed(2)}" status="neutral">>`);
          }
          if (rtStats.length === 0) {
            feed.addItem({ type: 'ai-text', text: 'No rate data available yet — rates refresh every 30s.' });
          } else {
            feed.addItem({
              type: 'ai-text',
              text: rtStats.join('\n'),
              chips: balance.usdc > 5
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
      if (flow === 'charts') { chipFlow.reset(); engine.sendMessage('Show me my activity heatmap and a yield projector'); return; }

      if (flow === 'save-all') {
        chipFlow.startFlow('save', flowContext);
        chipFlow.selectAmount(balance.usdc);
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
    [chipFlow, feed, executeIntent, balance, flowContext, refresh, engine],
  );

  const handleInputSubmit = useCallback(
    async (text: string) => {
      if (!address) return;
      if (panel !== 'chat') {
        setPanel('chat');
      }
      engine.sendMessage(text);
    },
    [address, engine, panel, setPanel],
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
    window.history.replaceState(window.history.state, '', '/new');
  }, [engine, feed, chipFlow]);

  const handleTabChange = useCallback((tab: DashboardTab) => {
    setActiveTab(tab);
    if (tab === 'activity') activityFeed.markSeen();
  }, [activityFeed.markSeen]);

  const handleActivityAction = useCallback((flow: string) => {
    setActiveTab('chat');
    handleChipClick(flow);
  }, [handleChipClick]);

  const handleBriefingCtaClick = useCallback((type: string, amount?: number) => {
    if (type === 'save' && amount) {
      handleInputSubmit(`Save $${amount} USDC`);
    } else if (type === 'repay') {
      handleInputSubmit('Repay my debt');
    }
  }, [handleInputSubmit]);

  const handleBriefingViewReport = useCallback(() => {
    handleInputSubmit('Give me my daily briefing');
  }, [handleInputSubmit]);

  const handleWelcomeSave = useCallback(() => {
    const usdc = balanceQuery.data?.usdc ?? 0;
    const amount = usdc < 1 ? usdc.toFixed(2) : Math.floor(usdc).toString();
    handleInputSubmit(`Save $${amount} USDC`);
    userStatus.markOnboarded();
  }, [handleInputSubmit, balanceQuery.data?.usdc, userStatus.markOnboarded]);

  const handleWelcomeAsk = useCallback(() => {
    handleInputSubmit('What can you do?');
    userStatus.markOnboarded();
  }, [handleInputSubmit, userStatus.markOnboarded]);

  const handleWelcomeDismiss = useCallback(() => {
    userStatus.markOnboarded();
  }, [userStatus.markOnboarded]);

  // Deep link: ?prefill=... auto-sends a message on load
  const searchParams = useSearchParams();
  const prefillHandled = useRef(false);
  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = searchParams.get('prefill');
    if (prefill && address) {
      prefillHandled.current = true;
      handleInputSubmit(decodeURIComponent(prefill));
      window.history.replaceState({}, '', '/new');
    }
  }, [searchParams, address, handleInputSubmit]);

  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const validateAction = useCallback(
    (toolName: string, input: unknown): string | null => {
      if (!['send_transfer', 'save_deposit', 'swap_execute'].includes(toolName)) return null;
      const inp = (input ?? {}) as Record<string, unknown>;
      const reqAmount = Number(inp.amount ?? 0);
      if (reqAmount <= 0) return null;
      const assetKey = (toolName === 'swap_execute'
        ? (inp.from ?? inp.fromAsset ?? 'USDC')
        : (inp.asset ?? 'USDC')) as string;
      const sym = assetKey.toUpperCase();
      const bd = balanceQuery.data;
      let available = 0;
      if (sym === 'USDC') available = bd?.usdc ?? 0;
      else if (sym === 'SUI') available = bd?.sui ?? 0;
      else available = bd?.assetBalances?.[sym] ?? bd?.assetBalances?.[assetKey] ?? 0;
      if (reqAmount > available + 0.01) {
        return `Insufficient ${assetKey}: you have ${available.toFixed(2)} but requested ${reqAmount}`;
      }
      return null;
    },
    [balanceQuery.data],
  );

  const handleExecuteAction = useCallback(
    async (toolName: string, input: unknown): Promise<{ success: boolean; data: unknown }> => {
      if (!agent) throw new Error('Not authenticated');
      const sdk = await agent.getInstance();
      const inp = (input ?? {}) as Record<string, unknown>;

      switch (toolName) {
        case 'save_deposit': {
          const res = await sdk.save({ amount: Number(inp.amount), asset: inp.asset as string | undefined, protocol: inp.protocol as string | undefined });
          balanceQuery.refetch();
          const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'negative');
          return { success: true, data: { success: true, tx: res.tx, amount: actual ?? inp.amount, asset: inp.asset } };
        }
        case 'withdraw': {
          const res = await sdk.withdraw({ amount: Number(inp.amount), asset: inp.asset as string | undefined, protocol: inp.protocol as string | undefined });
          balanceQuery.refetch();
          const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'positive');
          return { success: true, data: { success: true, tx: res.tx, amount: actual ?? inp.amount, asset: inp.asset } };
        }
        case 'send_transfer': {
          const rawTo = String(inp.to);
          const resolvedTo = contactsHook.resolveContact(rawTo) ?? rawTo;
          const res = await sdk.send({ to: resolvedTo, amount: Number(inp.amount), asset: inp.asset as string | undefined });
          balanceQuery.refetch();
          const actual = parseActualAmount(res.balanceChanges, inp.asset as string, 'negative');
          return { success: true, data: { success: true, tx: res.tx, amount: actual ?? inp.amount, to: rawTo } };
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
            const swap = buildSwapDisplayData(res.balanceChanges, String(inp.from), String(inp.to), Number(inp.amount));
            return {
              success: true,
              data: {
                success: true,
                tx: res.tx,
                ...swap,
                from: swap.fromToken,
                to: swap.toToken,
                amount: inp.amount,
              },
            };
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
          try {
            const serviceResult = await sdk.payService({
              url: inp.url as string,
              rawBody: inp.body ? JSON.parse(String(inp.body)) : undefined,
            });
            return { success: true, data: serviceResult };
          } catch (payErr) {
            if (payErr instanceof ServiceDeliveryError) {
              return {
                success: false,
                data: {
                  error: payErr.message,
                  paymentConfirmed: true,
                  paymentDigest: payErr.paymentDigest,
                  doNotRetry: true,
                  warning: 'Payment was already charged on-chain. DO NOT call pay_api again for this request. Tell the user the service failed and their payment of $' + (payErr.meta?.price ?? '?') + ' was charged. They can contact support for a refund.',
                },
              };
            }
            const msg = payErr instanceof Error ? payErr.message : String(payErr);
            return { success: false, data: { error: msg } };
          }
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

  const heldAmount = useCallback(
    (symbol: string): number => {
      const sym = symbol.toUpperCase();
      if (sym === 'USDC') return balance.usdc;
      if (sym === 'SUI') return balance.sui;
      return balance.assetBalances[symbol] ?? balance.assetBalances[sym] ?? 0;
    },
    [balance],
  );

  const heldUsd = useCallback(
    (symbol: string): number => {
      const sym = symbol.toUpperCase();
      if (sym === 'USDC') return balance.usdc;
      if (sym === 'SUI') return balance.suiUsd;
      return balance.assetUsdValues[symbol] ?? balance.assetUsdValues[sym] ?? 0;
    },
    [balance],
  );

  const handleSwapAmountSelect = useCallback(
    (amount: number) => {
      const from = chipFlow.state.asset ?? '';
      const held = heldAmount(from);
      const actual = amount === -1 ? held : Math.min(amount, held);
      chipFlow.selectAmount(actual);

      const toAsset = chipFlow.state.toAsset;
      if (!toAsset || !address) return;
      if (actual <= 0) return;
      fetch(`/api/swap/quote?from=${encodeURIComponent(from)}&to=${encodeURIComponent(toAsset)}&amount=${actual}&address=${address}`)
        .then((r) => r.json())
        .then((q) => {
          if (q.error) throw new Error(q.error);
          const perUnit = actual > 0 ? (q.toAmount / actual).toFixed(6) : '?';
          chipFlow.setQuote({
            toAmount: q.toAmount,
            priceImpact: Number(q.priceImpact),
            rate: `1 ${from} = ${perUnit} ${toAsset}`,
          });
        })
        .catch(() => {
          chipFlow.setQuote({ toAmount: 0, priceImpact: 0, rate: 'Quote unavailable' });
        });
    },
    [chipFlow, heldAmount, address],
  );

  const getSwapFromAssets = useCallback((): SwapAsset[] => {
    const assets: SwapAsset[] = [];
    const seen = new Set<string>();
    const allSymbols = ['USDC', 'SUI', ...Object.keys(balance.assetBalances)];
    for (const sym of allSymbols) {
      const key = sym.toUpperCase();
      if (seen.has(key)) continue;
      const amt = heldAmount(sym);
      const usd = heldUsd(sym);
      if (amt <= 0.000001 || usd < 0.01) continue;
      assets.push({ symbol: key === 'USDC' || key === 'SUI' ? key : sym, amount: amt, usdValue: usd });
      seen.add(key);
    }
    assets.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return assets;
  }, [balance, heldAmount, heldUsd]);

  const getSwapToAssets = useCallback((): SwapAsset[] => {
    const from = chipFlow.state.asset ?? '';
    const assets: SwapAsset[] = [];
    const pinned = ['USDC', 'SUI'];
    for (const sym of pinned) {
      if (sym === from) continue;
      const meta = COIN_REGISTRY[sym];
      if (meta?.tier) assets.push({ symbol: sym });
    }
    for (const [sym, meta] of Object.entries(COIN_REGISTRY)) {
      if (!meta.tier || sym === from || pinned.includes(sym)) continue;
      assets.push({ symbol: sym });
    }
    return assets;
  }, [chipFlow.state.asset]);

  const getSwapAmountPresets = useCallback((): number[] => {
    const from = chipFlow.state.asset ?? '';
    const held = heldAmount(from);
    if (held <= 0) return [];
    const dp = held >= 1 ? 100 : held >= 0.01 ? 10000 : 100000000;
    const q25 = Math.floor(held * 0.25 * dp) / dp;
    const q50 = Math.floor(held * 0.5 * dp) / dp;
    const q75 = Math.floor(held * 0.75 * dp) / dp;
    return [q25, q50, q75].filter((v) => v > 0);
  }, [chipFlow.state.asset, heldAmount]);

  const getSwapHeldAmount = useCallback((): number => {
    return heldAmount(chipFlow.state.asset ?? '');
  }, [chipFlow.state.asset, heldAmount]);

  const handleSwapFromSelect = useCallback(
    (symbol: string) => {
      const autoTarget = symbol.toUpperCase() !== 'USDC' ? 'USDC' : undefined;
      chipFlow.selectFromAsset(symbol, autoTarget);
    },
    [chipFlow],
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
        case 'swap': {
          const fromAsset = chipFlow.state.asset;
          const toAsset = chipFlow.state.toAsset;
          if (!fromAsset || !toAsset) throw new Error('Swap assets not selected');
          const swapAmount = chipFlow.state.amount ?? 0;
          const res = await sdk.swap({ from: fromAsset, to: toAsset, amount: swapAmount });
          const swapData = buildSwapDisplayData(res.balanceChanges, fromAsset, toAsset, swapAmount);
          const explorerBase = SUI_NETWORK === 'testnet'
            ? 'https://suiscan.xyz/testnet/tx'
            : 'https://suiscan.xyz/mainnet/tx';
          const swapTxUrl = res.tx ? `${explorerBase}/${res.tx}` : undefined;
          const receivedStr = swapData.toAmount != null ? swapData.toAmount.toFixed(2) : '~';
          const swapResult: ChipFlowResult = {
            success: true,
            title: `Swapped ${swapData.fromAmount.toFixed(2)} ${swapData.fromToken} for ${receivedStr} ${swapData.toToken}`,
            details: res.tx
              ? `Tx: ${res.tx.slice(0, 8)}...${res.tx.slice(-6)}`
              : 'Swap confirmed on-chain.',
            txUrl: swapTxUrl,
          };
          chipFlow.setResult(swapResult);
          feed.addItem({
            type: 'result',
            success: true,
            title: swapResult.title,
            details: swapResult.details,
            txUrl: swapTxUrl,
          });
          balanceQuery.refetch();
          setTimeout(() => balanceQuery.refetch(), 3000);
          return;
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

    if (flow === 'swap') {
      const from = chipFlow.state.asset ?? '?';
      const to = chipFlow.state.toAsset ?? '?';
      const q = chipFlow.state.quote;
      details.push({ label: 'Sell', value: `${amount} ${from}` });
      details.push({ label: 'Receive', value: q ? `~${q.toAmount.toFixed(4)} ${to}` : `Loading...` });
      if (q) {
        details.push({ label: 'Rate', value: q.rate });
        if (q.priceImpact > 0.001) {
          details.push({ label: 'Price impact', value: `${(q.priceImpact * 100).toFixed(2)}%` });
        }
      }
      details.push({ label: 'Fee', value: '0.1%' });
      details.push({ label: 'Gas', value: 'Sponsored' });
      return {
        title: `Swap ${amount} ${from} → ${to}`,
        confirmLabel: q ? `Swap ${amount} ${from}` : 'Fetching quote...',
        details,
      };
    }

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

    if (flow === 'save') {
      const apyDecimal = balance.bestSaveRate?.rate ?? balance.savingsRate;
      if (apyDecimal > 0.005) {
        const apyPct = apyDecimal * 100;
        details.push({ label: 'APY', value: `${apyPct.toFixed(1)}%` });
        const monthly = (amount * apyDecimal) / 12;
        if (monthly >= 0.01) details.push({ label: 'Est. monthly', value: `+$${monthly.toFixed(2)}` });
      }
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

  const emailModal = (
    <EmailCaptureModal
      open={emailModalOpen}
      onClose={() => setEmailModalOpen(false)}
      address={address}
      jwt={session.jwt}
      initialEmail={email}
    />
  );

  const tosBanner = !userStatus.loading && !userStatus.tosAccepted ? (
    <TosBanner onAccept={userStatus.acceptTos} />
  ) : null;

  const graceBanner = needsAllowance ? (
    <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-2">
      <GracePeriodBanner sessionsUsed={userStatus.sessionsUsed} />
    </div>
  ) : null;

  const isFirstLogin = !userStatus.loading && !userStatus.onboarded;

  const renderEmptyState = () => {
    if (isFirstLogin) {
      return (
        <FirstLoginView
          greeting={greeting}
          onSend={handleInputSubmit}
          onSave={handleWelcomeSave}
          onAsk={handleWelcomeAsk}
          onDismiss={handleWelcomeDismiss}
          usdcBalance={balanceQuery.data?.usdc ?? 0}
          hasSavings={(balanceQuery.data?.savings ?? 0) > 0}
        />
      );
    }

    const dailyYield = balance.savings > 0 && balance.savingsRate > 0
      ? (balance.savings * balance.savingsRate) / 365
      : 0;

    return (
      <NewConversationView
        greeting={greeting}
        netWorth={balance.total}
        dailyYield={dailyYield}
        savingsRate={balance.savingsRate}
        automationCount={0}
        onSend={handleInputSubmit}
        onChipClick={handleChipClick}
        activeFlow={chipFlow.state.flow}
        briefing={briefing.briefing ? {
          briefing: briefing.briefing,
          dismiss: briefing.dismiss,
          onViewReport: handleBriefingViewReport,
          onCtaClick: handleBriefingCtaClick,
        } : null}
        handledActions={dashInsights.handledActions}
        onViewHandled={() => { setActiveTab('activity'); }}
        proactive={dashInsights.proactive ? {
          ...dashInsights.proactive,
          onCtaClick: () => engine.sendMessage(dashInsights.proactive!.action),
        } : null}
        onDismissProactive={dashInsights.dismissProactive}
      />
    );
  };

  const renderActivityTab = () => (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-4">
        {briefing.briefing && (
          <div className="mb-4">
            <BriefingCard
              briefing={briefing.briefing}
              onDismiss={briefing.dismiss}
              onViewReport={handleBriefingViewReport}
              onCtaClick={handleBriefingCtaClick}
            />
          </div>
        )}
        <ActivityFeed feed={activityFeed} onAction={handleActivityAction} />
      </div>
    </div>
  );

  const renderChatView = () => (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6 pb-4 space-y-3">

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
            loading={chipFlow.state.flow === 'swap' && !chipFlow.state.quote}
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

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'swap' && !chipFlow.state.asset && (
          <SwapAssetPicker
            assets={getSwapFromAssets()}
            onSelect={handleSwapFromSelect}
            message={chipFlow.state.message ?? undefined}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'swap' && chipFlow.state.asset && !chipFlow.state.toAsset && (
          <SwapAssetPicker
            assets={getSwapToAssets()}
            onSelect={(sym) => chipFlow.selectToAsset(sym)}
            message={chipFlow.state.message ?? undefined}
          />
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow === 'swap' && chipFlow.state.asset && chipFlow.state.toAsset && (
          <div className="space-y-2">
            <AmountChips
              amounts={getSwapAmountPresets()}
              allLabel={`All ${getSwapHeldAmount() >= 0.01 ? getSwapHeldAmount().toFixed(2) : getSwapHeldAmount().toPrecision(3)} ${chipFlow.state.asset}`}
              onSelect={handleSwapAmountSelect}
              message={chipFlow.state.message ?? undefined}
              assetLabel={chipFlow.state.asset}
            />
            <div className="flex justify-end px-1">
              <button
                onClick={() => chipFlow.clearToAsset()}
                className="text-xs text-muted hover:text-foreground transition underline underline-offset-2"
              >
                Change target ({chipFlow.state.toAsset})
              </button>
            </div>
          </div>
        )}

        {chipFlow.state.phase === 'l2-chips' && chipFlow.state.flow && chipFlow.state.flow !== 'send' && chipFlow.state.flow !== 'swap' && (() => {
          const f = chipFlow.state.flow!;
          return (
            <AmountChips
              amounts={getAmountPresets(f, balance)}
              allLabel={
                f === 'withdraw' ? `All $${fmtDollar(balance.savings)}` :
                f === 'save' ? `All $${fmtDollar(balance.usdc)}` :
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
            onValidateAction={validateAction}
            agentBudget={agentBudget}
            onSendMessage={engine.sendMessage}
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
      </div>

      <div className="shrink-0 max-h-[55vh] overflow-y-auto bg-background safe-bottom z-30">
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
              {!isInFlow && contextualChips.length > 0 && (
                <ContextualChips
                  chips={contextualChips}
                  onChipFlow={handleChipClick}
                  onAgentPrompt={(prompt) => handleInputSubmit(prompt)}
                  onDismiss={handleDismissChip}
                />
              )}
              <div ref={chipExpand.containerRef}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-2 overflow-x-auto scrollbar-none flex-1">
                    <ChipBar
                      onChipClick={handleChipClick}
                      onPrompt={(prompt) => engine.sendMessage(prompt)}
                      activeFlow={chipFlow.state.flow}
                      disabled={chipFlow.state.phase === 'executing'}
                      prefetch={{ idleUsdc: balance.usdc, currentApy: balance.savingsRate }}
                      expandedChip={chipExpand.expandedChip}
                      onExpandedChange={chipExpand.setExpandedChip}
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
                {chipExpand.activeConfig && (
                  <ChipExpand
                    actions={chipExpand.activeConfig.actions}
                    chipLabel={chipExpand.activeConfig.label}
                    onSelect={(prompt) => {
                      chipExpand.close();
                      engine.sendMessage(prompt);
                    }}
                    onClose={chipExpand.close}
                  />
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
    </div>
  );

  const panelContent = (() => {
    switch (panel) {
      case 'portfolio':
        return (
          <PortfolioPanel
            address={address}
            balance={balance}
            onSendMessage={(text) => {
              handleInputSubmit(text);
            }}
          />
        );
      case 'activity':
        return (
          <ActivityPanel
            feed={activityFeed}
            onAction={handleActivityAction}
            briefing={briefing.briefing}
            onBriefingDismiss={briefing.dismiss}
            onBriefingViewReport={handleBriefingViewReport}
            onBriefingCtaClick={handleBriefingCtaClick}
          />
        );
      case 'pay':
        return (
          <PayPanel
            address={address}
            jwt={session.jwt}
            onSendMessage={handleInputSubmit}
          />
        );
      case 'automations':
        return (
          <AutomationsPanel
            address={address}
            jwt={session?.jwt ?? null}
            onSendMessage={handleInputSubmit}
          />
        );
      case 'goals':
        return session?.jwt ? (
          <GoalsPanel address={address} jwt={session.jwt} />
        ) : null;
      case 'reports':
        return (
          <ReportsPanel
            address={address}
            briefing={briefing.briefing}
            onBriefingDismiss={briefing.dismiss}
            onBriefingViewReport={() => window.open(`/report/${address}`, '_blank')}
            onBriefingCtaClick={handleBriefingCtaClick}
            onSendMessage={handleInputSubmit}
          />
        );
      case 'contacts':
        return (
          <ContactsPanel
            address={address}
            onSendMessage={handleInputSubmit}
          />
        );
      case 'store':
        return <StorePanel onSendMessage={handleInputSubmit} address={address} jwt={session.jwt} />;
      case 'settings':
        return null;
      case 'chat':
      default: {
        if (activeTab === 'activity') return renderActivityTab();
        if (isEmpty && !engine.isStreaming) return renderEmptyState();
        return renderChatView();
      }
    }
  })();

  const isChatLayout = panel === 'chat' || panel === undefined;

  return (
    <AppShell
      address={address}
      balance={balance}
      onSettingsClick={() => setSettingsOpen(true)}
      jwt={session.jwt}
      allowancePercent={allowance.balance != null ? Math.min(100, (allowance.balance / 0.50) * 100) : undefined}
      allowanceLabel={allowance.balance != null ? `$${allowance.balance.toFixed(2)} · ~${Math.max(1, Math.round(allowance.balance / 0.005))}d` : undefined}
      allowanceBalance={allowance.balance}
      activeSessionId={engine.sessionId ?? undefined}
      onLoadSession={engine.loadSession}
      onNewConversation={handleNewConversation}
    >
      {isChatLayout ? panelContent : (
        <div className="flex-1 overflow-y-auto">{panelContent}</div>
      )}
      {settingsPanel}
      {emailModal}
      {tosBanner}
      {graceBanner}
    </AppShell>
  );
}

