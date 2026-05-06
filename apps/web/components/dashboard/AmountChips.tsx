'use client';

import { useState } from 'react';

interface AmountChipsProps {
  amounts: number[];
  allLabel?: string;
  onSelect: (amount: number) => void;
  message?: string;
  assetLabel?: string;
  /**
   * [B1 polish F2] Optional cancel affordance. When provided, renders a
   * small "Cancel" link below the chip row that abandons the entire
   * chip flow (parent wires this to `chipFlow.reset`). Without this the
   * only way out of an L2 amount step was to mouse to a different panel
   * — F1's global Esc handler covers keyboard, this covers the visible
   * affordance for touch users.
   */
  onCancel?: () => void;
  /**
   * [B1 polish F3] Optional "Change <thing>" link rendered next to
   * Cancel — used by the send flow to step back from amount → recipient
   * picker without dropping the flow entirely. Mirrors the existing
   * swap "Change target" link but inside the AmountChips footer.
   */
  onChangeUpstream?: () => void;
  /** Label for the upstream change link, e.g. "Change recipient". */
  changeUpstreamLabel?: string;
}

export function AmountChips({
  amounts,
  allLabel,
  onSelect,
  message,
  assetLabel,
  onCancel,
  onChangeUpstream,
  changeUpstreamLabel,
}: AmountChipsProps) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  if (showCustom) {
    return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-4 space-y-3 feed-row shadow-[var(--shadow-flat)]">
      {message && <p className="text-sm text-fg-secondary whitespace-pre-line">{message}</p>}
      <div className="flex gap-2">
          <div className="flex-1 flex items-center border border-border-subtle bg-surface-page rounded-lg px-4">
            {!assetLabel && <span className="text-fg-secondary font-mono">$</span>}
            <input
              type="number"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="0.00"
              autoFocus
              aria-label={assetLabel ? `Amount in ${assetLabel}` : 'Amount in dollars'}
              className="flex-1 bg-transparent py-3 pl-1 text-sm text-fg-primary font-mono outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom) onSelect(parseFloat(custom));
              }}
            />
            {assetLabel && <span className="text-fg-secondary font-mono text-xs ml-1">{assetLabel}</span>}
          </div>
          <button
            onClick={() => custom && onSelect(parseFloat(custom))}
            disabled={!custom || parseFloat(custom) <= 0}
            className="bg-fg-primary rounded-lg px-5 py-3 text-sm font-medium text-fg-inverse tracking-[0.05em] uppercase transition hover:opacity-80 disabled:opacity-40"
          >
            Go
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCustom(false)}
            className="text-xs text-fg-secondary hover:text-fg-primary transition"
          >
            ← Back to presets
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition underline underline-offset-2 ml-auto"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-4 space-y-3 feed-row shadow-[var(--shadow-flat)]">
      {message && <p className="text-sm text-fg-secondary whitespace-pre-line">{message}</p>}
      <div className="flex flex-wrap gap-2">
        {amounts.map((a) => (
          <button
            key={a}
            onClick={() => onSelect(a)}
            className="rounded-full border border-border-subtle bg-surface-page px-4 py-2 text-sm font-medium font-mono text-fg-primary hover:border-border-strong transition active:scale-[0.95]"
          >
            {assetLabel ? `${a} ${assetLabel}` : `$${a}`}
          </button>
        ))}
        {allLabel && amounts.length > 0 && (
          <button
            onClick={() => onSelect(-1)}
            className="rounded-full border border-border-subtle bg-surface-page px-4 py-2 text-sm font-medium font-mono text-fg-primary hover:border-border-strong transition active:scale-[0.95]"
          >
            {allLabel}
          </button>
        )}
        <button
          onClick={() => setShowCustom(true)}
          className="rounded-full border border-border-subtle bg-surface-page px-4 py-2 text-sm text-fg-secondary hover:text-fg-primary hover:border-border-strong transition"
        >
          Custom
        </button>
      </div>
      {(onChangeUpstream || onCancel) && (
        <div className="flex items-center gap-3 pt-1">
          {onChangeUpstream && changeUpstreamLabel && (
            <button
              type="button"
              onClick={onChangeUpstream}
              className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition underline underline-offset-2"
            >
              {changeUpstreamLabel}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition underline underline-offset-2 ml-auto"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
