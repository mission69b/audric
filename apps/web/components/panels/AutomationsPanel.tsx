'use client';

import { useScheduledActions, type ScheduledAction } from '@/hooks/useScheduledActions';

const STAGE_LABELS: Record<number, string> = {
  0: 'Detected',
  1: 'Proposed',
  2: 'Confirmed',
  3: 'Autonomous',
};

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
}

export function AutomationsPanel({ address, jwt, onSendMessage }: AutomationsPanelProps) {
  const schedules = useScheduledActions(address, jwt);

  const proposals = schedules.actions.filter(a => a.source === 'behavior_detected' && a.stage < 2 && !a.declinedAt);
  const active = schedules.actions.filter(a => a.enabled && !a.pausedAt && !(a.source === 'behavior_detected' && a.stage < 2));
  const paused = schedules.actions.filter(a => a.pausedAt || (!a.enabled && !proposals.includes(a)));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg text-foreground">Automations</h2>
        <button
          onClick={() => onSendMessage('Create a recurring savings schedule')}
          className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-4 py-2 hover:bg-surface transition"
        >
          + New Automation
        </button>
      </div>

      {/* Trust ladder explanation */}
      <div className="rounded-lg border border-border bg-surface px-4 py-3">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted mb-2">Trust Ladder</p>
        <div className="flex items-center gap-2 text-xs text-dim">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Detected</span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent" /> Proposed</span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-foreground" /> Confirmed</span>
          <span className="text-border">→</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> Autonomous</span>
        </div>
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
          {/* Proposals */}
          {proposals.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-amber-400">Proposals ({proposals.length})</h3>
              {proposals.map(a => (
                <AutomationCard
                  key={a.id}
                  action={a}
                  schedules={schedules}
                />
              ))}
            </div>
          )}

          {/* Active */}
          {active.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-success">Active ({active.length})</h3>
              {active.map(a => (
                <AutomationCard
                  key={a.id}
                  action={a}
                  schedules={schedules}
                />
              ))}
            </div>
          )}

          {/* Paused / Disabled */}
          {paused.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-dim">Paused ({paused.length})</h3>
              {paused.map(a => (
                <AutomationCard
                  key={a.id}
                  action={a}
                  schedules={schedules}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AutomationCard({ action, schedules }: {
  action: ScheduledAction;
  schedules: ReturnType<typeof useScheduledActions>;
}) {
  const isBehavior = action.source === 'behavior_detected';
  const isAutonomous = isBehavior
    ? action.stage >= 3
    : action.confirmationsCompleted >= action.confirmationsRequired;
  const isPaused = !!action.pausedAt;
  const isProposal = isBehavior && action.stage < 2 && !action.declinedAt;

  let statusLabel: string;
  let statusClass: string;
  if (isPaused) {
    statusLabel = 'Paused';
    statusClass = 'bg-border text-muted';
  } else if (!action.enabled) {
    statusLabel = isProposal ? 'Proposal' : 'Disabled';
    statusClass = isProposal ? 'bg-amber-500/10 text-amber-400' : 'bg-border text-muted';
  } else if (isAutonomous) {
    statusLabel = 'Autonomous';
    statusClass = 'bg-success/10 text-success';
  } else if (isBehavior) {
    statusLabel = STAGE_LABELS[action.stage] ?? `Stage ${action.stage}`;
    statusClass = 'bg-accent/10 text-accent';
  } else {
    statusLabel = `${action.confirmationsCompleted}/${action.confirmationsRequired}`;
    statusClass = 'bg-accent/10 text-accent';
  }

  const verb = action.actionType === 'save' ? 'Save' : action.actionType === 'swap' ? 'Swap' : 'Repay';
  const nextRun = action.enabled && !isPaused
    ? new Date(action.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">
            {verb} ${action.amount.toFixed(2)} {action.asset}
          </p>
          {isBehavior && (
            <span className="font-mono text-[9px] tracking-wider text-amber-400 uppercase bg-amber-500/10 px-1.5 py-0.5 rounded">
              {PATTERN_LABELS[action.patternType ?? ''] ?? 'Auto'}
            </span>
          )}
        </div>
        <span className={`font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      {/* Trust progress */}
      {action.enabled && !isAutonomous && !isProposal && (
        <div className="mb-2">
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all"
              style={{ width: `${action.confirmationsRequired > 0 ? (action.confirmationsCompleted / action.confirmationsRequired) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {nextRun && <span>Next: {nextRun} · </span>}
          {action.totalExecutions > 0
            ? `${action.totalExecutions} runs · $${action.totalAmountUsdc.toFixed(2)} total`
            : isProposal ? `${Math.round((action.confidence ?? 0) * 100)}% confidence` : 'No executions'}
        </span>
        <div className="flex gap-2">
          {isProposal && (
            <>
              <button
                onClick={() => schedules.acceptProposal(action.id)}
                disabled={schedules.updating === action.id}
                className="font-mono text-[10px] tracking-[0.08em] uppercase text-foreground bg-foreground/10 px-2.5 py-1 rounded-full hover:bg-foreground/20 transition"
              >
                Enable
              </button>
              <button
                onClick={() => schedules.declineProposal(action.id)}
                disabled={schedules.updating === action.id}
                className="text-muted hover:text-foreground transition"
              >
                Decline
              </button>
            </>
          )}
          {!isProposal && (
            <>
              {action.enabled && !isPaused ? (
                <button
                  onClick={() => isBehavior ? schedules.pausePattern(action.id) : schedules.pauseAction(action.id)}
                  disabled={schedules.updating === action.id}
                  className="text-muted hover:text-foreground transition text-xs"
                >
                  Pause
                </button>
              ) : (
                <button
                  onClick={() => isBehavior ? schedules.resumePattern(action.id) : schedules.resumeAction(action.id)}
                  disabled={schedules.updating === action.id}
                  className="text-accent hover:text-accent/80 transition text-xs"
                >
                  Resume
                </button>
              )}
              <button
                onClick={() => schedules.deleteAction(action.id)}
                disabled={schedules.updating === action.id}
                className="text-error hover:text-error/80 transition text-xs"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
