'use client';

export interface SwapAsset {
  symbol: string;
  amount?: number;
  usdValue?: number;
}

interface SwapAssetPickerProps {
  assets: SwapAsset[];
  onSelect: (symbol: string) => void;
  message?: string;
  /** When set, shows a "Change target" link that calls this callback */
  onChangeTarget?: () => void;
  /** Currently auto-selected target shown in the message area */
  autoTarget?: string;
}

function fmtBalance(amount: number): string {
  if (amount >= 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (amount >= 1) return amount.toFixed(2);
  if (amount >= 0.01) return amount.toFixed(4);
  return amount.toFixed(6);
}

export function SwapAssetPicker({ assets, onSelect, message, onChangeTarget, autoTarget }: SwapAssetPickerProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-surface-card p-4 space-y-3 feed-row shadow-[var(--shadow-flat)]">
      {message && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-fg-secondary whitespace-pre-line">{message}</p>
          {onChangeTarget && autoTarget && (
            <button
              onClick={onChangeTarget}
              className="text-xs text-fg-secondary hover:text-fg-primary transition underline underline-offset-2 shrink-0 ml-3"
            >
              Change target
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {assets.map((a) => (
          <button
            key={a.symbol}
            onClick={() => onSelect(a.symbol)}
            className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-page px-4 py-2 text-sm font-medium text-fg-primary hover:border-border-strong transition active:scale-[0.95]"
          >
            <span className="font-mono font-semibold">{a.symbol}</span>
            {a.amount != null && (
              <span className="text-fg-secondary text-xs font-mono">
                {fmtBalance(a.amount)}
                {a.usdValue != null && a.usdValue > 0.01 && (
                  <span className="ml-1 opacity-60">${a.usdValue.toFixed(2)}</span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      {assets.length === 0 && (
        <p className="text-xs text-fg-muted">No assets available to swap.</p>
      )}
    </div>
  );
}
