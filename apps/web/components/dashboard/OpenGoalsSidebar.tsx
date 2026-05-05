'use client';

import { useCallback, useEffect, useState } from 'react';

// ─── SPEC 9 v0.1.3 P9.3 — persistent cross-session goals sidebar ──────────
//
// Renders the user's in-progress `Goal` rows (LLM-promoted via
// `update_todo {persist: true}`, distinct from `SavingsGoal`). Two action
// buttons per row:
//   - Dismiss → status='dismissed' (no longer relevant)
//   - Complete → status='completed' + completedAt stamp (user did it)
//
// Per v0.1.3 R5 mutations go through host-only API endpoints — there is
// NO engine tool round-trip. Engine reads goals via the daily
// `<financial_context>` block read-only.
//
// Visibility:
//   - When the user has zero in-progress goals → renders nothing
//     (this matches the system-prompt cost-trim — most users never
//      promote a goal, sidebar should disappear cleanly).
//   - On fetch error → renders nothing (fail-quiet UX surface).
//
// Refresh strategy (v1):
//   - Fetches once on mount + on `address` change.
//   - Refetches when the parent toggles `refreshKey` (host increments
//     this after every chat turn that included a `todo_update` event
//     containing `persist: true` items).
//   - SPEC 8 v0.5 reserved a `goal_updated` engine event slot; v1 doesn't
//     consume it yet — polling-on-turn-end is sufficient and avoids a
//     new engine surface for sub-second freshness on a multi-week goal
//     list.

export interface Goal {
  id: string;
  content: string;
  status: 'in_progress' | 'completed' | 'dismissed';
  sourceSessionId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface OpenGoalsSidebarProps {
  address: string;
  jwt: string | null;
  /**
   * Bump this from the parent to force a refetch (e.g. after a chat turn
   * that included `todo_update` with `persist: true` items). Pure key —
   * value content doesn't matter, only its identity.
   */
  refreshKey?: number;
}

export function OpenGoalsSidebar({
  address,
  jwt,
  refreshKey = 0,
}: OpenGoalsSidebarProps) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    if (!jwt) return;
    try {
      const res = await fetch(
        `/api/goals/list?address=${encodeURIComponent(address)}`,
        { headers: { 'x-zklogin-jwt': jwt } },
      );
      if (!res.ok) return;
      const body = (await res.json()) as { goals: Goal[] };
      setGoals(body.goals);
    } catch {
      // Fail-quiet: sidebar disappears, no error surface to the user.
    }
  }, [address, jwt]);

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals, refreshKey]);

  const mutateStatus = useCallback(
    async (goalId: string, action: 'dismiss' | 'complete') => {
      if (!jwt || busyId) return;
      setBusyId(goalId);
      try {
        const res = await fetch(`/api/goals/${action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-zklogin-jwt': jwt,
          },
          body: JSON.stringify({ address, goalId }),
        });
        if (res.ok) {
          // Optimistic-ish: drop the row from the in-progress list immediately.
          setGoals((current) =>
            current ? current.filter((g) => g.id !== goalId) : current,
          );
        }
      } catch {
        // Fail-quiet again — row stays visible; user can retry on next click.
      } finally {
        setBusyId(null);
      }
    },
    [address, jwt, busyId],
  );

  if (!goals || goals.length === 0) return null;

  return (
    <aside
      aria-label="Open goals"
      className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-card p-3"
    >
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-secondary mb-1">
        ✦ Open goals
      </div>
      {goals.map((goal) => (
        <div
          key={goal.id}
          className="flex items-start gap-2 rounded-md border border-border-subtle/50 bg-surface-page p-2"
        >
          <p className="flex-1 text-sm text-fg-primary leading-snug">{goal.content}</p>
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => void mutateStatus(goal.id, 'complete')}
              disabled={busyId === goal.id}
              className="rounded border border-border-subtle bg-surface-card px-2 py-1 text-xs font-medium text-fg-secondary transition hover:text-fg-primary disabled:opacity-50"
              aria-label={`Mark goal complete: ${goal.content}`}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => void mutateStatus(goal.id, 'dismiss')}
              disabled={busyId === goal.id}
              className="rounded border border-border-subtle bg-surface-card px-2 py-1 text-xs font-medium text-fg-muted transition hover:text-fg-secondary disabled:opacity-50"
              aria-label={`Dismiss goal: ${goal.content}`}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </aside>
  );
}
