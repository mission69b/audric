// [PHASE 13] Marketing — alpha metrics + final CTA band.
// 4-up centered metrics tile, three trust tags, primary CTA, "no credit card"
// fineprint. Live numbers come from `useStats()` (extracted in this phase).
//
// Behavior preserved from the old monolith: CTA invokes `useZkLogin().login`,
// metrics fall back to em-dash when unavailable (via `fmtStat`).

'use client';

import { useZkLogin } from '@/components/auth/useZkLogin';
import { useStats, fmtStat } from '@/lib/marketing/use-stats';

const TAGS = ['Built on Sui', 'Non-custodial', 'Open source'];

export function MetricsSection() {
  const { login } = useZkLogin();
  const stats = useStats();

  const metrics = [
    { value: fmtStat(stats?.totalUsers), label: 'Users' },
    { value: fmtStat(stats?.totalTransactions), label: 'On-chain tx' },
    { value: fmtStat(stats?.totalToolExecutions), label: 'Tool calls' },
    { value: fmtStat(stats?.totalTokens), label: 'Tokens processed' },
  ];

  return (
    <section className="px-8 py-20 border-t border-border-subtle bg-surface-card">
      <div className="mx-auto max-w-[1120px]">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary text-center mb-5">
          Alpha · Early access
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-xs border border-border-subtle bg-border-subtle max-w-[820px] mx-auto overflow-hidden">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-surface-page px-5 py-6 text-center">
              <div className="font-serif font-medium text-[38px] leading-none tracking-[-0.03em] text-fg-primary tabular-nums">
                {metric.value}
              </div>
              <div className="font-mono text-[10px] tracking-[0.08em] uppercase text-fg-secondary mt-2">
                {metric.label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-6 flex-wrap">
          {TAGS.map((tag) => (
            <span
              key={tag}
              className="border border-border-subtle px-3 py-1.5 rounded-xs font-mono text-[10px] tracking-[0.08em] uppercase text-fg-secondary bg-surface-page"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="text-center mt-8">
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2 bg-fg-primary text-fg-inverse px-6 py-3.5 rounded-xs font-mono text-[12px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
          >
            Sign in with Google →
          </button>
          <p className="text-[13px] text-fg-secondary mt-2.5">Free to start. No credit card.</p>
        </div>
      </div>
    </section>
  );
}
