// [PHASE 13] Marketing — browser-chrome frame used by the
// "Inside Audric" product screenshot band on the landing page.
//
// Reference: `audric-marketing/index.html` `.product-frame` block.
// Renders a faux browser bar (3 traffic-light dots + centered URL) above
// the children. Pure presentational — children are responsible for their
// own grid (sidebar + main).

import type { ReactNode } from 'react';

interface BrowserFrameProps {
  url: string;
  children: ReactNode;
  className?: string;
}

export function BrowserFrame({ url, children, className }: BrowserFrameProps) {
  return (
    <div
      className={[
        'rounded-md overflow-hidden border border-border-subtle bg-surface-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_20px_40px_-20px_rgba(0,0,0,0.10)]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-border-subtle bg-surface-sunken">
        <span className="w-2 h-2 rounded-full bg-fg-disabled" aria-hidden="true" />
        <span className="w-2 h-2 rounded-full bg-fg-disabled" aria-hidden="true" />
        <span className="w-2 h-2 rounded-full bg-fg-disabled" aria-hidden="true" />
        <span className="flex-1 text-center font-mono text-[10px] tracking-[0.1em] text-fg-secondary">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}
