'use client';

interface ChatDividerProps {
  label?: string;
}

export function ChatDivider({ label = 'TASK INITIATED' }: ChatDividerProps) {
  return (
    <div className="flex items-center gap-3 py-3" role="separator">
      <div className="flex-1 h-px bg-border" />
      <span className="font-mono text-[10px] tracking-widest uppercase text-dim shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
