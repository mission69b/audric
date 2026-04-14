'use client';

interface ProactiveBannerProps {
  title: string;
  description: string;
  cta: string;
  onCtaClick: () => void;
  onDismiss: () => void;
  variant?: 'default' | 'success' | 'warning';
}

export function ProactiveBanner({
  title,
  description,
  cta,
  onCtaClick,
  onDismiss,
  variant = 'default',
}: ProactiveBannerProps) {
  const borderClass = variant === 'success'
    ? 'border-success/30'
    : variant === 'warning'
    ? 'border-warning/30'
    : 'border-border-bright';

  const dotClass = variant === 'success'
    ? 'bg-success'
    : variant === 'warning'
    ? 'bg-warning'
    : 'bg-accent';

  return (
    <div className={`rounded-lg border ${borderClass} bg-surface px-4 py-3 flex items-start gap-3`}>
      <span className={`mt-1.5 h-2 w-2 rounded-full ${dotClass} shrink-0 animate-pulse`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>
        <button
          onClick={onCtaClick}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-accent hover:text-foreground transition mt-2"
        >
          {cta} &rarr;
        </button>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 text-dim hover:text-muted transition text-xs p-1"
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
