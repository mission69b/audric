'use client';

// [PHASE 10] Settings → Goals sub-section card — re-skinned to match
// `design_handoff_audric/.../settings.jsx` GoalsSub block.
//
// Layout:
//   • Sunken card (padding 14)
//   • Top row: emoji + name (regular weight) + ETA mono eyebrow on left;
//     edit + close icons (text-fg-muted) on right
//   • 4px-tall progress bar (`bg-border-subtle` track / `bg-fg-primary`
//     fill, swap to `bg-success-solid` when complete)
//   • Footer row: "$X to go" left, "P% · $have / $target" right (mono)
//
// Behavior preserved:
//   • Same SavingsGoal props + same onEdit/onDelete handlers
//   • Two-step delete confirmation preserved
//   • Progress math identical (clamped 0..1, rounded percent)

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
    ? new Date(goal.deadline).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="rounded-md border border-border-subtle bg-surface-sunken p-3.5">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-1.5 min-w-0">
          <span aria-hidden="true" className="text-[14px] leading-tight">
            {goal.emoji}
          </span>
          <div className="min-w-0">
            <div className="text-[14px] text-fg-primary font-medium truncate">{goal.name}</div>
            {deadlineStr && (
              <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted mt-0.5">
                by {deadlineStr}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-fg-muted">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center justify-center h-6 w-6 rounded-xs hover:text-fg-primary hover:bg-border-subtle transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
            aria-label="Edit goal"
            title="Edit goal"
          >
            <svg
              className="h-[13px] w-[13px]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
              />
            </svg>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="font-mono text-[9px] tracking-[0.1em] uppercase text-error-fg px-1.5 py-1 hover:opacity-80 transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
              >
                {deleting ? '\u2026' : 'Yes'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-secondary px-1.5 py-1 hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center justify-center h-6 w-6 rounded-xs hover:text-error-fg hover:bg-error-bg transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              aria-label="Delete goal"
              title="Delete goal"
            >
              <svg
                className="h-[13px] w-[13px]"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="h-1 rounded-xs bg-border-subtle overflow-hidden mt-3.5 mb-2.5">
        <div
          className={`h-full transition-all duration-500 ${isComplete ? 'bg-success-solid' : 'bg-fg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>
          {isComplete ? (
            <span className="text-success-fg">Goal reached</span>
          ) : (
            <>${remaining.toFixed(2)} to go</>
          )}
        </span>
        <span className="font-mono text-fg-secondary">
          {pct}% &middot; ${savingsBalance.toFixed(2)} / ${goal.targetAmount.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
