// [PHASE 13] Marketing — "Inside Audric / Chat is the dashboard." section.
// New section in this phase (the old monolith didn't have it). Renders a
// browser-chrome frame around a faux dashboard screenshot.
//
// CTA preserved at the bottom: invokes `useZkLogin().login`.

'use client';

import { useZkLogin } from '@/components/auth/useZkLogin';
import { BrowserFrame } from './BrowserFrame';

const SIDEBAR_TOP = [
  { glyph: '●', label: 'Dashboard', active: true },
  { glyph: '◉', label: 'Portfolio' },
  { glyph: '◎', label: 'Activity', dot: true },
  { glyph: '◈', label: 'Pay' },
  { glyph: '◇', label: 'Store' },
];

const QUICK_CHIPS = ['Save', 'Send', 'Swap', 'Credit', 'Receive', 'Charts'];

export function ProductScreenshotSection() {
  const { login } = useZkLogin();

  return (
    <section className="px-8 py-20 border-t border-border-subtle bg-surface-page">
      <div className="mx-auto max-w-[1120px] text-center">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-fg-secondary mb-4">
          Inside Audric
        </p>
        <h2 className="font-serif font-medium text-[40px] sm:text-[48px] leading-[1.02] tracking-[-0.03em] text-fg-primary mx-auto max-w-[760px]">
          Chat is the dashboard.
        </h2>
        <p className="text-[16px] text-fg-secondary leading-relaxed max-w-[580px] mx-auto mt-5 mb-10">
          Every tool call is a receipt. Every action is inspectable. Your balance, positions,
          payment links, and savings — all controlled from one conversation.
        </p>

        <BrowserFrame url="audric.ai">
          <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] min-h-[520px] bg-surface-card text-left">
            <aside className="bg-surface-sunken border-b lg:border-b-0 lg:border-r border-border-subtle p-4 flex flex-col gap-1">
              <div className="flex justify-between items-center px-2 py-1.5 mb-3">
                <div className="text-[13px] font-medium text-fg-primary">Audric</div>
                <div className="font-mono text-[8px] uppercase tracking-[0.1em] text-fg-secondary border border-border-subtle px-1.5 py-0.5 rounded-xs bg-surface-card">
                  BETA
                </div>
              </div>

              <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-fg-secondary px-2 py-2 bg-surface-sunken rounded-xs">
                + NEW CONVERSATION
              </div>

              <div className="h-2.5" aria-hidden="true" />

              {SIDEBAR_TOP.map((item) => (
                <div
                  key={item.label}
                  className={
                    item.active
                      ? 'font-mono text-[10px] uppercase tracking-[0.12em] text-fg-primary bg-border-subtle px-2 py-2 rounded-xs flex items-center gap-1.5'
                      : 'font-mono text-[10px] uppercase tracking-[0.12em] text-fg-secondary px-2 py-2 flex items-center gap-1.5'
                  }
                >
                  <span>{item.glyph}</span>
                  {item.label}
                  {item.dot && (
                    <span
                      aria-hidden="true"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-info-solid"
                    />
                  )}
                </div>
              ))}

              <div className="h-3" aria-hidden="true" />

              <div className="font-mono text-[8px] uppercase tracking-[0.14em] text-fg-muted px-2 py-1">
                RECENTS
              </div>
              <div className="px-2 py-2 text-[11px] text-fg-secondary">
                Pay link for alice
                <br />
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-fg-muted">
                  3 MSGS · 12M
                </span>
              </div>
              <div className="px-2 py-2 text-[11px] text-fg-secondary">
                Swap 1 USDC to SUI
                <br />
                <span className="font-mono text-[8px] uppercase tracking-[0.1em] text-fg-muted">
                  7 MSGS · 2H
                </span>
              </div>
            </aside>

            <div className="px-12 py-10 flex flex-col items-center gap-3.5 bg-surface-card">
              <div className="text-center">
                <div className="font-serif font-medium text-[42px] tracking-[-0.02em] text-fg-primary tabular-nums">
                  $111.53
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-secondary mt-1">
                  AVAILABLE $79 · EARNING $32
                </div>
              </div>

              <div className="w-full max-w-[520px] mt-5 bg-surface-sunken border border-border-subtle rounded-md px-4 py-3.5 flex items-center gap-3">
                <span className="text-fg-muted text-[18px] leading-none" aria-hidden="true">
                  +
                </span>
                <div className="flex-1 text-fg-muted text-[14px]">
                  Ask me anything about your money&hellip;
                </div>
                <span className="text-fg-secondary text-[13px]" aria-hidden="true">
                  🎤
                </span>
                <span
                  aria-hidden="true"
                  className="w-7 h-7 rounded-full bg-fg-primary text-fg-inverse grid place-items-center text-[12px]"
                >
                  ↑
                </span>
              </div>

              <div className="flex gap-1.5 flex-wrap justify-center mt-1">
                {QUICK_CHIPS.map((chip) => (
                  <span
                    key={chip}
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-secondary border border-border-subtle px-3 py-1.5 rounded-pill bg-surface-card"
                  >
                    {chip} ⌄
                  </span>
                ))}
              </div>

              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-fg-muted mt-7">
                GOOD AFTERNOON, FUNKIIRABU
              </div>
            </div>
          </div>
        </BrowserFrame>

        <div className="mt-8">
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2 bg-fg-primary text-fg-inverse px-6 py-3.5 rounded-xs font-mono text-[11px] tracking-[0.08em] uppercase transition hover:opacity-80 active:scale-[0.98] cursor-pointer"
          >
            Get your Passport →
          </button>
        </div>
      </div>
    </section>
  );
}
