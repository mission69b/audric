'use client';

// [PHASE 10] Settings shell — re-skinned to match
// `design_handoff_audric/.../settings.jsx`.
//
// Layout:
//   • Header strip (border-bottom): "← Back to chat" left + "SETTINGS"
//     mono eyebrow right.
//   • Two-pane below: 220px sub-nav (border-right, pill items) + scroll
//     content area (max-w-640, mono eyebrow w/ section name + bottom
//     border, then section content).
//
// Sub-nav order matches design: PASSPORT / SAFETY / MEMORY / GOALS / CONTACTS.
//
// Behavior preserved:
//   • Section state still seeded from `?section=` query param + alias map
//   • All sub-section components (Passport/Safety/Memory/GoalCard/GoalEditor/
//     Contacts) re-skinned in place — same hook wiring, same handlers.
//   • Goals editor still opens inline + uses real `useGoals` mutations.
//   • AuthGuard wrapper preserved.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';
import { useGoals, type SavingsGoal } from '@/hooks/useGoals';
import { useBalance } from '@/hooks/useBalance';
import { useUserStatus } from '@/hooks/useUserStatus';
import { GoalCard } from '@/components/settings/GoalCard';
import { GoalEditor } from '@/components/settings/GoalEditor';
import { PassportSection } from '@/components/settings/PassportSection';
import { SafetySection } from '@/components/settings/SafetySection';
import { MemorySection } from '@/components/settings/MemorySection';
import { ContactsSection } from '@/components/settings/ContactsSection';
import { SUI_NETWORK } from '@/lib/constants';

// [SIMPLIFICATION DAY 10] Settings reorganised to the canonical 5 sections
// from the simplification spec — Passport, Safety, Memory, Goals, Contacts.
// History of removals:
//   - Features      (Day 5) — allowance + notification toggles, gone with allowance flow
//   - Copilot       (Day 5) — briefing/digest/automation toggles, gone with cron stack
//   - Wallets       (Day 10) — multi-wallet linking is no longer surfaced; the API
//                              routes (`/api/user/wallets`) remain for future surfaces
//   - Sessions      (Day 10) — was a placeholder stub; chat history lives in the sidebar
// Old deep-links collapse to Passport.
type Section = 'passport' | 'safety' | 'memory' | 'goals' | 'contacts';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'passport', label: 'Passport' },
  { id: 'safety', label: 'Safety' },
  { id: 'memory', label: 'Memory' },
  { id: 'goals', label: 'Goals' },
  { id: 'contacts', label: 'Contacts' },
];

const SECTION_ALIASES: Record<string, Section> = {
  schedules: 'passport',
  automations: 'passport',
  copilot: 'passport',
  features: 'passport',
  account: 'passport',
  wallets: 'passport',
  sessions: 'passport',
};

function resolveSection(raw: string | null): Section {
  if (!raw) return 'passport';
  if (raw in SECTION_ALIASES) return SECTION_ALIASES[raw];
  if (SECTIONS.some((s) => s.id === raw)) return raw as Section;
  return 'passport';
}

function SettingsContent() {
  const { address, session, logout, refresh, expiringSoon } = useZkLogin();
  const jwt = session?.jwt ?? null;
  const goalsHook = useGoals(address, jwt ?? undefined);
  const balanceQuery = useBalance(address);
  const savingsBalance = balanceQuery.data?.savings ?? 0;
  // [S.84] Surface the user's claimed Audric handle in the Passport
  // card. `useUserStatus` already drives the dashboard's claim-gate
  // visibility, so the cache is warm by the time the user clicks into
  // settings — no extra request in the common path.
  const userStatus = useUserStatus(address, jwt ?? undefined);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showGoalEditor, setShowGoalEditor] = useState(false);

  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const section =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('section')
        : null;
    return resolveSection(section);
  });

  useEffect(() => {
    setActiveSection(resolveSection(searchParams.get('section')));
  }, [searchParams]);

  const expiresAt = session?.expiresAt ?? null;
  const activeLabel = SECTIONS.find((s) => s.id === activeSection)?.label.toUpperCase() ?? '';

  return (
    <main className="flex flex-col h-screen overflow-hidden bg-surface-page">
      {/* Header strip */}
      <header className="flex items-center justify-between px-6 sm:px-8 py-[18px] border-b border-border-subtle">
        <Link
          href="/new"
          className="inline-flex items-center gap-1.5 text-[13px] text-fg-secondary hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
        >
          <Icon name="chevron-left" size={14} />
          Back to chat
        </Link>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-secondary">
          Settings
        </span>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-[auto_1fr] md:grid-rows-none md:grid-cols-[220px_1fr] overflow-hidden">
        {/* Sub-nav */}
        <aside className="self-start md:self-auto border-b md:border-b-0 md:border-r border-border-subtle px-3 py-2.5 md:px-3.5 md:py-5 flex md:flex-col flex-row gap-1 overflow-x-auto md:overflow-y-auto md:overflow-x-visible">
          {SECTIONS.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveSection(s.id)}
                aria-current={isActive ? 'true' : undefined}
                className={[
                  'whitespace-nowrap text-left px-3 py-1.5 md:px-3.5 md:py-2.5 rounded-pill font-mono text-[10px] tracking-[0.1em] uppercase transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
                  isActive
                    ? 'bg-surface-card text-fg-primary shadow-[var(--shadow-flat)]'
                    : 'text-fg-muted hover:text-fg-primary hover:bg-surface-card',
                ].join(' ')}
              >
                {s.label}
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <section className="min-h-0 overflow-y-auto px-6 sm:px-10 py-7">
          <div className="max-w-[640px] mx-auto">
            <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted pb-2.5 border-b border-border-subtle">
              {activeLabel}
            </div>
            <div className="pt-[22px]">
              {activeSection === 'passport' && (
                <PassportSection
                  address={address}
                  network={SUI_NETWORK}
                  expiresAt={expiresAt}
                  expiringSoon={expiringSoon}
                  onRefresh={refresh}
                  onLogout={logout}
                  username={userStatus.username}
                  jwt={jwt}
                  onUsernameChanged={() => {
                    void userStatus.refetch();
                  }}
                />
              )}

              {activeSection === 'safety' && <SafetySection address={address} />}

              {activeSection === 'memory' && <MemorySection address={address} />}

              {activeSection === 'goals' && (
                <div className="flex flex-col">
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
                        type="button"
                        onClick={() => setShowGoalEditor(true)}
                        className="w-full px-3.5 py-3.5 rounded-md border border-border-strong bg-transparent font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:bg-surface-sunken transition mb-3.5 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
                      >
                        + New goal
                      </button>

                      {goalsHook.loading ? (
                        <p className="text-[13px] text-fg-secondary">Loading goals&hellip;</p>
                      ) : goalsHook.goals.length === 0 ? (
                        <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center flex flex-col items-center gap-2">
                          <span aria-hidden="true" className="text-2xl">🎯</span>
                          <p className="text-[13px] text-fg-secondary">No savings goals yet.</p>
                          <p className="text-[11px] text-fg-muted leading-relaxed max-w-xs">
                            Set a goal and track your progress as you save. You can also ask Audric
                            to create one.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
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
                        <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted leading-relaxed mt-5">
                          Goals track your total savings balance (${savingsBalance.toFixed(2)})
                          &mdash; not individual deposits.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeSection === 'contacts' && <ContactsSection address={address} />}
            </div>
          </div>
        </section>
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
