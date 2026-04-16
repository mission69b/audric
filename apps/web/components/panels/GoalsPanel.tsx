'use client';

import { useState, useMemo } from 'react';
import { useGoals, type SavingsGoal } from '@/hooks/useGoals';
import { useBalance } from '@/hooks/useBalance';
import { GoalEditor } from '@/components/settings/GoalEditor';
import { MilestoneCard, type GoalStatus } from '@/components/dashboard/MilestoneCard';

interface GoalsPanelProps {
  address: string;
  jwt: string;
  onSendMessage?: (text: string) => void;
}

function computeGoalStatus(goal: SavingsGoal, savings: number): { status: GoalStatus; milestone: number | null; dailyEarning: number; daysAhead: number | null; shortfall: number | null; weeklyNeeded: number | null } {
  const current = Math.min(savings, goal.targetAmount);
  const pct = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;
  const dailyEarning = savings * 0.00012;

  if (pct >= 100) return { status: 'complete', milestone: 100, dailyEarning, daysAhead: null, shortfall: null, weeklyNeeded: null };

  const milestones = [75, 50, 25];
  for (const m of milestones) {
    if (pct >= m) return { status: 'milestone', milestone: m, dailyEarning, daysAhead: null, shortfall: null, weeklyNeeded: null };
  }

  if (goal.deadline) {
    const daysLeft = Math.max(0, (new Date(goal.deadline).getTime() - Date.now()) / 86_400_000);
    const remaining = goal.targetAmount - current;
    const dailyNeeded = daysLeft > 0 ? remaining / daysLeft : Infinity;
    const weeklyNeeded = dailyNeeded * 7;

    if (dailyNeeded > dailyEarning * 10 && daysLeft < 90) {
      return { status: 'behind', milestone: null, dailyEarning, daysAhead: null, shortfall: Math.round(remaining), weeklyNeeded: Math.round(weeklyNeeded) };
    }

    const daysToGoal = dailyEarning > 0 ? remaining / dailyEarning : Infinity;
    const daysAhead = Math.round(daysLeft - daysToGoal);
    return { status: 'on_track', milestone: null, dailyEarning, daysAhead: daysAhead > 0 ? daysAhead : null, shortfall: null, weeklyNeeded: null };
  }

  return { status: 'on_track', milestone: null, dailyEarning, daysAhead: null, shortfall: null, weeklyNeeded: null };
}

const V2_GOAL_TYPES = [
  { icon: '📈', label: 'Wealth goal', desc: 'Track total portfolio value — savings + wallet' },
  { icon: '💰', label: 'Earning goal', desc: 'Track yield earned + store revenue' },
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
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-4">
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
            &ldquo;Save $500 for a trip by August&rdquo; →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {goalsWithStatus.map(({ goal, status, dailyEarning, daysAhead, shortfall, weeklyNeeded }) => (
            <GoalTaskCard
              key={goal.id}
              goal={goal}
              status={status}
              savings={savingsBalance}
              dailyEarning={dailyEarning}
              daysAhead={daysAhead}
              shortfall={shortfall}
              weeklyNeeded={weeklyNeeded}
              onEdit={() => setEditingGoal(goal)}
              onSendMessage={onSendMessage}
            />
          ))}
        </div>
      )}

      {/* V2 goal types stub */}
      {goalsHook.goals.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim">More goal types</h3>
          {V2_GOAL_TYPES.map((t) => (
            <div key={t.label} className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3 opacity-50">
              <div className="flex items-center gap-3">
                <span className="text-lg">{t.icon}</span>
                <div>
                  <p className="text-[12px] text-foreground font-medium">{t.label}</p>
                  <p className="text-[10px] text-dim">{t.desc}</p>
                </div>
              </div>
              <span className="font-mono text-[9px] text-dim">SOON</span>
            </div>
          ))}
        </div>
      )}

      {/* Dashed NEW GOAL card */}
      {goalsHook.goals.length > 0 && (
        <button
          onClick={() => onSendMessage?.('Create a new savings goal')}
          className="w-full rounded-lg border border-dashed border-border bg-transparent px-4 py-3 text-left hover:border-border-bright transition"
        >
          <p className="font-mono text-[10px] tracking-[0.08em] uppercase text-dim">NEW GOAL</p>
          <p className="text-[11px] text-dim mt-0.5">&ldquo;Save $500 for a trip by August&rdquo; — tell Audric to create one →</p>
        </button>
      )}
    </div>
  );
}

function GoalTaskCard({
  goal,
  status,
  savings,
  dailyEarning,
  daysAhead,
  shortfall,
  weeklyNeeded,
  onEdit,
  onSendMessage,
}: {
  goal: SavingsGoal;
  status: GoalStatus;
  savings: number;
  dailyEarning: number;
  daysAhead: number | null;
  shortfall: number | null;
  weeklyNeeded: number | null;
  onEdit: () => void;
  onSendMessage?: (text: string) => void;
}) {
  const current = Math.min(savings, goal.targetAmount);
  const pct = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;
  const isBehind = status === 'behind';
  const isComplete = status === 'complete';
  const deadlineStr = goal.deadline
    ? new Date(goal.deadline).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : null;

  const badgeClass = isBehind
    ? 'bg-warning/10 text-warning'
    : isComplete
    ? 'bg-success/10 text-success'
    : 'bg-accent/10 text-accent';
  const badgeLabel = isBehind ? 'Behind' : isComplete ? 'Complete' : 'On track';

  const narrative = buildNarrative({ goal, current, pct, dailyEarning, daysAhead, shortfall, weeklyNeeded, isBehind, isComplete });

  return (
    <div className={`rounded-lg border bg-surface p-4 space-y-2 ${isComplete ? 'border-success/20' : isBehind ? 'border-warning/20' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full ${badgeClass}`}>{badgeLabel}</span>
          {deadlineStr && <span className="font-mono text-[10px] text-dim">{deadlineStr}</span>}
        </div>
      </div>
      <p className="text-sm font-medium text-foreground">
        {goal.emoji} {goal.name} — ${goal.targetAmount} {isComplete ? 'saved' : 'goal'}
      </p>
      <p className="text-[11px] text-dim leading-relaxed">{narrative}</p>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isBehind ? 'bg-warning' : 'bg-success'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {!isComplete && (
          <button
            onClick={() => onSendMessage?.(`Save $50 USDC toward my ${goal.name} savings goal`)}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1.5 rounded-full hover:opacity-90 transition"
          >
            {isBehind ? 'Save now' : 'Save toward goal'}
          </button>
        )}
        <button
          onClick={onEdit}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
        >
          Edit
        </button>
        {isBehind ? (
          <button
            onClick={() => onSendMessage?.(`How much do I need to save per week for my ${goal.name} goal?`)}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-info border border-info/30 px-3 py-1.5 rounded-full hover:bg-info/10 transition"
          >
            Recalculate →
          </button>
        ) : !isComplete ? (
          <button
            onClick={() => onSendMessage?.(`Am I on track for my ${goal.name} goal?`)}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-info border border-info/30 px-3 py-1.5 rounded-full hover:bg-info/10 transition"
          >
            Check pace →
          </button>
        ) : (
          <button
            onClick={() => onSendMessage?.('Create a new savings goal')}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1.5 rounded-full hover:opacity-90 transition"
          >
            Set a new goal →
          </button>
        )}
      </div>
    </div>
  );
}

function buildNarrative({ goal, current, pct, dailyEarning, daysAhead, shortfall, weeklyNeeded, isBehind, isComplete }: {
  goal: SavingsGoal; current: number; pct: number; dailyEarning: number; daysAhead: number | null; shortfall: number | null; weeklyNeeded: number | null; isBehind: boolean; isComplete: boolean;
}): string {
  const base = `$${current.toFixed(2)} of $${goal.targetAmount} · ${pct.toFixed(0)}%`;
  if (isComplete) return `${base} · took ${goal.deadline ? 'the planned period' : 'your effort'} to reach`;
  const earning = dailyEarning > 0.0001 ? ` · earning $${dailyEarning.toFixed(4)}/day toward goal` : '';
  if (isBehind && shortfall != null && weeklyNeeded != null) {
    return `${base}${earning} · at current rate you will fall $${shortfall} short · need $${weeklyNeeded} more/week`;
  }
  const ahead = daysAhead != null ? ` · ${daysAhead} days ahead of schedule` : '';
  return `${base}${earning}${ahead}`;
}

