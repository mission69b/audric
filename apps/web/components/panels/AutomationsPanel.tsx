'use client';

import { useState } from 'react';
import { useScheduledActions, type ScheduledAction } from '@/hooks/useScheduledActions';
import type { AgentActions } from '@/hooks/useAgent';

const PATTERN_LABELS: Record<string, string> = {
  recurring_save: 'Recurring Save',
  yield_reinvestment: 'Yield Reinvest',
  debt_discipline: 'Debt Discipline',
  idle_usdc_tolerance: 'Idle USDC Sweep',
  swap_pattern: 'Regular Swap',
};

interface AutomationsPanelProps {
  address: string;
  jwt: string | null;
  onSendMessage: (text: string) => void;
  getAgent?: () => Promise<AgentActions>;
}

export function AutomationsPanel({ address, jwt, onSendMessage, getAgent }: AutomationsPanelProps) {
  const schedules = useScheduledActions(address, jwt);

  const proposals = schedules.actions.filter(a => a.source === 'behavior_detected' && a.stage < 2 && !a.declinedAt);
  const confirming = schedules.actions.filter(a => {
    if (!a.enabled || a.pausedAt) return false;
    if (a.source === 'behavior_detected') return a.stage >= 2 && a.stage < (a.confirmationsRequired || 5);
    return a.confirmationsCompleted < a.confirmationsRequired;
  });
  const autonomous = schedules.actions.filter(a => {
    if (a.pausedAt || !a.enabled) return false;
    if (a.source === 'behavior_detected') return a.stage >= (a.confirmationsRequired || 5);
    return a.confirmationsCompleted >= a.confirmationsRequired;
  });
  const paused = schedules.actions.filter(a => a.pausedAt || (!a.enabled && !proposals.includes(a)));

  const todaySpent = schedules.actions
    .filter(a => a.enabled && !a.pausedAt)
    .reduce((sum, a) => sum + (a.lastExecutedAt && new Date(a.lastExecutedAt).toDateString() === new Date().toDateString() ? a.amount : 0), 0);
  const dailyLimit = 200;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-foreground">Automations</h2>
        <button
          onClick={() => onSendMessage('Create a recurring savings schedule')}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
        >
          + New Automation
        </button>
      </div>

      {schedules.loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      ) : schedules.actions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-4xl mb-4">⚡</span>
          <p className="text-sm text-muted mb-2">No automations yet</p>
          <p className="text-xs text-dim max-w-md mb-6 leading-relaxed">
            Audric learns your financial patterns and proposes automations. You can also create them
            by saying things like &ldquo;save $50 every Friday&rdquo; or &ldquo;swap idle USDC to SUI weekly.&rdquo;
          </p>
          <button
            onClick={() => onSendMessage('What automations can you set up for me?')}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-6 py-2.5 hover:bg-surface transition"
          >
            Explore Automations
          </button>
        </div>
      ) : (
        <>
          {/* Proposals — pending pattern detections */}
          {proposals.map(a => (
            <ProposalCard key={a.id} action={a} schedules={schedules} onSendMessage={onSendMessage} />
          ))}

          {/* Confirming — trust ladder in progress */}
          {confirming.map(a => (
            <ConfirmingCard key={a.id} action={a} schedules={schedules} onSendMessage={onSendMessage} getAgent={getAgent} />
          ))}

          {/* Autonomous — graduated */}
          {autonomous.map(a => (
            <AutonomousCard key={a.id} action={a} schedules={schedules} onSendMessage={onSendMessage} />
          ))}

          {/* Paused / Disabled */}
          {paused.length > 0 && (
            <div className="space-y-2 pt-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-dim">Paused</h3>
              {paused.map(a => (
                <PausedCard key={a.id} action={a} schedules={schedules} />
              ))}
            </div>
          )}

          {/* Daily autonomous spend gauge */}
          <div className="space-y-2 pt-2">
            <p className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim">Daily autonomous spend</p>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-muted">Today · ${todaySpent.toFixed(0)} of ${dailyLimit} limit</span>
                <button
                  onClick={() => onSendMessage('Change my daily autonomous spend limit')}
                  className="font-mono text-[9px] tracking-[0.06em] uppercase text-foreground border border-border px-2 py-0.5 rounded-full hover:bg-surface transition"
                >
                  Edit limit
                </button>
              </div>
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-success/70 rounded-full transition-all"
                  style={{ width: `${Math.min((todaySpent / dailyLimit) * 100, 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-dim mt-1.5">${Math.max(dailyLimit - todaySpent, 0)} remaining today</p>
            </div>
          </div>

          {/* Placeholder for new automation */}
          <button
            onClick={() => onSendMessage('What can Audric automate for me?')}
            className="w-full rounded-lg border border-dashed border-border bg-transparent px-4 py-3 hover:border-border-bright transition"
          >
            <p className="text-[11px] text-dim text-center py-1">As I learn your patterns I will propose automations here →</p>
          </button>
        </>
      )}
    </div>
  );
}

function getVerb(action: ScheduledAction): string {
  return action.actionType === 'save' ? 'Save' : action.actionType === 'swap' ? 'Swap' : 'Repay';
}

function getNextRun(action: ScheduledAction): string | null {
  if (!action.enabled || action.pausedAt) return null;
  return new Date(action.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: undefined });
}

function ProposalCard({ action, schedules, onSendMessage }: { action: ScheduledAction; schedules: ReturnType<typeof useScheduledActions>; onSendMessage: (t: string) => void }) {
  const verb = getVerb(action);
  const confidence = Math.round((action.confidence ?? 0) * 100);
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Pattern detected</span>
        <span className="font-mono text-[10px] text-dim">{action.totalExecutions > 0 ? `${action.totalExecutions} weeks in a row` : `${confidence}% confidence`}</span>
      </div>
      <p className="text-sm font-medium text-foreground">Automate {verb.toLowerCase()} — ${action.amount.toFixed(2)} {action.asset}</p>
      <p className="text-[11px] text-dim leading-relaxed">
        {PATTERN_LABELS[action.patternType ?? ''] ?? 'Detected pattern'} · confidence {confidence}% · one confirmation then fully autonomous
      </p>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => schedules.acceptProposal(action.id)}
          disabled={schedules.updating === action.id}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1.5 rounded-full hover:opacity-90 transition disabled:opacity-50"
        >
          Yes, automate it
        </button>
        <button
          onClick={() => schedules.declineProposal(action.id)}
          disabled={schedules.updating === action.id}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition disabled:opacity-50"
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function ConfirmingCard({ action, schedules, onSendMessage, getAgent }: { action: ScheduledAction; schedules: ReturnType<typeof useScheduledActions>; onSendMessage: (t: string) => void; getAgent?: () => Promise<AgentActions> }) {
  const verb = getVerb(action);
  const nextRun = getNextRun(action);
  const required = action.confirmationsRequired || 5;
  const completed = action.confirmationsCompleted;
  const remaining = required - completed;
  const awaitingConfirmation = action.source !== 'behavior_detected' && completed < required;
  const [execError, setExecError] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const handleConfirm = async () => {
    setExecError(null);
    setTxDigest(null);

    if (!getAgent) {
      schedules.confirmAction(action.id);
      return;
    }

    try {
      const agent = await getAgent();
      const result = await schedules.executeAndConfirm(action, agent);
      if (result.success) {
        setTxDigest(result.tx ?? null);
      } else {
        setExecError(result.error ?? 'Transaction failed');
      }
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Unexpected error');
    }
  };

  return (
    <div className={`rounded-lg border bg-surface p-4 space-y-2 ${awaitingConfirmation ? 'border-accent/40' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-accent/10 text-accent">
          {awaitingConfirmation ? 'Awaiting confirmation' : `Stage ${completed} / ${required}`}
        </span>
        {nextRun && <span className="font-mono text-[10px] text-dim">next: {nextRun}</span>}
      </div>
      <p className="text-sm font-medium text-foreground">{verb} ${action.amount.toFixed(2)} {action.asset}</p>
      <p className="text-[11px] text-dim leading-relaxed">
        {remaining} more confirmation{remaining !== 1 ? 's' : ''} until fully autonomous · ${action.totalAmountUsdc.toFixed(2)} total executed
      </p>
      {/* Trust ladder dots */}
      <div className="flex items-center gap-[5px] py-1">
        {Array.from({ length: required }).map((_, i) => (
          <span key={i} className={`text-[10px] ${i < completed ? 'text-success' : 'text-border-bright'}`}>
            {i < completed ? '●' : '○'}
          </span>
        ))}
        <span className="text-[10px] text-dim ml-1">
          {completed} of {required} · {remaining} more until autonomous
        </span>
      </div>
      <div className="h-1 bg-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent rounded-full transition-all"
          style={{ width: `${(completed / required) * 100}%` }}
        />
      </div>

      {txDigest && (
        <p className="text-[11px] text-success">
          ✓ Executed · <a href={`https://suiscan.xyz/mainnet/tx/${txDigest}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">view tx</a>
        </p>
      )}
      {execError && (
        <p className="text-[11px] text-error">{execError}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleConfirm}
          disabled={schedules.updating === action.id}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1.5 rounded-full hover:opacity-90 transition disabled:opacity-50"
        >
          {schedules.updating === action.id ? 'Executing...' : `Confirm ${verb.toLowerCase()}`}
        </button>
        <button
          onClick={() => action.source === 'behavior_detected' ? schedules.pausePattern(action.id) : schedules.pauseAction(action.id)}
          disabled={schedules.updating === action.id}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition disabled:opacity-50"
        >
          Pause
        </button>
        <button
          onClick={() => onSendMessage(`Edit my ${verb.toLowerCase()} automation for ${action.amount} ${action.asset}`)}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function AutonomousCard({ action, schedules, onSendMessage }: { action: ScheduledAction; schedules: ReturnType<typeof useScheduledActions>; onSendMessage: (t: string) => void }) {
  const verb = getVerb(action);
  const nextRun = getNextRun(action);

  return (
    <div className="rounded-lg border border-success/20 bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full bg-success/10 text-success">
          Autonomous ✓
        </span>
        {nextRun && <span className="font-mono text-[10px] text-dim">next: {nextRun}</span>}
      </div>
      <p className="text-sm font-medium text-foreground">{verb} ${action.amount.toFixed(2)} {action.asset}</p>
      <p className="text-[11px] text-dim leading-relaxed">
        Confirmed {action.confirmationsCompleted} times. Running silently. Audric executes and notifies you after each one.
      </p>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => action.source === 'behavior_detected' ? schedules.pausePattern(action.id) : schedules.pauseAction(action.id)}
          disabled={schedules.updating === action.id}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition disabled:opacity-50"
        >
          Pause
        </button>
        <button
          onClick={() => onSendMessage(`Require my approval for the ${verb.toLowerCase()} ${action.amount} ${action.asset} automation going forward`)}
          className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
        >
          Require approval
        </button>
      </div>
    </div>
  );
}

function PausedCard({ action, schedules }: { action: ScheduledAction; schedules: ReturnType<typeof useScheduledActions> }) {
  const verb = getVerb(action);
  return (
    <div className="rounded-lg border border-border bg-surface p-4 opacity-60">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{verb} ${action.amount.toFixed(2)} {action.asset}</p>
        <div className="flex gap-2">
          <button
            onClick={() => action.source === 'behavior_detected' ? schedules.resumePattern(action.id) : schedules.resumeAction(action.id)}
            disabled={schedules.updating === action.id}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-accent hover:text-accent/80 transition disabled:opacity-50"
          >
            Resume
          </button>
          <button
            onClick={() => schedules.deleteAction(action.id)}
            disabled={schedules.updating === action.id}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-error hover:text-error/80 transition disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
