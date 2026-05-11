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
  // [SPEC 23B-polish, 2026-05-11] Normalize status case before comparison.
  // Engine + future tools may emit `'success'` / `'Success'` / `'SUCCESS'`
  // / `'Failure'` / etc. Pre-fix only an exact-lowercase `'success'` got
  // the green-success styling; any other casing fell through to the warning
  // branch and rendered visually as a partial failure even when the tx
  // had succeeded. The display text preserves whatever case the engine
  // sent (capitalize-as-given), only the tone-routing decision is
  // case-insensitive.
  const isSuccess = (data.status ?? '').toLowerCase() === 'success';
  return (
    <CardShell title="Transaction">
      <div className="space-y-1 font-mono text-[11px]">
        <div className="flex justify-between">
          <span className="text-fg-muted">Status</span>
          <span className={isSuccess ? 'text-success-solid' : 'text-warning-solid'}>{data.status}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fg-muted">Gas</span>
          <span className="text-fg-primary">{data.gasUsed}</span>
        </div>
        {data.timestamp && (
          <div className="flex justify-between">
            <span className="text-fg-muted">Time</span>
            <span className="text-fg-primary">{fmtRelativeTime(data.timestamp)}</span>
          </div>
        )}
      </div>
      {data.effects.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-subtle/50 space-y-1 text-[11px]">
          {data.effects.filter((e) => e.type !== 'event').map((e, i) => {
            const match = e.description.match(/^(0x\S+)\s+(?:sent|received)\s+(.+)$/);
            const amount = match ? match[2] : e.description;
            const addr = match ? match[1] : null;
            const prefix = e.type === 'send' ? '↑ −' : '↓ +';
            return (
              <div key={i} className="flex justify-between items-baseline font-mono">
                <span className={e.type === 'send' ? 'text-warning-solid' : 'text-success-solid'}>
                  {prefix}{amount}
                </span>
                {addr && <span className="text-fg-muted text-[10px]">{addr}</span>}
              </div>
            );
          })}
        </div>
      )}
      <SuiscanLink digest={data.digest} />
    </CardShell>
  );
}
