'use client';

import { bundleStepReceiptRow } from '../permission-card';
import { SUISCAN_ICON, SUISCAN_TX_URL } from './primitives';

// BundleReceiptCard — consolidated settlement receipt for a multi-write
// atomic Payment Intent (bundle). A bundle executes as ONE Sui PTB →
// one digest, one combined balance-change array. Pre-this-card the
// bundle path fanned out N minimal per-step outputs (`{digest,
// balanceChanges}`) which carry no `tx` field, so the per-step
// TransactionReceiptCard short-circuited to `null` and the bundle
// produced no visible settlement card (text narration only).
//
// Matches the SUCCESS state in `t2000-AFI/audric/phase2-permission-card.html`
// (state 08): calm green "settled" header + atomic sub, label→value
// receipt rows (one per op), a sponsored gas row, and a View-on-Sui
// footer (footer kept in the single-receipt's chrome for in-stream
// consistency with `TransactionReceiptCard`).

interface BundleReceiptStep {
  toolName: string;
  input: Record<string, unknown>;
}

function ReceiptCheck() {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success text-background">
      <svg aria-hidden="true" fill="none" height="13" viewBox="0 0 16 16" width="13">
        <title>Settled</title>
        <path
          d="M3.5 8.5L6.5 11.5L13 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    </span>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-[3px] text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      {value ? (
        <span className="font-mono font-medium text-foreground tabular-nums">
          {value}
        </span>
      ) : null}
    </div>
  );
}

export function BundleReceiptCard({
  steps,
  digest,
}: {
  steps: readonly BundleReceiptStep[];
  digest: string;
}) {
  if (!digest || steps.length === 0) {
    return null;
  }

  const sub = `${steps.length} operations completed atomically`;
  const shortDigest = `${digest.slice(0, 4)}…${digest.slice(-3)}`;

  return (
    <div
      className="my-1.5 overflow-hidden rounded-lg border bg-card"
      style={{
        borderColor: 'color-mix(in srgb, var(--success) 18%, transparent)',
      }}
    >
      <div
        className="flex items-center gap-3 border-border border-b px-[18px] py-[14px]"
        style={{
          background: 'color-mix(in srgb, var(--success) 5%, transparent)',
        }}
      >
        <ReceiptCheck />
        <div>
          <h3 className="font-medium text-[14px] text-foreground tracking-[-0.011em]">
            Approved · Settled
          </h3>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            {sub}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-[18px] py-[14px]">
        {steps.map((step, idx) => {
          const row = bundleStepReceiptRow(step);
          return (
            <ReceiptRow
              key={`${row.label}-${idx}`}
              label={row.label}
              value={row.value}
            />
          );
        })}
        <ReceiptRow label="Gas paid" value="$0.00" />
      </div>

      <div className="flex items-center justify-between border-border border-t border-dashed px-[18px] py-[11px]">
        <span className="font-mono text-[11px] text-muted-foreground">
          {shortDigest}
        </span>
        <a
          className="inline-flex items-center gap-1 border-foreground/30 border-b font-mono text-[11px] text-foreground transition hover:border-foreground"
          href={`${SUISCAN_TX_URL}/${digest}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          View on Sui
          {SUISCAN_ICON}
        </a>
      </div>
    </div>
  );
}
