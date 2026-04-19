'use client';

interface ChatDividerProps {
  label?: string;
}

export function ChatDivider({ label = 'TASK INITIATED' }: ChatDividerProps) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator">
      <div className="flex-1 h-[0.5px] bg-border-subtle" />
      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-fg-muted shrink-0">
        {label}
      </span>
      <div className="flex-1 h-[0.5px] bg-border-subtle" />
    </div>
  );
}
