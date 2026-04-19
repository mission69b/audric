import type { ReactNode } from 'react';

export type TagTone = 'neutral' | 'green' | 'red' | 'blue' | 'yellow';

export interface TagProps {
  tone?: TagTone;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<TagTone, string> = {
  neutral: 'bg-surface-sunken text-fg-secondary border border-border-subtle',
  green: 'bg-success-bg text-success-fg border border-success-border/40',
  red: 'bg-error-bg text-error-fg border border-error-border/40',
  blue: 'bg-info-bg text-info-fg border border-info-border/40',
  yellow: 'bg-warning-bg text-warning-fg border border-warning-border/40',
};

export function Tag({ tone = 'neutral', children, className }: TagProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-xs px-1.5 py-px font-mono text-[9px] leading-[14px] uppercase tracking-[0.1em] whitespace-nowrap select-none',
        TONE_CLASSES[tone],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}
