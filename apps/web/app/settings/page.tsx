'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { useNotificationPrefs } from '@/hooks/useNotificationPrefs';
import { useAllowanceStatus } from '@/hooks/useAllowanceStatus';
import { useGoals, type SavingsGoal } from '@/hooks/useGoals';
import { useBalance } from '@/hooks/useBalance';
import { useScheduledActions } from '@/hooks/useScheduledActions';
import { GoalCard } from '@/components/settings/GoalCard';
import { GoalEditor } from '@/components/settings/GoalEditor';
import { truncateAddress } from '@/lib/format';
import { SUI_NETWORK } from '@/lib/constants';

interface SpendingSummary {
  totalSpent: number;
  requestCount: number;
  serviceCount: number;
  period: string;
  byService: Array<{ service: string; totalSpent: number; requestCount: number }>;
}

function formatMemoryAge(extractedAt: string): string {
  const hoursAgo = (Date.now() - new Date(extractedAt).getTime()) / 3_600_000;
  if (hoursAgo < 24) return 'today';
  if (hoursAgo < 48) return 'yesterday';
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

type Section = 'account' | 'features' | 'goals' | 'safety' | 'contacts' | 'sessions' | 'memory' | 'schedules' | 'wallets';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'wallets', label: 'Wallets' },
  { id: 'features', label: 'Features' },
  { id: 'schedules', label: 'Automations' },
  { id: 'goals', label: 'Goals' },
  { id: 'safety', label: 'Safety' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'memory', label: 'Memory' },
];

const STAGE_LABELS: Record<number, string> = {
  0: 'Detected',
  1: 'Proposed',
  2: 'Confirmed',
  3: 'Autonomous',
};

const PATTERN_LABELS: Record<string, string> = {
  recurring_save: 'Recurring Save',
  yield_reinvestment: 'Yield Reinvestment',
  debt_discipline: 'Debt Discipline',
  idle_usdc_tolerance: 'Idle USDC Sweep',
  swap_pattern: 'Regular Swap',
};

const NOTIFICATION_FEATURES = [
  {
    key: 'hf_alert' as const,
    label: 'Health factor alerts',
    description: 'Get notified when your credit position is at risk of liquidation',
    free: true,
  },
  {
    key: 'briefing' as const,
    label: 'Morning briefing',
    description: 'Daily summary of your earnings, rates, and suggested actions',
    free: false,
    cost: '$0.005/day',
  },
  {
    key: 'rate_alert' as const,
    label: 'Rate change alerts',
    description: 'Get notified when USDC savings or borrow rates change significantly',
    free: true,
  },
  {
    key: 'auto_compound' as const,
    label: 'Auto-compound rewards',
    description: 'Automatically claim and re-deposit NAVX rewards into your savings',
    free: false,
    cost: '$0.005/day',
  },
];

function SettingsContent() {
  const { address, session, logout, refresh, expiringSoon } = useZkLogin();
  const jwt = session?.jwt ?? null;
  const { prefs, loading: prefsLoading, toggling, toggle } = useNotificationPrefs(address, jwt);
  const allowance = useAllowanceStatus(address);
  const goalsHook = useGoals(address, jwt ?? undefined);
  const balanceQuery = useBalance(address);
  const schedules = useScheduledActions(address, jwt);
  const savingsBalance = balanceQuery.data?.savings ?? 0;
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showGoalEditor, setShowGoalEditor] = useState(false);
  const [spending, setSpending] = useState<SpendingSummary | null>(null);

  // Linked wallets state
  const [linkedWallets, setLinkedWallets] = useState<Array<{
    id: string; suiAddress: string; label: string | null; isPrimary: boolean;
  }>>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [walletError, setWalletError] = useState('');
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletDeleting, setWalletDeleting] = useState<string | null>(null);

  const fetchSpending = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/analytics/spending?period=month`, { headers: { 'x-sui-address': address } });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.totalSpent === 'number') setSpending(data);
      }
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => { fetchSpending(); }, [fetchSpending]);

  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const section = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('section')
      : null;
    return (section && SECTIONS.some((s) => s.id === section)) ? section as Section : 'account';
  });
  const [copied, setCopied] = useState(false);
  const [financialProfile, setFinancialProfile] = useState<{
    style: string;
    notes: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [memories, setMemories] = useState<Array<{
    id: string;
    memoryType: string;
    content: string;
    confidence: number;
    extractedAt: string;
  }>>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState<string | null>(null);
  const [clearingMemories, setClearingMemories] = useState(false);

  useEffect(() => {
    const section = searchParams.get('section');
    if (section && SECTIONS.some((s) => s.id === section)) {
      setActiveSection(section as Section);
    }
  }, [searchParams]);

  const fetchWallets = useCallback(async () => {
    if (!address || !jwt) return;
    setWalletsLoading(true);
    try {
      const res = await fetch(`/api/user/wallets?address=${address}`, {
        headers: { 'x-zklogin-jwt': jwt },
      });
      if (res.ok) {
        const data = await res.json();
        setLinkedWallets(data.wallets ?? []);
      }
    } catch { /* ignore */ }
    finally { setWalletsLoading(false); }
  }, [address, jwt]);

  useEffect(() => {
    if (activeSection === 'wallets') fetchWallets();
  }, [activeSection, fetchWallets]);

  const handleAddWallet = async () => {
    if (!address || !jwt) return;
    const trimmed = newWalletAddress.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
      setWalletError('Enter a valid Sui address');
      return;
    }
    setWalletSaving(true);
    setWalletError('');
    try {
      const res = await fetch('/api/user/wallets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-zklogin-jwt': jwt },
        body: JSON.stringify({ address, suiAddress: trimmed, label: newWalletLabel.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setWalletError(data.error ?? 'Failed to link wallet');
        return;
      }
      setNewWalletAddress('');
      setNewWalletLabel('');
      await fetchWallets();
    } catch { setWalletError('Network error'); }
    finally { setWalletSaving(false); }
  };

  const handleRemoveWallet = async (id: string) => {
    if (!address || !jwt) return;
    setWalletDeleting(id);
    try {
      await fetch(`/api/user/wallets/${id}?address=${address}`, {
        method: 'DELETE',
        headers: { 'x-zklogin-jwt': jwt },
      });
      setLinkedWallets((prev) => prev.filter((w) => w.id !== id));
    } catch { /* ignore */ }
    finally { setWalletDeleting(null); }
  };

  const fetchMemories = useCallback(async () => {
    if (!address) return;
    setMemoriesLoading(true);
    try {
      const res = await fetch(`/api/user/memories?address=${address}`);
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories ?? []);
      }
    } catch { /* ignore */ }
    finally { setMemoriesLoading(false); }
  }, [address]);

  useEffect(() => {
    if (activeSection !== 'memory' || !address) return;
    setProfileLoading(true);
    fetch(`/api/user/preferences?address=${address}`)
      .then((r) => r.json())
      .then((data: { limits?: Record<string, unknown> | null }) => {
        const fp = data.limits?.financialProfile as { style: string; notes: string } | null;
        setFinancialProfile(fp ?? null);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
    fetchMemories();
  }, [activeSection, address, fetchMemories]);

  const handleDeleteMemory = async (id: string) => {
    if (!address) return;
    setDeletingMemory(id);
    try {
      const res = await fetch(`/api/user/memories/${id}?address=${address}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch { /* ignore */ }
    finally { setDeletingMemory(null); }
  };

  const handleClearAllMemories = async () => {
    if (!address) return;
    setClearingMemories(true);
    try {
      const res = await fetch(`/api/user/memories?address=${address}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories([]);
      }
    } catch { /* ignore */ }
    finally { setClearingMemories(false); }
  };

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const expiresAt = session?.expiresAt;
  const expiryDate = expiresAt ? new Date(expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
    : 0;

  return (
    <main className="flex flex-1 flex-col items-center pt-10 pb-16 px-4">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/new"
            className="flex items-center gap-1 text-sm text-muted hover:text-foreground transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Back to chat
          </Link>
          <h1 className="font-mono text-xs tracking-[0.12em] text-foreground uppercase ml-auto">
            Settings
          </h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-6">
          <nav className="flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible pb-2 sm:pb-0">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition text-left ${
                  activeSection === s.id
                    ? 'bg-foreground/[0.06] text-foreground'
                    : 'text-muted hover:text-foreground hover:bg-surface'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="space-y-6">
            {activeSection === 'account' && (
              <section className="space-y-5">
                <SectionTitle>Account</SectionTitle>

                <SettingsRow label="Wallet address">
                  <span className="font-mono text-xs text-foreground">
                    {address ? truncateAddress(address) : '—'}
                  </span>
                  <button
                    onClick={handleCopy}
                    className="ml-2 font-mono text-[10px] tracking-wider text-muted uppercase hover:text-foreground transition"
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                </SettingsRow>

                <SettingsRow label="Network">
                  <span className="text-sm text-foreground capitalize">{SUI_NETWORK}</span>
                </SettingsRow>

                <SettingsRow label="Sign-in session">
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-sm text-foreground">
                      {expiryDate
                        ? `Expires ${expiryDate.toLocaleDateString()} (${daysLeft}d)`
                        : '—'}
                    </span>
                    {expiringSoon && (
                      <span className="text-xs text-warning flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                        Expiring soon
                      </span>
                    )}
                  </div>
                </SettingsRow>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => refresh()}
                    className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
                  >
                    Refresh Session
                  </button>
                  <button
                    onClick={logout}
                    className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
                  >
                    Sign Out
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'wallets' && (
              <section className="space-y-5">
                <SectionTitle>Wallets</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Link additional wallets to view aggregated portfolio data across all your addresses.
                </p>

                {/* Primary wallet */}
                <div className="rounded-xl border border-border bg-surface/50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground font-mono">
                          {address ? truncateAddress(address) : '—'}
                        </p>
                        <span className="font-mono text-[9px] tracking-wider text-success uppercase bg-success/10 px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Linked wallets */}
                {walletsLoading ? (
                  <p className="text-sm text-muted">Loading wallets...</p>
                ) : (
                  <>
                    {linkedWallets.map((w) => (
                      <div key={w.id} className="rounded-xl border border-border bg-surface/50 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-foreground font-mono">
                              {truncateAddress(w.suiAddress)}
                            </p>
                            {w.label && (
                              <p className="text-xs text-muted mt-0.5">{w.label}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleRemoveWallet(w.id)}
                            disabled={walletDeleting === w.id}
                            className="text-xs text-muted hover:text-error transition"
                          >
                            {walletDeleting === w.id ? '...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Add wallet form */}
                <div className="rounded-xl border border-border bg-surface/50 p-4 space-y-3">
                  <p className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">Add Wallet</p>
                  <input
                    type="text"
                    value={newWalletAddress}
                    onChange={(e) => { setNewWalletAddress(e.target.value); setWalletError(''); }}
                    placeholder="0x..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent"
                    spellCheck={false}
                  />
                  <input
                    type="text"
                    value={newWalletLabel}
                    onChange={(e) => setNewWalletLabel(e.target.value)}
                    placeholder="Label (optional, e.g. Cold Wallet)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-dim focus:outline-none focus:ring-1 focus:ring-accent"
                    maxLength={50}
                  />
                  {walletError && <p className="text-xs text-error">{walletError}</p>}
                  <button
                    onClick={handleAddWallet}
                    disabled={walletSaving || !newWalletAddress.trim()}
                    className={`rounded-md bg-foreground px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-background uppercase transition ${
                      walletSaving || !newWalletAddress.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90'
                    }`}
                  >
                    {walletSaving ? 'Linking...' : 'Link Wallet'}
                  </button>
                </div>
              </section>
            )}

            {activeSection === 'features' && (
              <section className="space-y-5">
                <SectionTitle>Features</SectionTitle>

                {/* Allowance budget card */}
                {allowance.loading ? (
                  <p className="text-sm text-muted">Loading budget...</p>
                ) : allowance.allowanceId ? (
                  <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">Features budget</span>
                      <span className="text-sm text-foreground font-medium">
                        ${allowance.balance !== null ? allowance.balance.toFixed(2) : '—'}
                      </span>
                    </div>
                    {allowance.balance !== null && allowance.balance < 0.05 && (
                      <p className="text-xs text-warning">
                        Budget running low. Top up to keep features active.
                      </p>
                    )}
                    <div className="flex gap-2 pt-1">
                      <Link
                        href="/setup"
                        className="rounded-md border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
                      >
                        Top Up
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                    <p className="text-sm text-muted leading-relaxed">
                      Set up a features budget to enable paid notifications like morning briefings and rate alerts.
                    </p>
                    <Link
                      href="/setup"
                      className="inline-block rounded-md bg-foreground px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-background uppercase hover:opacity-90 transition"
                    >
                      Set Up Budget
                    </Link>
                  </div>
                )}

                {/* Feature toggles */}
                <p className="text-sm text-muted leading-relaxed">
                  Control which notifications Audric sends you. Health factor alerts are always free.
                </p>
                {prefsLoading ? (
                  <p className="text-sm text-muted">Loading preferences...</p>
                ) : (
                  <div className="space-y-1">
                    {NOTIFICATION_FEATURES.map((f) => (
                      <div key={f.key} className="flex items-start justify-between py-3 border-b border-border last:border-0">
                        <div className="flex-1 mr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-foreground font-medium">{f.label}</span>
                            {f.free && (
                              <span className="font-mono text-[9px] tracking-wider text-success uppercase bg-success/10 px-1.5 py-0.5 rounded">
                                Free
                              </span>
                            )}
                            {f.cost && (
                              <span className="font-mono text-[9px] tracking-wider text-muted uppercase bg-surface px-1.5 py-0.5 rounded">
                                {f.cost}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted mt-0.5 leading-relaxed">{f.description}</p>
                        </div>
                        <button
                          onClick={() => toggle(f.key)}
                          disabled={toggling === f.key}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors mt-0.5 ${
                            prefs[f.key]
                              ? 'bg-foreground'
                              : 'bg-foreground/20'
                          } ${toggling === f.key ? 'opacity-50' : ''}`}
                          role="switch"
                          aria-checked={prefs[f.key]}
                        >
                          <span
                            className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${
                              prefs[f.key] ? 'translate-x-[18px]' : 'translate-x-[3px]'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeSection === 'schedules' && (
              <section className="space-y-5">
                <SectionTitle>Schedules &amp; Automations</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  User-created schedules and auto-detected patterns. Patterns start as proposals — accept to activate. After 3 confirmed executions, they become fully autonomous.
                </p>
                {schedules.loading ? (
                  <p className="text-sm text-muted">Loading...</p>
                ) : schedules.actions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface/50 p-6 text-center">
                    <p className="text-sm text-muted">No automations yet.</p>
                    <p className="text-xs text-dim mt-1 leading-relaxed">
                      As you use Audric, I&apos;ll learn your financial patterns and suggest automations.
                      You can also create one by saying &ldquo;save $50 every Friday.&rdquo;
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.actions.map((action) => {
                      const isBehavior = action.source === 'behavior_detected';
                      const isAutonomous = isBehavior
                        ? action.stage >= 3
                        : action.confirmationsCompleted >= action.confirmationsRequired;
                      const isPaused = !!action.pausedAt;
                      const isProposal = isBehavior && action.stage < 2 && !action.declinedAt;

                      let statusLabel: string;
                      let statusClass: string;
                      if (isPaused) {
                        statusLabel = 'Paused';
                        statusClass = 'bg-border text-muted';
                      } else if (!action.enabled) {
                        statusLabel = isProposal ? 'Proposal' : 'Disabled';
                        statusClass = isProposal ? 'bg-amber-500/10 text-amber-400' : 'bg-border text-muted';
                      } else if (isAutonomous) {
                        statusLabel = 'Autonomous';
                        statusClass = 'bg-success/10 text-success';
                      } else if (isBehavior) {
                        statusLabel = STAGE_LABELS[action.stage] ?? `Stage ${action.stage}`;
                        statusClass = 'bg-accent/10 text-accent';
                      } else {
                        statusLabel = `${action.confirmationsCompleted}/${action.confirmationsRequired} confirmed`;
                        statusClass = 'bg-accent/10 text-accent';
                      }

                      const nextRun = action.enabled && !isPaused
                        ? new Date(action.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : '—';
                      const verb = action.actionType === 'save' ? 'Save' : action.actionType === 'swap' ? 'Swap' : 'Repay';

                      return (
                        <div key={action.id} className="rounded-xl border border-border bg-surface/50 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-foreground">
                                  {verb} ${action.amount.toFixed(2)} {action.asset}
                                </p>
                                <span className={`font-mono text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded ${
                                  isBehavior ? 'bg-amber-500/10 text-amber-400' : 'bg-surface text-muted'
                                }`}>
                                  {isBehavior ? (PATTERN_LABELS[action.patternType ?? ''] ?? 'Auto-detected') : 'User'}
                                </span>
                              </div>
                              <p className="text-xs text-muted mt-0.5">Next: {nextRun}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {isBehavior && (
                                <span className="text-[10px]" title={`Stage ${action.stage}`}>
                                  {action.stage <= 1 ? '◯' : action.stage === 2 ? '◑' : '●'}
                                </span>
                              )}
                              <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
                                {statusLabel}
                              </span>
                            </div>
                          </div>

                          {/* Trust ladder progress for active non-autonomous actions */}
                          {action.enabled && !isAutonomous && !isProposal && (
                            <div className="mb-3">
                              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-accent rounded-full transition-all"
                                  style={{ width: `${(action.confirmationsCompleted / action.confirmationsRequired) * 100}%` }}
                                />
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-xs text-muted">
                            <span>
                              {action.totalExecutions > 0
                                ? `${action.totalExecutions} executions · $${action.totalAmountUsdc.toFixed(2)} total`
                                : isProposal ? `${Math.round((action.confidence ?? 0) * 100)}% confidence` : 'No executions yet'}
                            </span>
                            <div className="flex gap-2">
                              {isProposal && (
                                <>
                                  <button
                                    onClick={() => schedules.acceptProposal(action.id)}
                                    disabled={schedules.updating === action.id}
                                    className="text-foreground bg-foreground/10 px-2 py-0.5 rounded hover:bg-foreground/20 transition"
                                  >
                                    Enable
                                  </button>
                                  <button
                                    onClick={() => schedules.declineProposal(action.id)}
                                    disabled={schedules.updating === action.id}
                                    className="text-muted hover:text-foreground transition"
                                  >
                                    Decline
                                  </button>
                                </>
                              )}
                              {!isProposal && (
                                <>
                                  {(action.enabled && !isPaused) ? (
                                    <button
                                      onClick={() => isBehavior ? schedules.pausePattern(action.id) : schedules.pauseAction(action.id)}
                                      disabled={schedules.updating === action.id}
                                      className="text-muted hover:text-foreground transition"
                                    >
                                      Pause
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => isBehavior ? schedules.resumePattern(action.id) : schedules.resumeAction(action.id)}
                                      disabled={schedules.updating === action.id}
                                      className="text-accent hover:text-accent/80 transition"
                                    >
                                      Resume
                                    </button>
                                  )}
                                  <button
                                    onClick={() => schedules.deleteAction(action.id)}
                                    disabled={schedules.updating === action.id}
                                    className="text-error hover:text-error/80 transition"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {activeSection === 'goals' && (
              <section className="space-y-5">
                <SectionTitle>Savings Goals</SectionTitle>

                {showGoalEditor || editingGoal ? (
                  <GoalEditor
                    goal={editingGoal ?? undefined}
                    saving={goalsHook.creating || goalsHook.updating}
                    onSave={async (data) => {
                      if (editingGoal) {
                        await goalsHook.updateGoal(editingGoal.id, data);
                      } else {
                        await goalsHook.createGoal({
                          name: data.name,
                          emoji: data.emoji,
                          targetAmount: data.targetAmount,
                          deadline: data.deadline ?? undefined,
                        });
                      }
                      setEditingGoal(null);
                      setShowGoalEditor(false);
                    }}
                    onCancel={() => {
                      setEditingGoal(null);
                      setShowGoalEditor(false);
                    }}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => setShowGoalEditor(true)}
                      className="w-full min-h-[40px] rounded-md bg-foreground text-background font-mono text-[10px] tracking-[0.1em] uppercase hover:opacity-80 transition"
                    >
                      + New Goal
                    </button>

                    {goalsHook.loading ? (
                      <p className="text-sm text-muted">Loading goals...</p>
                    ) : goalsHook.goals.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <p className="text-2xl">🎯</p>
                        <p className="text-sm text-muted">No savings goals yet.</p>
                        <p className="text-xs text-dim leading-relaxed">
                          Set a goal and track your progress as you save. You can also ask Audric to create one.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {goalsHook.goals.map((goal) => (
                          <GoalCard
                            key={goal.id}
                            goal={goal}
                            savingsBalance={savingsBalance}
                            onEdit={() => setEditingGoal(goal)}
                            onDelete={() => goalsHook.deleteGoal(goal.id)}
                            deleting={goalsHook.deleting}
                          />
                        ))}
                      </div>
                    )}

                    {goalsHook.goals.length > 0 && (
                      <p className="font-mono text-[10px] tracking-wider text-dim uppercase leading-relaxed">
                        Goals track your total savings balance (${savingsBalance.toFixed(2)}) — not individual deposits.
                      </p>
                    )}
                  </>
                )}
              </section>
            )}

            {activeSection === 'safety' && (
              <section className="space-y-5">
                <SectionTitle>Safety</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Control spending limits and transaction safety settings.
                </p>

                {spending && spending.requestCount > 0 && (
                  <div className="rounded-xl border border-border bg-surface/50 p-4">
                    <p className="text-xs text-muted uppercase tracking-wider mb-2">API usage — {spending.period}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-foreground">${spending.totalSpent.toFixed(2)}</span>
                      <span className="text-xs text-muted">across {spending.requestCount} calls to {spending.serviceCount} service{spending.serviceCount !== 1 ? 's' : ''}</span>
                    </div>
                    {spending.byService.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                        {spending.byService.slice(0, 5).map((s) => (
                          <div key={s.service} className="flex items-center justify-between text-xs">
                            <span className="text-muted">{s.service}</span>
                            <span className="text-foreground font-mono">${s.totalSpent.toFixed(2)} <span className="text-dim">({s.requestCount})</span></span>
                          </div>
                        ))}
                        {spending.byService.length > 5 && (
                          <p className="text-[10px] text-dim">+ {spending.byService.length - 5} more</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Daily API budget */}
                <div className="rounded-xl border border-border bg-surface/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">Daily API budget</p>
                      <p className="text-xs text-muted mt-0.5">Maximum daily spend on MPP services (image gen, web search, etc.)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-sm text-muted">$</span>
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      defaultValue={1.00}
                      className="w-24 bg-background border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                      onBlur={async (e) => {
                        if (!address) return;
                        const val = parseFloat(e.target.value);
                        if (isNaN(val) || val < 0) return;
                        try {
                          await fetch('/api/user/preferences', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ address, limits: { dailyApiBudget: val } }),
                          });
                        } catch { /* ignore */ }
                      }}
                    />
                    <span className="text-xs text-muted">per day</span>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'contacts' && (
              <section className="space-y-5">
                <SectionTitle>Contacts</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Your saved contacts will appear here. Send to an address and you&apos;ll be prompted to save it.
                </p>
              </section>
            )}

            {activeSection === 'sessions' && (
              <section className="space-y-5">
                <SectionTitle>Conversations</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Chat history and session management will appear here.
                </p>
              </section>
            )}

            {activeSection === 'memory' && (
              <section className="space-y-6">
                <SectionTitle>Memory</SectionTitle>

                <p className="text-sm text-muted leading-relaxed">
                  Audric builds a picture of your financial style as you chat — personalising advice,
                  response length, and proactive suggestions over time.
                </p>

                {/* Financial profile */}
                <div className="space-y-2">
                  <h3 className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
                    Financial Profile
                  </h3>
                  {profileLoading ? (
                    <p className="text-sm text-muted">Loading...</p>
                  ) : financialProfile?.style ? (
                    <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground font-medium capitalize">
                            {financialProfile.style}
                          </span>
                          <span className="font-mono text-[9px] tracking-wider text-muted uppercase bg-background px-1.5 py-0.5 rounded">
                            Self-reported
                          </span>
                        </div>
                      </div>
                      {financialProfile.notes && (
                        <p className="text-xs text-muted leading-relaxed">{financialProfile.notes}</p>
                      )}
                      <p className="text-xs text-dim leading-relaxed">
                        Set during onboarding. Agent inferences will appear below as you use Audric.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
                      <p className="text-sm text-foreground">Building profile&hellip;</p>
                      <p className="text-xs text-muted leading-relaxed">
                        After a few sessions you&apos;ll see inferences here — things like
                        &ldquo;prefers brief responses&rdquo; or &ldquo;intermediate DeFi literacy.&rdquo;
                        You can correct any that are wrong.
                      </p>
                    </div>
                  )}
                </div>

                {/* Episodic memories (F3) */}
                <div className="space-y-2">
                  <h3 className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
                    Remembered Context
                  </h3>
                  {memoriesLoading ? (
                    <p className="text-sm text-muted">Loading memories...</p>
                  ) : memories.length === 0 ? (
                    <div className="rounded-lg border border-border bg-surface p-6 flex flex-col items-center text-center space-y-2">
                      <span className="text-2xl">🧠</span>
                      <p className="text-sm text-muted">No memories yet.</p>
                      <p className="text-xs text-dim leading-relaxed max-w-xs">
                        Audric will remember things you tell it — preferences, facts, goals — and
                        surface them automatically across sessions.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {memories.map((m) => {
                        const age = formatMemoryAge(m.extractedAt);
                        return (
                          <div
                            key={m.id}
                            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 group"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-mono text-[9px] tracking-wider text-muted uppercase bg-background px-1.5 py-0.5 rounded">
                                  {m.memoryType}
                                </span>
                                <span className="text-[10px] text-dim">{age}</span>
                              </div>
                              <p className="text-sm text-foreground leading-relaxed">{m.content}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteMemory(m.id)}
                              disabled={deletingMemory === m.id}
                              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-error text-xs p-1"
                              title="Remove memory"
                            >
                              {deletingMemory === m.id ? '...' : '✕'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Data controls */}
                <div className="pt-1 space-y-2">
                  <button
                    onClick={handleClearAllMemories}
                    disabled={clearingMemories || memories.length === 0}
                    className={`rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] uppercase transition ${
                      clearingMemories || memories.length === 0
                        ? 'text-dim opacity-50 cursor-not-allowed'
                        : 'text-muted hover:text-error hover:border-error/20'
                    }`}
                  >
                    {clearingMemories ? 'Clearing...' : 'Clear All Memory'}
                  </button>
                  <p className="text-xs text-dim">
                    Removes all remembered context. Audric will rebuild memories from future conversations.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
      {children}
    </h2>
  );
}

function SettingsRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <Suspense>
        <SettingsContent />
      </Suspense>
    </AuthGuard>
  );
}
