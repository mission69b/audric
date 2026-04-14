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
import { PassportSection } from '@/components/settings/PassportSection';
import { SafetySection } from '@/components/settings/SafetySection';
import { FeaturesSection } from '@/components/settings/FeaturesSection';
import { truncateAddress } from '@/lib/format';
import { SUI_NETWORK } from '@/lib/constants';

function formatMemoryAge(extractedAt: string): string {
  const hoursAgo = (Date.now() - new Date(extractedAt).getTime()) / 3_600_000;
  if (hoursAgo < 24) return 'today';
  if (hoursAgo < 48) return 'yesterday';
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

type Section = 'passport' | 'account' | 'features' | 'goals' | 'safety' | 'contacts' | 'sessions' | 'memory' | 'schedules' | 'wallets';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'passport', label: 'Passport' },
  { id: 'safety', label: 'Safety' },
  { id: 'features', label: 'Features' },
  { id: 'memory', label: 'Memory' },
  { id: 'wallets', label: 'Wallets' },
  { id: 'schedules', label: 'Automations' },
  { id: 'goals', label: 'Goals' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'sessions', label: 'Sessions' },
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

  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const section = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('section')
      : null;
    if (section === 'account') return 'passport' as Section;
    return (section && SECTIONS.some((s) => s.id === section)) ? section as Section : 'passport';
  });
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

  const expiresAt = session?.expiresAt ?? null;

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
            {activeSection === 'passport' && (
              <PassportSection
                address={address}
                network={SUI_NETWORK}
                expiresAt={expiresAt}
                expiringSoon={expiringSoon}
                onRefresh={refresh}
                onLogout={logout}
              />
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
              <FeaturesSection
                allowance={allowance}
                prefs={prefs}
                prefsLoading={prefsLoading}
                toggling={toggling}
                toggle={toggle}
              />
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
              <SafetySection address={address} />
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
