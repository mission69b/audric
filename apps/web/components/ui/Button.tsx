import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[11px] tracking-[0.06em] gap-1.5',
  md: 'h-10 px-4 text-[12px] tracking-[0.04em] gap-2',
  lg: 'h-12 px-6 text-[13px] tracking-[0.04em] gap-2',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-fg-primary text-fg-inverse hover:opacity-90 active:opacity-80 disabled:bg-fg-disabled disabled:text-fg-inverse disabled:opacity-100',
  secondary:
    'bg-transparent border border-border-strong text-fg-primary hover:bg-surface-sunken active:bg-surface-sunken/80 disabled:text-fg-disabled disabled:border-border-subtle disabled:hover:bg-transparent',
  tertiary:
    'bg-transparent text-fg-secondary hover:text-fg-primary hover:bg-surface-sunken active:bg-surface-sunken/80 disabled:text-fg-disabled disabled:hover:bg-transparent disabled:hover:text-fg-disabled',
  destructive:
    'bg-error-solid text-fg-inverse hover:opacity-90 active:opacity-80 disabled:opacity-50',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    disabled,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'inline-flex items-center justify-center rounded-pill font-mono uppercase whitespace-nowrap select-none',
        'transition-opacity duration-150',
        'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
        'disabled:cursor-not-allowed',
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {iconLeft && <span aria-hidden="true">{iconLeft}</span>}
      <span>{children}</span>
      {iconRight && <span aria-hidden="true">{iconRight}</span>}
    </button>
  );
});
