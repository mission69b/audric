'use client';

interface SuggestedActionProps {
  icon?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function SuggestedAction({ icon, label, onClick, disabled = false }: SuggestedActionProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full border border-border-subtle bg-surface-card hover:bg-surface-sunken hover:border-border-strong text-fg-secondary hover:text-fg-primary font-mono text-[10px] tracking-[0.1em] uppercase transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 focus-visible:ring-offset-surface-page outline-none"
    >
      {icon && <span className="text-base leading-none shrink-0">{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

interface SuggestedActionsProps {
  actions: Array<{ icon?: string; label: string; prompt: string }>;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export function SuggestedActions({ actions, onSelect, disabled = false }: SuggestedActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      {actions.map((action) => (
        <SuggestedAction
          key={action.label}
          icon={action.icon}
          label={action.label}
          onClick={() => onSelect(action.prompt)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
