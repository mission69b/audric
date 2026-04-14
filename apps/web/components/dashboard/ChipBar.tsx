'use client';

interface ChipBarProps {
  onChipClick: (flow: string) => void;
  activeFlow: string | null;
  disabled?: boolean;
}

const CHIPS = [
  { id: 'save', label: 'Save', icon: '💰' },
  { id: 'send', label: 'Send', icon: '📤' },
  { id: 'swap', label: 'Swap', icon: '🔄' },
  { id: 'borrow', label: 'Credit', icon: '💳' },
  { id: 'receive', label: 'Receive', icon: '📥' },
  { id: 'charts', label: 'Charts', icon: '📊' },
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
              : 'bg-background border-border text-muted hover:border-border-bright hover:text-foreground',
          ].join(' ')}
        >
          <span className="text-sm leading-none">{chip.icon}</span>
          {chip.label}
        </button>
      ))}
    </div>
  );
}
