'use client';

import type { BriefingData } from '@/hooks/useOvernightBriefing';

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n > 0) return `$${n.toFixed(4).replace(/0+$/, '')}`;
  return '$0.00';
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildSummary(c: BriefingData['content']): string {
  if (c.variant === 'savings') {
    let text = `Your ${fmtUsd(c.savingsBalance)} USDC savings earned ${fmtUsd(c.earned)} overnight at ${fmtPct(c.saveApy)} APY.`;
    if (c.idleUsdc > 5) {
      text += ` You have ${fmtUsd(c.idleUsdc)} idle USDC — saving it would add ~${fmtUsd(c.projectedDailyGain)} per day.`;
    }
    return text;
  }

  if (c.variant === 'idle') {
    return `You have ${fmtUsd(c.idleUsdc)} idle USDC. Save it to start earning ${fmtPct(c.saveApy)} APY — that's ~${fmtUsd(c.idleUsdc * (c.saveApy / 365))} per day.`;
  }

  return `Your health factor is ${c.healthFactor?.toFixed(2) ?? 'N/A'} with ${fmtUsd(c.debtBalance)} in debt. Consider repaying to stay safe.`;
}

interface BriefingCardProps {
  briefing: BriefingData;
  onDismiss: () => void;
  onViewReport: () => void;
  onCtaClick?: (type: string, amount?: number) => void;
}

export function BriefingCard({ briefing, onDismiss, onViewReport, onCtaClick }: BriefingCardProps) {
  const { content, date } = briefing;
  const summary = buildSummary(content);

  return (
    <div className="rounded-xl border border-border bg-surface shadow-[var(--shadow-card)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <p className="text-xs text-muted font-medium tracking-wide">
          ☀️ Morning Briefing · {formatDate(date)}
        </p>
        <button
          onClick={onDismiss}
          className="text-dim hover:text-muted transition p-1 -m-1 rounded"
          aria-label="Dismiss briefing"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-2 gap-3 px-4 pb-3">
        <div className="bg-background rounded-lg p-3">
          <p className="text-xs text-muted mb-0.5">
            {content.variant === 'idle' ? 'Idle USDC' : 'Earned'}
          </p>
          <p className="text-lg font-semibold text-foreground font-mono">
            {content.variant === 'idle' ? fmtUsd(content.idleUsdc) : fmtUsd(content.earned)}
          </p>
          <p className="text-xs text-muted">
            {content.variant === 'idle' ? 'not earning' : 'yesterday'}
          </p>
        </div>
        <div className="bg-background rounded-lg p-3">
          <p className="text-xs text-muted mb-0.5">USDC Savings APY</p>
          <p className="text-lg font-semibold text-foreground font-mono">
            {fmtPct(content.saveApy)}
          </p>
        </div>
      </div>

      {/* Summary text */}
      <div className="px-4 pb-3">
        <p className="text-sm text-muted leading-relaxed">{summary}</p>
      </div>

      {/* Goals progress */}
      {content.goals && content.goals.length > 0 && (
        <div className="px-4 pb-3 space-y-2">
          <p className="text-xs text-muted font-medium">Goals</p>
          {content.goals.map((g) => (
            <div key={g.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">
                  {g.emoji} {g.name}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {g.progress >= 100 ? (
                    <span className="text-success">Done</span>
                  ) : (
                    <>{g.progress}%</>
                  )}
                </span>
              </div>
              <div className="h-1 rounded-full bg-foreground/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${g.progress >= 100 ? 'bg-success' : 'bg-foreground'}`}
                  style={{ width: `${g.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CTA button */}
      {content.cta && (
        <div className="px-4 pb-3">
          <button
            onClick={() => onCtaClick?.(content.cta!.type, content.cta!.amount)}
            className="w-full py-2.5 px-4 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            {content.cta.label} →
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border">
        <button
          onClick={onDismiss}
          className="text-xs text-muted hover:text-foreground transition"
        >
          Dismiss
        </button>
        <button
          onClick={onViewReport}
          className="text-xs text-foreground font-medium hover:opacity-80 transition"
        >
          View full report →
        </button>
      </div>
    </div>
  );
}
