'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
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
        className="group flex items-center gap-1.5 py-1 text-fg-muted hover:text-fg-primary/60 transition-colors"
        aria-expanded={expanded}
      >
        <span
          className={cn(
            'inline-flex transition-transform duration-200',
            expanded && 'rotate-90',
          )}
          aria-hidden="true"
        >
          <Icon name="chevron-right" size={10} />
        </span>
        <span className="font-mono text-[11px] tracking-wider uppercase">
          {isStreaming ? 'Reasoning…' : 'How I evaluated this'}
        </span>
      </button>

      {expanded && (
        <div className="mt-1 ml-[18px] rounded-md border border-border-subtle bg-surface-card px-3 py-2.5">
          <p className="font-mono text-[12px] leading-[1.7] text-fg-secondary whitespace-pre-wrap break-words">
            {thinking}
          </p>
        </div>
      )}
    </div>
  );
}
