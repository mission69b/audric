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
import { GoalCard } from '@/components/settings/GoalCard';
import { GoalEditor } from '@/components/settings/GoalEditor';
import { PassportSection } from '@/components/settings/PassportSection';
import { SafetySection } from '@/components/settings/SafetySection';
import { FeaturesSection } from '@/components/settings/FeaturesSection';
import { MemorySection } from '@/components/settings/MemorySection';
import { WalletsSection } from '@/components/settings/WalletsSection';
import { SchedulesSection } from '@/components/settings/SchedulesSection';
import { SUI_NETWORK } from '@/lib/constants';

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

function SettingsContent() {
  const { address, session, logout, refresh, expiringSoon } = useZkLogin();
  const jwt = session?.jwt ?? null;
  const { prefs, loading: prefsLoading, toggling, toggle } = useNotificationPrefs(address, jwt);
  const allowance = useAllowanceStatus(address);
  const goalsHook = useGoals(address, jwt ?? undefined);
  const balanceQuery = useBalance(address);
  const savingsBalance = balanceQuery.data?.savings ?? 0;
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showGoalEditor, setShowGoalEditor] = useState(false);

  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const section = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('section')
      : null;
    if (section === 'account') return 'passport' as Section;
    return (section && SECTIONS.some((s) => s.id === section)) ? section as Section : 'passport';
  });

  useEffect(() => {
    const section = searchParams.get('section');
    if (section && SECTIONS.some((s) => s.id === section)) {
      setActiveSection(section as Section);
    }
  }, [searchParams]);

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
                className={`whitespace-nowrap px-3 py-2 rounded-full font-mono text-[10px] tracking-[0.08em] uppercase transition text-left ${
                  activeSection === s.id
                    ? 'bg-[var(--n700)] text-foreground'
                    : 'text-muted hover:text-foreground hover:bg-[var(--n700)]/50'
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
              <WalletsSection address={address} jwt={jwt} />
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
              <SchedulesSection address={address} jwt={jwt} />
            )}

            {activeSection === 'goals' && (
              <section className="space-y-5">
                <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
                  Savings Goals
                </h2>

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
                <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
                  Contacts
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  Your saved contacts will appear here. Send to an address and you&apos;ll be prompted to save it.
                </p>
              </section>
            )}

            {activeSection === 'sessions' && (
              <section className="space-y-5">
                <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
                  Conversations
                </h2>
                <p className="text-sm text-muted leading-relaxed">
                  Chat history and session management will appear here.
                </p>
              </section>
            )}

            {activeSection === 'memory' && (
              <MemorySection address={address} />
            )}
          </div>
        </div>
      </div>
    </main>
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
