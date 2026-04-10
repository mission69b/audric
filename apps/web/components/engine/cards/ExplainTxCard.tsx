'use client';

import { CardShell, SuiscanLink, fmtRelativeTime } from './primitives';

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
  return (
    <CardShell title="Transaction">
      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-dim">Status</span>
          <span className={data.status === 'success' ? 'text-emerald-400' : 'text-amber-400'}>{data.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-dim">Gas</span>
          <span className="text-foreground">{data.gasUsed}</span>
        </div>
        {data.timestamp && (
          <div className="flex justify-between">
            <span className="text-dim">Time</span>
            <span className="text-foreground">{fmtRelativeTime(data.timestamp)}</span>
          </div>
        )}
      </div>
      {data.effects.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/50 space-y-1 text-[11px]">
          {data.effects.filter((e) => e.type !== 'event').map((e, i) => {
            const match = e.description.match(/^(0x\S+)\s+(?:sent|received)\s+(.+)$/);
            const amount = match ? match[2] : e.description;
            const addr = match ? match[1] : null;
            const prefix = e.type === 'send' ? '↑ −' : '↓ +';
            return (
              <div key={i} className="flex justify-between items-baseline font-mono">
                <span className={e.type === 'send' ? 'text-amber-400' : 'text-emerald-400'}>
                  {prefix}{amount}
                </span>
                {addr && <span className="text-dim text-[10px]">{addr}</span>}
              </div>
            );
          })}
        </div>
      )}
      <SuiscanLink digest={data.digest} />
    </CardShell>
  );
}
