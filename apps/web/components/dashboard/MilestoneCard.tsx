'use client';

import type { SavingsGoal } from '@/hooks/useGoals';

export type GoalStatus = 'on_track' | 'behind' | 'milestone' | 'complete';

interface MilestoneCardProps {
  goal: SavingsGoal;
  status: GoalStatus;
  milestone: number | null;
  savings: number;
  onDismiss: () => void;
  onKeepSaving: () => void;
}

export function MilestoneCard({
  goal,
  status,
  milestone,
  savings,
  onDismiss,
  onKeepSaving,
}: MilestoneCardProps) {
  const current = Math.min(savings, goal.targetAmount);
  const pct = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;
  const isComplete = status === 'complete';

  return (
    <div className={`rounded-lg border px-4 py-3 ${isComplete ? 'border-success/30 bg-success/[0.04]' : 'border-success/30 bg-success/[0.04]'} relative overflow-hidden`}>
      {isComplete && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-success to-transparent" />}
      <div className="flex items-center justify-between mb-2">
        <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-success">
          {isComplete ? '✓ Goal reached! 🎊' : '🎉 Milestone reached!'}
        </p>
        <button onClick={onDismiss} className="text-dim hover:text-muted transition text-xs p-1">&times;</button>
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        {goal.emoji} {goal.name} — {isComplete ? `$${goal.targetAmount} saved` : `${milestone}% complete`}
      </p>
      <p className="text-[11px] text-dim mb-2">
        ${current.toFixed(2)} of ${goal.targetAmount.toFixed(2)} · {pct.toFixed(0)}%
      </p>
      <div className="h-1 bg-border rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full bg-success transition-all"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onKeepSaving}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1.5 rounded-full hover:opacity-90 transition"
        >
          {isComplete ? 'Set a new goal' : 'Keep saving'} →
        </button>
      </div>
    </div>
  );
}
