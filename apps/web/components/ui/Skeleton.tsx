interface SkeletonProps {
  variant?: 'text' | 'block' | 'avatar';
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
}: SkeletonProps) {
  const base = 'bg-surface relative overflow-hidden';

  const variantClass =
    variant === 'avatar'
      ? 'rounded-full'
      : variant === 'block'
        ? 'rounded-lg'
        : 'rounded h-3.5';

  const defaultWidth = variant === 'avatar' ? 40 : undefined;
  const defaultHeight = variant === 'avatar' ? 40 : variant === 'block' ? 80 : undefined;

  const w = width ?? defaultWidth;
  const h = height ?? defaultHeight;

  return (
    <div
      className={`${base} ${variantClass} ${className}`}
      style={{
        width: typeof w === 'number' ? `${w}px` : w,
        height: typeof h === 'number' ? `${h}px` : h,
      }}
    >
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.04] to-transparent" />
    </div>
  );
}
