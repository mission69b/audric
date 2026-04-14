'use client';

type TaskStatus = 'needs_input' | 'running' | 'upcoming' | 'done';

interface TaskCardProps {
  title: string;
  description?: string;
  status: TaskStatus;
  onAction?: () => void;
  actionLabel?: string;
}

const STATUS_CONFIG: Record<TaskStatus, { dot: string; label: string; labelClass: string }> = {
  needs_input: { dot: 'bg-warning animate-pulse', label: 'NEEDS INPUT', labelClass: 'text-warning' },
  running: { dot: 'bg-accent animate-pulse', label: 'RUNNING', labelClass: 'text-accent' },
  upcoming: { dot: 'bg-dim', label: 'UPCOMING', labelClass: 'text-dim' },
  done: { dot: 'bg-success', label: 'DONE', labelClass: 'text-success' },
};

export function TaskCard({ title, description, status, onAction, actionLabel }: TaskCardProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div className={`rounded-lg border bg-surface px-4 py-3 ${
      status === 'needs_input' ? 'border-warning/30' : 'border-border'
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full ${cfg.dot} shrink-0`} />
        <span className={`font-mono text-[9px] tracking-[0.1em] uppercase ${cfg.labelClass}`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-sm text-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted mt-0.5 leading-relaxed">{description}</p>
      )}
      {onAction && actionLabel && status !== 'done' && (
        <button
          onClick={onAction}
          className="font-mono text-[10px] tracking-[0.08em] uppercase text-accent hover:text-foreground transition mt-2"
        >
          {actionLabel} &rarr;
        </button>
      )}
    </div>
  );
}
