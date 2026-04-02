const SIZES = {
  sm: 'h-4 w-4 border-[1.5px]',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
} as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block rounded-full border-border border-t-foreground animate-[spin-arc_0.8s_linear_infinite] ${SIZES[size]} ${className}`}
    />
  );
}
