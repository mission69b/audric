'use client';

import { Spinner } from '@/components/ui/Spinner';

interface ConfirmationCardProps {
  title: string;
  details: { label: string; value: string }[];
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmationCard({
  title,
  details,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
}: ConfirmationCardProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-5 space-y-4 shadow-[var(--shadow-flat)] feed-row">
      <p className="font-medium text-fg-primary">{title}</p>

      <div className="space-y-2">
        {details.map((d) => (
          <div key={d.label} className="flex justify-between text-sm">
            <span className="text-fg-secondary">{d.label}</span>
            <span className="text-fg-primary font-medium font-mono">{d.value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 bg-fg-primary rounded-lg py-3 text-sm font-semibold text-fg-inverse tracking-[0.05em] uppercase transition hover:opacity-80 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Spinner size="sm" className="border-surface-page/40 border-t-surface-page" />
              Processing...
            </>
          ) : (
            <>&#10003; {confirmLabel}</>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={loading}
          className="px-5 py-3 text-sm text-fg-secondary hover:text-fg-primary transition disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
