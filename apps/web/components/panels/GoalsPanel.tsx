'use client';

// [PHASE 8] Goals panel — re-skinned to match
// `design_handoff_audric/.../goals.jsx`.
//
// Layout (820px column):
//   • <BalanceHero> at top
//   • Header row: serif "Goals" + outlined "+ NEW GOAL" pill
//   • TOTAL SAVINGS card (mono eyebrow + serif total) — always shown
//   • Per-goal cards: <Tag tone="green">ON TRACK</Tag> + ETA mono · title
//     line · stats line · 4px progress bar · 3-button row
//     (SAVE TOWARD GOAL filled / EDIT outlined / CHECK PACE → blue)
//   • MORE GOAL TYPES list (Wealth / Earning, marked SOON) — always shown
//   • Dashed NEW GOAL prompt card — always shown
//
// Behavior preserved:
//   • `useGoals` hook contract untouched (goals, loading, create/update/delete)
//   • `useBalance` self-fetch preserved — BalanceHero feeds from the same hook
//   • `computeGoalStatus` derivation untouched (status / dailyEarning / etc.)
//   • All onSendMessage prompt strings unchanged
//   • <GoalEditor> still opens inline for both new + edit (replaces the
//     goals list area, exactly as before)
//   • Tag tone derived from status (green = on_track / milestone / complete,
//     yellow = behind) — matches the existing color semantics

import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Tag, type TagTone } from '@/components/ui/Tag';
import { Icon } from '@/components/ui/Icon';
import { BalanceHero } from '@/components/ui/BalanceHero';
import { useGoals, type SavingsGoal } from '@/hooks/useGoals';
import { useBalance } from '@/hooks/useBalance';
import { GoalEditor } from '@/components/settings/GoalEditor';

// [SIMPLIFICATION DAY 5] MilestoneCard + currentMilestone column retired
// with the briefing/celebration cron stack. Goal cards still show
// progress + status; milestone celebrations are gone.
type GoalStatus = 'on_track' | 'behind' | 'milestone' | 'complete';

interface GoalsPanelProps {
  address: string;
  jwt: string;
  onSendMessage?: (text: string) => void;
}

interface GoalStatusComputed {
  status: GoalStatus;
  milestone: number | null;
  dailyEarning: number;
  daysAhead: number | null;
  shortfall: number | null;
  weeklyNeeded: number | null;
}

function computeGoalStatus(goal: SavingsGoal, savings: number): GoalStatusComputed {
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

const V2_GOAL_TYPES: { icon: string; label: string; desc: string }[] = [
  { icon: '\uD83D\uDCC8', label: 'Wealth goal', desc: 'Track total portfolio value \u2014 savings + wallet' },
  { icon: '\uD83D\uDCB0', label: 'Earning goal', desc: 'Track yield earned + store revenue' },
];

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function GoalsPanel({ address, jwt, onSendMessage }: GoalsPanelProps) {
  const goalsHook = useGoals(address, jwt);
  const balanceQuery = useBalance(address);
  const balanceData = balanceQuery.data;
  const savingsBalance = balanceData?.savings ?? 0;
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const goalsWithStatus = useMemo(
    () => goalsHook.goals.map((goal) => ({ goal, ...computeGoalStatus(goal, savingsBalance) })),
    [goalsHook.goals, savingsBalance],
  );

  const isEditing = showEditor || editingGoal !== null;

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 sm:px-6 md:px-8 py-6 flex flex-col gap-[18px]">
      <div className="pt-5 pb-4">
        <BalanceHero
          total={balanceData?.total ?? 0}
          available={balanceData?.cash ?? 0}
          earning={balanceData?.savings ?? 0}
          size="lg"
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-serif text-[24px] font-medium text-fg-primary leading-none">Goals</h2>
        <button
          type="button"
          onClick={() => { setEditingGoal(null); setShowEditor(true); }}
          className="inline-flex items-center gap-1.5 font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary bg-surface-sunken border border-border-subtle rounded-pill px-3.5 py-2 hover:bg-surface-card hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          <Icon name="plus" size={11} />
          New goal
        </button>
      </div>

      {/* TOTAL SAVINGS — always shown to match the design's prominent
          serif total. Falls back to $0.00 while the balance hook loads. */}
      <Card pad={16} surface="sunken">
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          Total savings
        </div>
        <div className="font-serif font-medium text-[32px] leading-none mt-1.5 tracking-[-0.01em] text-fg-primary">
          ${fmtUsd(savingsBalance)}
        </div>
      </Card>

      {isEditing ? (
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
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-[140px] rounded-md border border-border-subtle bg-surface-sunken animate-pulse" />
          ))}
        </div>
      ) : goalsHook.goals.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface-sunken px-6 py-10 text-center space-y-3">
          <p className="text-sm text-fg-primary font-medium">Save with a purpose.</p>
          <p className="text-[12px] text-fg-muted max-w-[280px] mx-auto leading-relaxed">
            Set a goal and Audric tracks your progress whenever you check in.
          </p>
          <button
            type="button"
            onClick={() => onSendMessage?.('Save $500 for a trip by August')}
            className="inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill border border-border-subtle bg-transparent font-mono text-[10px] leading-[14px] tracking-[0.1em] uppercase text-fg-secondary hover:bg-surface-card hover:border-border-strong hover:text-fg-primary transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            &ldquo;Save $500 for a trip by August&rdquo; &rsaquo;
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          {goalsWithStatus.map(({ goal, status, dailyEarning, daysAhead, shortfall, weeklyNeeded }) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              status={status}
              savings={savingsBalance}
              dailyEarning={dailyEarning}
              daysAhead={daysAhead}
              shortfall={shortfall}
              weeklyNeeded={weeklyNeeded}
              onEdit={() => { setShowEditor(false); setEditingGoal(goal); }}
              onSendMessage={onSendMessage}
            />
          ))}
        </div>
      )}

      {/* MORE GOAL TYPES — always shown per design. Functionally inert
          today (V2 stub), so rows are non-interactive with a SOON badge. */}
      <section aria-labelledby="goals-more-types">
        <h3
          id="goals-more-types"
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2"
        >
          More goal types
        </h3>
        <div className="flex flex-col gap-2">
          {V2_GOAL_TYPES.map((g) => (
            <div
              key={g.label}
              className="flex items-center gap-3 px-4 py-3.5 rounded-md border border-border-subtle bg-surface-sunken"
            >
              <span aria-hidden="true" className="text-lg shrink-0">{g.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-fg-primary truncate">{g.label}</div>
                <div className="text-[12px] text-fg-muted mt-0.5 truncate">{g.desc}</div>
              </div>
              <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                Soon
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Dashed NEW GOAL prompt — always shown per design. Mirrors the chip
          flow: hand off the prompt to the chat composer. */}
      <button
        type="button"
        onClick={() => onSendMessage?.('Create a new savings goal')}
        className="text-left rounded-md border border-dashed border-border-subtle bg-transparent p-[14px] hover:border-border-strong hover:bg-surface-sunken transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        <div className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
          New goal
        </div>
        <div className="text-[13px] text-fg-secondary mt-1.5">
          &ldquo;Save $500 for a trip by August&rdquo; &mdash; tell Audric to create one &rsaquo;
        </div>
      </button>
    </div>
  );
}

interface GoalCardProps extends Omit<GoalStatusComputed, 'milestone'> {
  goal: SavingsGoal;
  savings: number;
  onEdit: () => void;
  onSendMessage?: (text: string) => void;
}

const STATUS_TAG: Record<GoalStatus, { tone: TagTone; label: string }> = {
  on_track: { tone: 'green', label: 'On track' },
  milestone: { tone: 'green', label: 'On track' },
  behind: { tone: 'yellow', label: 'Behind' },
  complete: { tone: 'green', label: 'Complete' },
};

function GoalCard({
  goal,
  status,
  savings,
  dailyEarning,
  daysAhead,
  shortfall,
  weeklyNeeded,
  onEdit,
  onSendMessage,
}: GoalCardProps) {
  const current = Math.min(savings, goal.targetAmount);
  const pct = goal.targetAmount > 0 ? (current / goal.targetAmount) * 100 : 0;
  const isBehind = status === 'behind';
  const isComplete = status === 'complete';
  const deadlineStr = goal.deadline
    ? new Date(goal.deadline)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        .toUpperCase()
    : null;

  const tag = STATUS_TAG[status];
  const sub = buildSubLine({ goal, current, pct, dailyEarning, daysAhead, shortfall, weeklyNeeded, isBehind, isComplete });
  const barColor = isBehind ? 'var(--warning-solid)' : 'var(--success-solid)';

  return (
    <article
      className={[
        'rounded-md border bg-surface-sunken p-4',
        isComplete
          ? 'border-success-solid/30'
          : isBehind
            ? 'border-warning-solid/30'
            : 'border-border-subtle',
      ].join(' ')}
    >
      <div className="flex items-center gap-2.5 mb-2.5">
        <Tag tone={tag.tone}>{tag.label}</Tag>
        {deadlineStr && (
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted">
            {deadlineStr}
          </span>
        )}
      </div>

      <div className="text-[17px] font-medium text-fg-primary mb-1.5">
        {goal.emoji} {goal.name} &mdash; ${goal.targetAmount} {isComplete ? 'saved' : 'goal'}
      </div>

      <div className="text-[12px] text-fg-muted mb-3">
        {sub}
      </div>

      <div
        className="h-1 rounded-[2px] overflow-hidden bg-border-subtle mb-4"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {!isComplete && (
          <button
            type="button"
            onClick={() => onSendMessage?.(`Save $50 USDC toward my ${goal.name} savings goal`)}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary rounded-pill px-4 py-2.5 hover:opacity-90 active:scale-[0.99] transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            {isBehind ? 'Save now' : 'Save toward goal'}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary bg-transparent border border-border-subtle rounded-pill px-4 py-2.5 hover:bg-surface-card hover:border-border-strong transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          Edit
        </button>
        {isBehind ? (
          <button
            type="button"
            onClick={() => onSendMessage?.(`How much do I need to save per week for my ${goal.name} goal?`)}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-info-solid bg-transparent border border-info-solid/35 rounded-pill px-4 py-2.5 hover:bg-info-bg transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Recalculate &rsaquo;
          </button>
        ) : !isComplete ? (
          <button
            type="button"
            onClick={() => onSendMessage?.(`Am I on track for my ${goal.name} goal?`)}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-info-solid bg-transparent border border-info-solid/35 rounded-pill px-4 py-2.5 hover:bg-info-bg transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Check pace &rsaquo;
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSendMessage?.('Create a new savings goal')}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-inverse bg-fg-primary rounded-pill px-4 py-2.5 hover:opacity-90 active:scale-[0.99] transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
          >
            Set a new goal &rsaquo;
          </button>
        )}
      </div>
    </article>
  );
}

function buildSubLine({
  goal,
  current,
  pct,
  dailyEarning,
  daysAhead,
  shortfall,
  weeklyNeeded,
  isBehind,
  isComplete,
}: {
  goal: SavingsGoal;
  current: number;
  pct: number;
  dailyEarning: number;
  daysAhead: number | null;
  shortfall: number | null;
  weeklyNeeded: number | null;
  isBehind: boolean;
  isComplete: boolean;
}): string {
  const base = `$${current.toFixed(2)} of $${goal.targetAmount} \u00B7 ${pct.toFixed(0)}%`;
  if (isComplete) return `${base} \u00B7 took ${goal.deadline ? 'the planned period' : 'your effort'} to reach`;
  const earning = dailyEarning > 0.0001 ? ` \u00B7 earning $${dailyEarning.toFixed(4)}/day toward goal` : '';
  if (isBehind && shortfall != null && weeklyNeeded != null) {
    return `${base}${earning} \u00B7 at current rate you will fall $${shortfall} short \u00B7 need $${weeklyNeeded} more/week`;
  }
  const ahead = daysAhead != null ? ` \u00B7 ${daysAhead} days ahead of schedule` : '';
  return `${base}${earning}${ahead}`;
}
