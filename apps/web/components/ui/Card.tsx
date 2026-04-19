import { useId, type ReactNode } from 'react';

export type CardSurface = 'card' | 'sunken';

export interface CardProps {
  /** Inner padding in pixels. 0 = no padding. Common values: 0, 14, 16. */
  pad?: 0 | 14 | 16;
  /** Optional header title — renders a header strip with bottom border. */
  title?: ReactNode;
  /** Optional right-aligned slot in the header strip. */
  right?: ReactNode;
  /** Background surface. Defaults to `card` (white on light page). */
  surface?: CardSurface;
  className?: string;
  children: ReactNode;
}

const SURFACE_CLASSES: Record<CardSurface, string> = {
  card: 'bg-surface-card',
  sunken: 'bg-surface-sunken',
};

// Literal class strings — Tailwind's content scanner reads these by regex,
// so dynamic interpolation like `p-[${pad}px]` is silently dropped at build.
const PAD_CLASSES: Record<0 | 14 | 16, string> = {
  0: '',
  14: 'p-[14px]',
  16: 'p-[16px]',
};

export function Card({
  pad = 16,
  title,
  right,
  surface = 'card',
  className,
  children,
}: CardProps) {
  const titleId = useId();
  const hasHeader = title !== undefined || right !== undefined;
  const isLabelled = title !== undefined;

  return (
    <section
      role={isLabelled ? 'region' : undefined}
      aria-labelledby={isLabelled ? titleId : undefined}
      className={[
        'rounded-md border border-border-subtle overflow-hidden',
        SURFACE_CLASSES[surface],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {hasHeader && (
        <header className="flex items-center justify-between gap-3 px-[14px] py-2.5 border-b border-border-subtle">
          {title !== undefined ? (
            <h3
              id={titleId}
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-secondary"
            >
              {title}
            </h3>
          ) : (
            <span />
          )}
          {right !== undefined && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={PAD_CLASSES[pad]}>{children}</div>
    </section>
  );
}
