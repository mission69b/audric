'use client';

interface HandledAction {
  icon: string;
  label: string;
  detail: string;
}

interface HandledForYouProps {
  actions: HandledAction[];
  onViewAll: () => void;
}

export function HandledForYou({ actions, onViewAll }: HandledForYouProps) {
  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg border border-success/20 bg-surface px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-success">
          Handled for you overnight
        </p>
        <button
          onClick={onViewAll}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-muted hover:text-foreground transition"
        >
          View all
        </button>
      </div>
      <div className="space-y-1.5">
        {actions.slice(0, 3).map((a, i) => (
          <div key={i} className="flex items-center gap-2.5 text-xs">
            <span className="text-sm shrink-0">{a.icon}</span>
            <span className="text-foreground">{a.label}</span>
            <span className="text-dim ml-auto shrink-0">{a.detail}</span>
          </div>
        ))}
        {actions.length > 3 && (
          <p className="text-[10px] text-dim">+{actions.length - 3} more</p>
        )}
      </div>
    </div>
  );
}
