'use client';

import { CardShell, SuiscanLink, fmtRelativeTime } from './primitives';

// ExplainTxCard — `explain_tx` tool renderer. Ported from
// `apps/web/components/engine/cards/ExplainTxCard.tsx` by Phase 5a.4
// (renderer migration sweep, 2026-05-19). Verbatim.

interface TxExplanation {
  digest: string;
  sender: string;
  status: string;
  gasUsed: string;
  timestamp?: string;
  effects: { type: string; description: string }[];
  summary: string;
}

export function ExplainTxCard({ data }: { data: TxExplanation }) {
  const isSuccess = (data.status ?? '').toLowerCase() === 'success';
  return (
    <CardShell title="Transaction">
      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status</span>
          <span
            className={isSuccess ? 'text-success' : 'text-warning'}
          >
            {data.status}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Gas</span>
          <span className="text-foreground">{data.gasUsed}</span>
        </div>
        {data.timestamp && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time</span>
            <span className="text-foreground">
              {fmtRelativeTime(data.timestamp)}
            </span>
          </div>
        )}
      </div>
      {data.effects.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-1 text-[11px]">
          {data.effects
            .filter((e) => e.type !== 'event')
            .map((e, i) => {
              const match = e.description.match(
                /^(0x\S+)\s+(?:sent|received)\s+(.+)$/,
              );
              const amount = match ? match[2] : e.description;
              const addr = match ? match[1] : null;
              const prefix = e.type === 'send' ? '↑ −' : '↓ +';
              return (
                <div
                  key={i}
                  className="flex justify-between items-baseline font-mono"
                >
                  <span
                    className={
                      e.type === 'send'
                        ? 'text-warning'
                        : 'text-success'
                    }
                  >
                    {prefix}
                    {amount}
                  </span>
                  {addr && (
                    <span className="text-muted-foreground text-[10px]">{addr}</span>
                  )}
                </div>
              );
            })}
        </div>
      )}
      <SuiscanLink digest={data.digest} />
    </CardShell>
  );
}
