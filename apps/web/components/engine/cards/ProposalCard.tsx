'use client';

import { useState } from 'react';
import { CardShell } from './primitives';

const PATTERN_LABELS: Record<string, string> = {
  recurring_save: 'Recurring Save',
  yield_reinvestment: 'Yield Reinvestment',
  debt_discipline: 'Debt Discipline',
  idle_usdc_tolerance: 'Idle USDC Sweep',
  swap_pattern: 'Regular Swap',
};

const STAGE_LABELS: Record<number, string> = {
  0: 'Detected',
  1: 'Proposed',
  2: 'Confirmed',
  3: 'Autonomous',
};

export interface ProposalData {
  proposalId: string;
  patternType: string;
  actionType: string;
  amount: number;
  asset: string;
  confidence: number;
  description: string;
  schedule?: string;
  stage?: number;
}

interface ProposalCardProps {
  data: ProposalData;
  onAccept?: (proposalId: string) => void | Promise<void>;
  onDecline?: (proposalId: string) => void | Promise<void>;
}

export function ProposalCard({ data, onAccept, onDecline }: ProposalCardProps) {
  const [responding, setResponding] = useState(false);
  const [choice, setChoice] = useState<'accepted' | 'declined' | null>(null);

  const patternLabel = PATTERN_LABELS[data.patternType] ?? data.patternType.replace(/_/g, ' ');
  const stageLabel = STAGE_LABELS[data.stage ?? 0] ?? 'Unknown';
  const confidencePct = Math.round(data.confidence * 100);

  async function handleAccept() {
    setResponding(true);
    try {
      await onAccept?.(data.proposalId);
      setChoice('accepted');
    } catch {
      setResponding(false);
    }
  }

  async function handleDecline() {
    setResponding(true);
    try {
      await onDecline?.(data.proposalId);
      setChoice('declined');
    } catch {
      setResponding(false);
    }
  }

  return (
    <CardShell
      title="Behavioral Pattern"
      badge={
        <span className="text-[10px] font-mono text-amber-400">
          {stageLabel}
        </span>
      }
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono text-amber-400 border border-amber-500/20">
            {patternLabel}
          </span>
          <span className="text-[10px] font-mono text-dim">
            {confidencePct}% confidence
          </span>
        </div>

        <p className="text-xs text-foreground leading-relaxed">
          {data.description}
        </p>

        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-dim">Action:</span>
          <span className="text-foreground">
            Auto-{data.actionType} ${data.amount} {data.asset}
          </span>
          {data.schedule && (
            <>
              <span className="text-dim">Schedule:</span>
              <span className="text-foreground">{data.schedule}</span>
            </>
          )}
        </div>

        {!choice ? (
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAccept}
              disabled={responding}
              className="flex-1 rounded-md bg-foreground text-background px-3 py-1.5 text-[11px] font-mono hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              Enable this
            </button>
            <button
              onClick={handleDecline}
              disabled={responding}
              className="flex-1 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono text-dim hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50"
            >
              Not interested
            </button>
          </div>
        ) : (
          <div className="pt-1 text-[11px] font-mono">
            {choice === 'accepted' ? (
              <span className="text-emerald-400">Enabled — will run on schedule with confirmation notifications.</span>
            ) : (
              <span className="text-dim">Declined — won&apos;t suggest this again for 30 days.</span>
            )}
          </div>
        )}
      </div>
    </CardShell>
  );
}
