'use client';

import { BriefingCard } from '@/components/dashboard/BriefingCard';
import type { BriefingData } from '@/hooks/useOvernightBriefing';

interface ReportsPanelProps {
  address: string;
  briefing?: BriefingData | null;
  onBriefingDismiss: () => void;
  onBriefingViewReport: () => void;
  onBriefingCtaClick: (type: string, amount?: number) => void;
  onSendMessage: (text: string) => void;
}

export function ReportsPanel({
  address,
  briefing,
  onBriefingDismiss,
  onBriefingViewReport,
  onBriefingCtaClick,
  onSendMessage,
}: ReportsPanelProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <h2 className="font-heading text-lg text-foreground">Reports</h2>

      {/* Morning briefing */}
      {briefing && (
        <div className="space-y-2">
          <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Today&apos;s Briefing</h3>
          <BriefingCard
            briefing={briefing}
            onDismiss={onBriefingDismiss}
            onViewReport={onBriefingViewReport}
            onCtaClick={onBriefingCtaClick}
          />
        </div>
      )}

      {/* Report actions */}
      <div className="space-y-2">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Generate Reports</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ReportAction
            icon="📊"
            title="Daily Briefing"
            description="Overnight earnings, rate changes, and actions taken"
            onClick={() => onSendMessage('Give me my daily briefing')}
          />
          <ReportAction
            icon="📈"
            title="Portfolio Analysis"
            description="Full breakdown of holdings, yields, and DeFi positions"
            onClick={() => onSendMessage('Run a full portfolio analysis')}
          />
          <ReportAction
            icon="🔍"
            title="Wallet Intelligence"
            description="Public report for any Sui wallet address"
            onClick={() => window.open(`/report/${address}`, '_blank')}
          />
          <ReportAction
            icon="💸"
            title="Spending Summary"
            description="API spend, transaction fees, and usage breakdown"
            onClick={() => onSendMessage('Show me my spending analytics for this month')}
          />
        </div>
      </div>

      {/* Historical briefings placeholder */}
      <div className="space-y-2">
        <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Past Briefings</h3>
        <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
          <p className="text-sm text-muted">Briefing history coming soon</p>
          <p className="text-xs text-dim mt-1">Past briefings will be archived here for reference.</p>
        </div>
      </div>
    </div>
  );
}

function ReportAction({ icon, title, description, onClick }: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:bg-[var(--n700)] hover:border-border-bright"
    >
      <span className="text-xl shrink-0 mt-0.5">{icon}</span>
      <div>
        <p className="font-mono text-[11px] tracking-[0.06em] uppercase text-foreground">{title}</p>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}
