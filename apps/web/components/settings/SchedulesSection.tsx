'use client';

import { useScheduledActions } from '@/hooks/useScheduledActions';

interface SchedulesSectionProps {
  address: string;
  jwt: string | null;
}

const STAGE_LABELS: Record<number, string> = {
  0: 'Detected',
  1: 'Proposed',
  2: 'Confirmed',
  3: 'Autonomous',
};

const PATTERN_LABELS: Record<string, string> = {
  recurring_save: 'Recurring Save',
  yield_reinvestment: 'Yield Reinvestment',
  debt_discipline: 'Debt Discipline',
  idle_usdc_tolerance: 'Idle USDC Sweep',
  swap_pattern: 'Regular Swap',
};

export function SchedulesSection({ address, jwt }: SchedulesSectionProps) {
  const schedules = useScheduledActions(address, jwt);

  return (
    <section className="space-y-5">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
        Schedules &amp; Automations
      </h2>
      <p className="text-sm text-muted leading-relaxed">
        User-created schedules and auto-detected patterns. Patterns start as proposals — accept to activate. After 3 confirmed executions, they become fully autonomous.
      </p>
      {schedules.loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : schedules.actions.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface/50 p-6 text-center">
          <p className="text-sm text-muted">No automations yet.</p>
          <p className="text-xs text-dim mt-1 leading-relaxed">
            As you use Audric, I&apos;ll learn your financial patterns and suggest automations.
            You can also create one by saying &ldquo;save $50 every Friday.&rdquo;
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.actions.map((action) => {
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
              statusLabel = `${action.confirmationsCompleted}/${action.confirmationsRequired} confirmed`;
              statusClass = 'bg-accent/10 text-accent';
            }

            const nextRun = action.enabled && !isPaused
              ? new Date(action.nextRunAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              : '—';
            const verb = action.actionType === 'save' ? 'Save' : action.actionType === 'swap' ? 'Swap' : 'Repay';

            return (
              <div key={action.id} className="rounded-xl border border-border bg-surface/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {verb} ${action.amount.toFixed(2)} {action.asset}
                      </p>
                      <span className={`font-mono text-[9px] tracking-wider uppercase px-1.5 py-0.5 rounded ${
                        isBehavior ? 'bg-amber-500/10 text-amber-400' : 'bg-surface text-muted'
                      }`}>
                        {isBehavior ? (PATTERN_LABELS[action.patternType ?? ''] ?? 'Auto-detected') : 'User'}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">Next: {nextRun}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isBehavior && (
                      <span className="text-[10px]" title={`Stage ${action.stage}`}>
                        {action.stage <= 1 ? '◯' : action.stage === 2 ? '◑' : '●'}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                {action.enabled && !isAutonomous && !isProposal && (
                  <div className="mb-3">
                    <div className="h-1.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all"
                        style={{ width: `${(action.confirmationsCompleted / action.confirmationsRequired) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {action.totalExecutions > 0
                      ? `${action.totalExecutions} executions · $${action.totalAmountUsdc.toFixed(2)} total`
                      : isProposal ? `${Math.round((action.confidence ?? 0) * 100)}% confidence` : 'No executions yet'}
                  </span>
                  <div className="flex gap-2">
                    {isProposal && (
                      <>
                        <button
                          onClick={() => schedules.acceptProposal(action.id)}
                          disabled={schedules.updating === action.id}
                          className="text-foreground bg-foreground/10 px-2 py-0.5 rounded hover:bg-foreground/20 transition"
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
                        {(action.enabled && !isPaused) ? (
                          <button
                            onClick={() => isBehavior ? schedules.pausePattern(action.id) : schedules.pauseAction(action.id)}
                            disabled={schedules.updating === action.id}
                            className="text-muted hover:text-foreground transition"
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={() => isBehavior ? schedules.resumePattern(action.id) : schedules.resumeAction(action.id)}
                            disabled={schedules.updating === action.id}
                            className="text-accent hover:text-accent/80 transition"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={() => schedules.deleteAction(action.id)}
                          disabled={schedules.updating === action.id}
                          className="text-error hover:text-error/80 transition"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
