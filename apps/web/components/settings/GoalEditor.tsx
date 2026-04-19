'use client';

import { useState } from 'react';
import type { SavingsGoal } from '@/hooks/useGoals';

interface GoalEditorProps {
  goal?: SavingsGoal;
  onSave: (data: { name: string; emoji: string; targetAmount: number; deadline?: string | null }) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

const EMOJI_SUGGESTIONS = ['🎯', '✈️', '🏠', '💻', '🎓', '🚗', '💍', '🏖️', '🎸', '💰', '🎁', '🔒'];

export function GoalEditor({ goal, onSave, onCancel, saving }: GoalEditorProps) {
  const [name, setName] = useState(goal?.name ?? '');
  const [emoji, setEmoji] = useState(goal?.emoji ?? '🎯');
  const [targetAmount, setTargetAmount] = useState(goal?.targetAmount?.toString() ?? '');
  const [deadline, setDeadline] = useState(
    goal?.deadline ? new Date(goal.deadline).toISOString().slice(0, 10) : '',
  );

  const isValid = name.trim().length > 0 && parseFloat(targetAmount) >= 0.01;

  const handleSubmit = async () => {
    if (!isValid || saving) return;
    await onSave({
      name: name.trim(),
      emoji,
      targetAmount: parseFloat(targetAmount),
      deadline: deadline || null,
    });
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-4 space-y-4">
      <h4 className="font-mono text-[10px] tracking-[0.12em] text-fg-secondary uppercase">
        {goal ? 'Edit goal' : 'New goal'}
      </h4>

      {/* Emoji picker */}
      <div className="space-y-1.5">
        <label className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary">Icon</label>
        <div className="flex flex-wrap gap-1">
          {EMOJI_SUGGESTIONS.map((e) => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`h-8 w-8 rounded-md text-base flex items-center justify-center transition ${
                emoji === e
                  ? 'bg-fg-primary/10 ring-1 ring-fg-primary/30'
                  : 'hover:bg-surface-bright'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary">Goal name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Trip to Japan"
          maxLength={100}
          className="w-full rounded-md border border-border-subtle bg-surface-page px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-fg-primary transition"
        />
      </div>

      {/* Target amount */}
      <div className="space-y-1.5">
        <label className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary">Target amount (USD)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-fg-secondary">$</span>
          <input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="500"
            min={0.01}
            step={0.01}
            className="w-full rounded-md border border-border-subtle bg-surface-page pl-7 pr-3 py-2 text-sm text-fg-primary font-mono placeholder:text-fg-muted outline-none focus:border-fg-primary transition"
          />
        </div>
      </div>

      {/* Deadline */}
      <div className="space-y-1.5">
        <label className="font-mono text-[11px] tracking-[0.08em] uppercase text-fg-secondary">Deadline (optional)</label>
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
          className="w-full rounded-md border border-border-subtle bg-surface-page px-3 py-2 text-sm text-fg-primary outline-none focus:border-fg-primary transition"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={!isValid || saving}
          className="flex-1 rounded-md bg-fg-primary py-2 font-mono text-[10px] tracking-[0.1em] text-fg-inverse uppercase hover:opacity-90 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : goal ? 'Update' : 'Create Goal'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-md border border-border-subtle px-4 py-2 font-mono text-[10px] tracking-[0.1em] text-fg-secondary uppercase hover:text-fg-primary hover:border-fg-primary/20 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
