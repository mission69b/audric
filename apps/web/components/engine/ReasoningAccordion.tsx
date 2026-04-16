'use client';

import { useState } from 'react';
import { cn } from '@/lib/cn';

interface ReasoningAccordionProps {
  thinking: string;
  isStreaming?: boolean;
}

export function ReasoningAccordion({ thinking, isStreaming }: ReasoningAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  if (!thinking) return null;

  return (
    <div className="pl-1 mb-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="group flex items-center gap-1.5 py-1 text-dim hover:text-foreground/60 transition-colors"
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'text-[10px] leading-none transition-transform duration-200 inline-block',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        >
          ▶
        </span>
        <span className="font-mono text-[11px] tracking-wider uppercase">
          {isStreaming ? 'Reasoning…' : 'How I evaluated this'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 ml-[18px] rounded-md border border-border bg-surface px-3 py-2.5">
          <p className="font-mono text-[12px] leading-[1.7] text-muted whitespace-pre-wrap break-words">
            {thinking}
          </p>
        </div>
      )}
    </div>
  );
}
