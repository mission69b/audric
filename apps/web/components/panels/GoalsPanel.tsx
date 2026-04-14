'use client';

import { useState } from 'react';
import { useGoals, type SavingsGoal } from '@/hooks/useGoals';
import { useBalance } from '@/hooks/useBalance';
import { GoalCard } from '@/components/settings/GoalCard';
import { GoalEditor } from '@/components/settings/GoalEditor';

interface GoalsPanelProps {
  address: string;
  jwt: string;
}

export function GoalsPanel({ address, jwt }: GoalsPanelProps) {
  const goalsHook = useGoals(address, jwt);
  const balanceQuery = useBalance(address);
  const savingsBalance = balanceQuery.data?.savings ?? 0;
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showEditor, setShowEditor] = useState(false);

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

      {/* Current savings summary */}
      {savingsBalance > 0 && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted mb-1">Total Savings</p>
          <p className="font-mono text-xl text-foreground">${savingsBalance.toFixed(2)}</p>
        </div>
      )}

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
          onCancel={() => {
            setEditingGoal(null);
            setShowEditor(false);
          }}
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
          <p className="text-sm text-muted mb-2">No savings goals yet</p>
          <p className="text-xs text-dim max-w-md mb-6 leading-relaxed">
            Set a goal to track your progress. You can also ask Audric: &ldquo;Help me save $500 by June.&rdquo;
          </p>
          <button
            onClick={() => setShowEditor(true)}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-6 py-2.5 hover:bg-surface transition"
          >
            Create Your First Goal
          </button>
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
    </div>
  );
}
