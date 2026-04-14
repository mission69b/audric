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
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-4">
      <h2 className="font-heading text-lg text-foreground">Reports</h2>

      {/* Weekly income summary */}
      <TaskCard
        badge="Last Sunday"
        badgeClass="bg-success/10 text-success"
        time="weekly"
        title="Weekly income summary"
        onClick={() => onSendMessage("Show me this week's full income and financial summary")}
      >
        <div className="rounded-lg border border-border overflow-hidden my-2">
          <IncomeRow label="Yield earned" value="$0.04" />
          <IncomeRow label="Payments received" value="$0.00" />
          <IncomeRow label="Store sales" value="$0.00" border={false} />
          <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02]">
            <span className="text-[11px] text-[var(--n300)] font-medium">Total income</span>
            <span className="font-mono text-[12px] text-foreground font-medium">$0.04</span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onSendMessage("Show me last week's full income and financial summary report"); }}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
          >
            Full report →
          </button>
        </div>
      </TaskCard>

      {/* Wallet Intelligence Report */}
      <TaskCard
        badge="Public · no signup"
        badgeClass="bg-success/10 text-success"
        time="any Sui address"
        title="Wallet Intelligence Report"
        desc={`audric.ai/report/${address?.slice(0, 6)}...${address?.slice(-4)} · yield efficiency, payment history, store activity, what Audric would do`}
        onClick={() => onSendMessage('Show me my wallet intelligence report')}
      >
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onSendMessage('Show me my wallet intelligence report'); }}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-background bg-foreground px-3 py-1.5 rounded-full hover:opacity-90 transition"
          >
            View report
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`https://audric.ai/report/${address}`); }}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
          >
            Copy link
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onSendMessage('Analyze another wallet address'); }}
            className="font-mono text-[10px] tracking-[0.06em] uppercase text-info border border-info/30 px-3 py-1.5 rounded-full hover:bg-info/10 transition"
          >
            Analyze another →
          </button>
        </div>
      </TaskCard>

      {/* Morning briefing */}
      {briefing ? (
        <div className="space-y-2">
          <h3 className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted">Today&apos;s Briefing</h3>
          <BriefingCard
            briefing={briefing}
            onDismiss={onBriefingDismiss}
            onViewReport={onBriefingViewReport}
            onCtaClick={onBriefingCtaClick}
          />
        </div>
      ) : (
        <TaskCard
          badge="Tomorrow 8am"
          badgeClass="bg-[rgba(155,127,232,.1)] text-[rgba(155,127,232,1)]"
          time="daily"
          title={`Morning briefing · ${new Date(Date.now() + 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          desc="Balance · overnight yield · income this week · one action item · delivered 8am your timezone"
          onClick={() => onSendMessage("Show me today's morning briefing in full")}
        >
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={(e) => { e.stopPropagation(); onSendMessage("Show me yesterday's morning briefing"); }}
              className="font-mono text-[10px] tracking-[0.06em] uppercase text-foreground border border-border px-3 py-1.5 rounded-full hover:bg-surface transition"
            >
              Yesterday →
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onSendMessage('Change my morning briefing delivery time'); }}
              className="font-mono text-[10px] tracking-[0.06em] uppercase text-info border border-info/30 px-3 py-1.5 rounded-full hover:bg-info/10 transition"
            >
              Change time →
            </button>
          </div>
        </TaskCard>
      )}
    </div>
  );
}

function TaskCard({
  badge,
  badgeClass,
  time,
  title,
  desc,
  onClick,
  children,
}: {
  badge: string;
  badgeClass: string;
  time: string;
  title: string;
  desc?: string;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className="rounded-lg border border-border bg-surface p-4 cursor-pointer hover:border-border-bright transition"
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`font-mono text-[9px] tracking-wider uppercase px-2 py-0.5 rounded-full ${badgeClass}`}>
          {badge}
        </span>
        <span className="font-mono text-[10px] text-dim">{time}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {desc && <p className="text-[11px] text-dim leading-relaxed mt-1">{desc}</p>}
      {children}
    </div>
  );
}

function IncomeRow({ label, value, border = true }: { label: string; value: string; border?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${border ? 'border-b border-border' : ''}`}>
      <span className="text-[11px] text-muted">{label}</span>
      <span className="font-mono text-[11px] text-success">{value}</span>
    </div>
  );
}
