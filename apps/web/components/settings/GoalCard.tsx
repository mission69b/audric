'use client';

import { useState } from 'react';
import type { SavingsGoal } from '@/hooks/useGoals';

interface GoalCardProps {
  goal: SavingsGoal;
  savingsBalance: number;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}

export function GoalCard({ goal, savingsBalance, onEdit, onDelete, deleting }: GoalCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const progress = Math.min(savingsBalance / goal.targetAmount, 1);
  const pct = Math.round(progress * 100);
  const remaining = Math.max(goal.targetAmount - savingsBalance, 0);
  const isComplete = pct >= 100;

  const deadlineStr = goal.deadline
    ? new Date(goal.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="rounded-lg border border-border bg-surface/50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{goal.emoji}</span>
          <div className="min-w-0">
            <h4 className="text-sm text-foreground font-medium truncate">{goal.name}</h4>
            {deadlineStr && (
              <p className="font-mono text-[10px] tracking-wider text-muted uppercase mt-0.5">
                by {deadlineStr}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center justify-center h-7 w-7 rounded text-muted hover:text-foreground hover:bg-surface transition"
            title="Edit goal"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onDelete}
                disabled={deleting}
                className="font-mono text-[9px] tracking-wider text-error uppercase px-1.5 py-1 hover:opacity-70 transition disabled:opacity-50"
              >
                {deleting ? '...' : 'Yes'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="font-mono text-[9px] tracking-wider text-muted uppercase px-1.5 py-1 hover:text-foreground transition"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center h-7 w-7 rounded text-dim hover:text-error hover:bg-error/10 transition"
              title="Delete goal"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-success' : 'bg-foreground'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-wider text-muted">
            {isComplete ? (
              <span className="text-success">Goal reached</span>
            ) : (
              <>${remaining.toFixed(2)} to go</>
            )}
          </span>
          <span className="font-mono text-[10px] tracking-wider text-foreground">
            {pct}% &middot; ${savingsBalance.toFixed(2)} / ${goal.targetAmount.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Milestone badges */}
      {goal.currentMilestone > 0 && (
        <div className="flex gap-1">
          {[25, 50, 75, 100].map((m) => (
            <span
              key={m}
              className={`font-mono text-[9px] tracking-wider px-1.5 py-0.5 rounded ${
                goal.currentMilestone >= m
                  ? 'bg-foreground/10 text-foreground'
                  : 'bg-foreground/[0.03] text-dim'
              }`}
            >
              {m}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
