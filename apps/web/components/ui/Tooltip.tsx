'use client';

import type { ReactNode } from 'react';

type Side = 'top' | 'bottom' | 'left' | 'right';

const POSITION: Record<Side, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2 origin-bottom',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2 origin-top',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2 origin-right',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2 origin-left',
};

interface TooltipProps {
  label: string;
  side?: Side;
  children: ReactNode;
}

export function Tooltip({ label, side = 'bottom', children }: TooltipProps) {
  return (
    <div className="relative group/tip inline-flex">
      {children}
      <div
        role="tooltip"
        className={`
          pointer-events-none absolute z-50 whitespace-nowrap
          rounded-md bg-foreground px-2.5 py-1
          text-[11px] text-background
          opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100
          transition-all duration-150
          shadow-lg
          ${POSITION[side]}
        `}
      >
        {label}
      </div>
    </div>
  );
}
