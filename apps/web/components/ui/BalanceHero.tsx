export type BalanceHeroSize = 'lg' | 'md';

export interface BalanceHeroProps {
  total: number;
  available: number;
  earning: number;
  size?: BalanceHeroSize;
  className?: string;
  /** Optional currency prefix; defaults to "$". */
  currencySymbol?: string;
}

function fmtUsd(n: number): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtUsdInt(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

const SIZE_CLASSES: Record<BalanceHeroSize, { total: string; eyebrow: string; gap: string }> = {
  lg: {
    total: 'text-[52px] leading-none',
    eyebrow: 'text-[10px] tracking-[0.1em]',
    gap: 'gap-2',
  },
  md: {
    total: 'text-[32px] leading-[1.1]',
    eyebrow: 'text-[9px] tracking-[0.1em]',
    gap: 'gap-1.5',
  },
};

export function BalanceHero({
  total,
  available,
  earning,
  size = 'lg',
  className,
  currencySymbol = '$',
}: BalanceHeroProps) {
  const sz = SIZE_CLASSES[size];

  return (
    <div
      className={['flex flex-col items-center text-center', sz.gap, className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      <p className={`num-display font-normal text-fg-primary tracking-[-0.015em] ${sz.total}`}>
        {currencySymbol}
        {fmtUsd(total)}
      </p>
      <p className={`label-mono text-fg-muted ${sz.eyebrow}`}>
        AVAILABLE{' '}
        <span className="num-tabular tracking-normal">
          {currencySymbol}
          {fmtUsdInt(available)}
        </span>
        <span aria-hidden="true" className="mx-2 text-fg-disabled">
          ·
        </span>
        EARNING{' '}
        <span className="num-tabular tracking-normal">
          {currencySymbol}
          {fmtUsdInt(earning)}
        </span>
      </p>
    </div>
  );
}
