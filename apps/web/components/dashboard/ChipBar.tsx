'use client';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const CHIPS = [
  { id: 'save', label: 'Save' },
  { id: 'send', label: 'Send' },
  { id: 'borrow', label: 'Credit' },
  { id: 'pay', label: 'Pay' },
  { id: 'receive', label: 'Receive' },
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
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-mono uppercase tracking-wider font-medium transition active:scale-[0.95] border',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            'focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1 focus-visible:ring-offset-background',
            activeFlow === chip.id
              ? 'bg-foreground border-foreground text-background'
              : 'bg-background border-border text-muted hover:border-border-bright hover:text-foreground',
          ].join(' ')}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
