'use client';

import { useState, useEffect, Suspense } from 'react';
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

type Section = 'account' | 'features' | 'goals' | 'safety' | 'contacts' | 'sessions' | 'memory' | 'schedules';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'features', label: 'Features' },
  { id: 'schedules', label: 'Schedules' },
  { id: 'goals', label: 'Goals' },
  { id: 'safety', label: 'Safety' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'memory', label: 'Memory' },
];

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

  useEffect(() => {
    const section = searchParams.get('section');
    if (section && SECTIONS.some((s) => s.id === section)) {
      setActiveSection(section as Section);
    }
  }, [searchParams]);

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
  }, [activeSection, address]);

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
                <SectionTitle>Scheduled Actions</SectionTitle>
                <p className="text-sm text-muted leading-relaxed">
                  Recurring saves, swaps, and repayments created through chat. First 5 executions require your confirmation (trust ladder), then they run autonomously.
                </p>
                {schedules.loading ? (
                  <p className="text-sm text-muted">Loading schedules...</p>
                ) : schedules.actions.length === 0 ? (
                  <div className="rounded-xl border border-border bg-surface/50 p-6 text-center">
                    <p className="text-sm text-muted">No scheduled actions yet.</p>
                    <p className="text-xs text-dim mt-1">Try asking Audric to &ldquo;save $50 every Friday&rdquo;</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {schedules.actions.map((action) => {
                      const isAutonomous = action.confirmationsCompleted >= action.confirmationsRequired;
                      const statusLabel = !action.enabled ? 'Paused'
                        : isAutonomous ? 'Autonomous'
                        : `${action.confirmationsCompleted}/${action.confirmationsRequired} confirmed`;
                      const nextRun = new Date(action.nextRunAt).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric',
                      });
                      const verb = action.actionType === 'save' ? 'Save' : action.actionType === 'swap' ? 'Swap' : 'Repay';

                      return (
                        <div key={action.id} className="rounded-xl border border-border bg-surface/50 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {verb} ${action.amount.toFixed(2)} {action.asset}
                              </p>
                              <p className="text-xs text-muted mt-0.5">Next: {nextRun}</p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              !action.enabled ? 'bg-border text-muted'
                              : isAutonomous ? 'bg-success/10 text-success'
                              : 'bg-accent/10 text-accent'
                            }`}>
                              {statusLabel}
                            </span>
                          </div>

                          {/* Trust ladder progress */}
                          {action.enabled && !isAutonomous && (
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
                            <span>{action.totalExecutions} executions · ${action.totalAmountUsdc.toFixed(2)} total</span>
                            <div className="flex gap-2">
                              {action.enabled ? (
                                <button
                                  onClick={() => schedules.pauseAction(action.id)}
                                  disabled={schedules.updating === action.id}
                                  className="text-muted hover:text-foreground transition"
                                >
                                  Pause
                                </button>
                              ) : (
                                <button
                                  onClick={() => schedules.resumeAction(action.id)}
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

                {/* Episodic memories (F3 scaffold) */}
                <div className="space-y-2">
                  <h3 className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
                    Remembered Context
                  </h3>
                  <div className="rounded-lg border border-border bg-surface p-6 flex flex-col items-center text-center space-y-2">
                    <span className="text-2xl">🧠</span>
                    <p className="text-sm text-muted">No memories yet.</p>
                    <p className="text-xs text-dim leading-relaxed max-w-xs">
                      Audric will remember things you tell it — contacts, preferences, recurring
                      goals — and surface them automatically across sessions.
                    </p>
                  </div>
                </div>

                {/* Data controls */}
                <div className="pt-1 space-y-2">
                  <button
                    disabled
                    title="Memory clearing will be available in a future update"
                    className="rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-dim uppercase opacity-50 cursor-not-allowed"
                  >
                    Clear All Memory
                  </button>
                  <p className="text-xs text-dim">Memory clearing coming in a future update.</p>
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
