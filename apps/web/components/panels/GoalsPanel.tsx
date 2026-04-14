'use client';

import { useState, useMemo } from 'react';
import { useGoals, type SavingsGoal } from '@/hooks/useGoals';
import { useBalance } from '@/hooks/useBalance';
import { GoalCard } from '@/components/settings/GoalCard';
import { GoalEditor } from '@/components/settings/GoalEditor';

interface GoalsPanelProps {
  address: string;
  jwt: string;
  onSendMessage?: (text: string) => void;
}

type GoalStatus = 'on_track' | 'behind' | 'milestone' | 'complete';

function computeGoalStatus(goal: SavingsGoal, savings: number): { status: GoalStatus; milestone: number | null } {
  const current = Math.min(savings, goal.targetAmount);
  const pct = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;

  if (pct >= 100) return { status: 'complete', milestone: 100 };

  const milestones = [75, 50, 25];
  for (const m of milestones) {
    if (pct >= m) return { status: 'milestone', milestone: m };
  }

  if (goal.deadline) {
    const daysLeft = Math.max(0, (new Date(goal.deadline).getTime() - Date.now()) / 86_400_000);
    const remaining = goal.targetAmount - current;
    const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : Infinity;
    const dailyYield = savings * 0.00012;
    if (dailyNeeded > dailyYield * 10 && daysLeft < 90) {
      return { status: 'behind', milestone: null };
    }
  }

  return { status: 'on_track', milestone: null };
}

const V2_GOAL_TYPES = [
  { label: 'Wealth goal', desc: 'Track total portfolio value', badge: 'Soon' },
  { label: 'Earning goal', desc: 'Store revenue + yield earned', badge: 'Soon' },
  { label: 'Investment goal', desc: 'Specific asset holdings', badge: 'Soon' },
];

export function GoalsPanel({ address, jwt, onSendMessage }: GoalsPanelProps) {
  const goalsHook = useGoals(address, jwt);
  const balanceQuery = useBalance(address);
  const savingsBalance = balanceQuery.data?.savings ?? 0;
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [dismissedMilestones, setDismissedMilestones] = useState<Set<string>>(new Set());

  const goalsWithStatus = useMemo(() =>
    goalsHook.goals.map((goal) => ({
      goal,
      ...computeGoalStatus(goal, savingsBalance),
    })),
    [goalsHook.goals, savingsBalance],
  );

  const milestoneGoals = goalsWithStatus.filter(
    (g) => (g.status === 'milestone' || g.status === 'complete') && !dismissedMilestones.has(g.goal.id),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-foreground">Goals</h2>
        <button
          onClick={() => setShowEditor(true)}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
        >
          + New Goal
        </button>
      </div>

      {savingsBalance > 0 && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted mb-1">Total Savings</p>
          <p className="font-mono text-xl text-foreground">${savingsBalance.toFixed(2)}</p>
        </div>
      )}

      {/* Milestone celebrations */}
      {milestoneGoals.map(({ goal, status, milestone }) => (
        <MilestoneCard
          key={goal.id}
          goal={goal}
          status={status}
          milestone={milestone}
          savings={savingsBalance}
          onDismiss={() => setDismissedMilestones((prev) => new Set(prev).add(goal.id))}
          onKeepSaving={() => onSendMessage?.(`Save more towards my ${goal.name} goal`)}
        />
      ))}

      {showEditor || editingGoal ? (
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
            setShowEditor(false);
          }}
          onCancel={() => { setEditingGoal(null); setShowEditor(false); }}
        />
      ) : goalsHook.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : goalsHook.goals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl mb-4">🎯</span>
          <p className="text-sm font-medium text-foreground mb-2">Save with a purpose.</p>
          <p className="text-xs text-dim max-w-[260px] mx-auto mb-6 leading-relaxed">
            Set a goal and Audric tracks your progress in every morning briefing.
          </p>
          <button
            onClick={() => onSendMessage?.('Save $500 for a trip by August')}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-6 py-2.5 hover:bg-surface transition"
          >
            &ldquo;Save $500 for a trip by August&rdquo; &rarr;
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {goalsWithStatus.map(({ goal }) => (
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

      {/* V2 goal types stub */}
      {goalsHook.goals.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-dim">More goal types</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {V2_GOAL_TYPES.map((t) => (
              <div key={t.label} className="rounded-lg border border-border bg-surface px-3 py-3 opacity-50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[12px] text-muted">{t.label}</p>
                  <span className="font-mono text-[8px] tracking-[0.1em] uppercase text-dim">{t.badge}</span>
                </div>
                <p className="text-[10px] text-dim">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MilestoneCard({
  goal,
  status,
  milestone,
  savings,
  onDismiss,
  onKeepSaving,
}: {
  goal: SavingsGoal;
  status: GoalStatus;
  milestone: number | null;
  savings: number;
  onDismiss: () => void;
  onKeepSaving: () => void;
}) {
  const current = Math.min(savings, goal.targetAmount);
  const pct = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;
  const isComplete = status === 'complete';

  return (
    <div className={`rounded-lg border px-4 py-3 ${isComplete ? 'border-success/30 bg-success/5' : 'border-info/30 bg-info/5'}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-foreground">
          {isComplete ? '✓ Goal reached!' : `🎉 Milestone reached!`}
          {isComplete && <span className="ml-1">🎊</span>}
        </p>
        <button onClick={onDismiss} className="text-dim hover:text-muted transition text-xs p-1">&times;</button>
      </div>
      <p className="text-xs text-muted mb-2">
        {goal.emoji} {goal.name} {isComplete ? `— $${goal.targetAmount} saved` : `— ${milestone}% complete`}
      </p>
      <div className="h-1.5 bg-border rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all ${isComplete ? 'bg-success' : 'bg-info'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-[11px] text-dim mb-2">
        ${current.toFixed(2)} of ${goal.targetAmount.toFixed(2)} · {pct.toFixed(0)}%
      </p>
      <div className="flex gap-2">
        <button
          onClick={onKeepSaving}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-foreground bg-foreground/10 px-3 py-1.5 rounded-full hover:bg-foreground/20 transition"
        >
          {isComplete ? 'Set a new goal' : 'Keep saving'} &rarr;
        </button>
      </div>
    </div>
  );
}
