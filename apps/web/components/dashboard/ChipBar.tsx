'use client';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const CHIPS = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'swap', label: 'Swap' },
  { id: 'borrow', label: 'Credit' },
  { id: 'receive', label: 'Receive' },
  { id: 'charts', label: 'Charts' },
];

export function ChipBar({ onChipClick, activeFlow, disabled }: ChipBarProps) {
  return (
    <div className="flex gap-1.5 overflow-x-auto scrollbar-none" role="toolbar" aria-label="Quick actions">
      {CHIPS.map((chip) => (
        <button
          key={chip.id}
          onClick={() => onChipClick(chip.id)}
          disabled={disabled}
          aria-pressed={activeFlow === chip.id}
          className={[
            'shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-mono uppercase tracking-[0.08em] font-medium transition active:scale-[0.95] border flex items-center gap-1.5',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            activeFlow === chip.id
              ? 'bg-foreground border-foreground text-background'
              : 'bg-transparent border-border-bright text-muted hover:text-[var(--n300)] hover:border-[var(--n500)] hover:bg-[var(--n800)]',
          ].join(' ')}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
