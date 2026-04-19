import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ChevronDownIcon } from '@/lib/icons';

export interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leftIcon?: ReactNode;
  trailingChevron?: 'down' | 'up' | null;
}

export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { active = false, leftIcon, trailingChevron = null, className, children, type = 'button', ...rest },
  ref,
) {
  const baseClasses =
    'inline-flex items-center gap-1.5 h-[30px] px-3.5 rounded-pill border font-mono text-[10px] leading-[14px] tracking-[0.1em] uppercase whitespace-nowrap select-none transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]';

  const stateClasses = active
    ? 'bg-info-bg border-info-solid text-info-fg'
    : 'bg-transparent border-border-subtle text-fg-secondary hover:bg-surface-sunken hover:border-border-strong hover:text-fg-primary';

  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={active}
      className={[baseClasses, stateClasses, className ?? ''].filter(Boolean).join(' ')}
      {...rest}
    >
      {leftIcon && <span aria-hidden="true" className="shrink-0">{leftIcon}</span>}
      <span>{children}</span>
      {trailingChevron && (
        <span
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-150 ${trailingChevron === 'up' ? 'rotate-180' : ''}`}
        >
          <ChevronDownIcon width={10} height={10} />
        </span>
      )}
    </button>
  );
});
