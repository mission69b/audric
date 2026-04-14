'use client';

interface PlaceholderPanelProps {
  title: string;
  description: string;
  icon: string;
  cta?: string;
  onCtaClick?: () => void;
  soon?: boolean;
}

export function PlaceholderPanel({ title, description, icon, cta, onCtaClick, soon }: PlaceholderPanelProps) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="text-4xl mb-4">{icon}</span>
        <h2 className="font-heading text-lg text-foreground mb-1">{title}</h2>
        <p className="text-sm text-muted max-w-md mb-6">{description}</p>
        {soon && (
          <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-dim bg-surface border border-border rounded-full px-3 py-1 mb-4">
            Coming Soon
          </span>
        )}
        {cta && onCtaClick && (
          <button
            onClick={onCtaClick}
            className="font-mono text-[11px] tracking-[0.08em] uppercase text-foreground border border-border rounded-full px-6 py-2.5 hover:bg-surface transition"
          >
            {cta}
          </button>
        )}
      </div>
    </div>
  );
}
