// [PHASE 13] Marketing — shared bordered grid primitive.
//
// The marketing reference uses the same N-up bordered cell layout in 4
// places: How it works (3-up), Intelligence (5-up), Passport (4-up),
// Finance (4-up), Metrics (4-up). They all share these visuals:
//
//   • Outer 1px border, 4px radius, overflow hidden
//   • Children laid out as equal-width columns separated by 1px hairlines
//   • Mobile (<900px): collapses to single column with bottom hairlines
//
// The cell count is data-driven via the `cols` prop. Children are rendered
// as-is — each child must be a self-contained cell with its own padding.

import type { ReactNode } from 'react';

interface BorderedGridProps {
  cols: 2 | 3 | 4 | 5;
  children: ReactNode;
  className?: string;
}

const COL_CLASSES: Record<2 | 3 | 4 | 5, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
};

export function BorderedGrid({ cols, children, className }: BorderedGridProps) {
  return (
    <div
      className={[
        'grid gap-px rounded-xs border border-border-subtle bg-border-subtle overflow-hidden',
        COL_CLASSES[cols],
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}

// Convenience wrapper for individual cells — applies the surface background
// and standard padding so every cell shares the same look. Call sites that
// need custom padding can render their own <div> directly inside <BorderedGrid>.
export function BorderedCell({
  children,
  className,
  surface = 'card',
}: {
  children: ReactNode;
  className?: string;
  surface?: 'card' | 'page';
}) {
  const surfaceClass = surface === 'card' ? 'bg-surface-card' : 'bg-surface-page';
  return (
    <div className={['p-6', surfaceClass, className ?? ''].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
