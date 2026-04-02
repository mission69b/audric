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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-background text-dim hover:text-foreground font-mono text-xs tracking-wider uppercase transition-all duration-150 disabled:opacity-40 disabled:pointer-events-none"
    >
      {icon && <span className="text-sm leading-none shrink-0">{icon}</span>}
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
