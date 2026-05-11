'use client';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B — N4 — SuinsResolution primitive
//
// Inline single-line surface for the `resolve_suins` engine tool. Pre-N4
// the tool fell through to `null` in CARD_RENDERERS — the user only saw
// the LLM's prose ("alex.sui resolves to 0xab12…") with no UI confirmation
// of which way the lookup ran or whether the name was actually registered.
//
// Tool shape (`packages/engine/src/tools/resolve-suins.ts`):
//   Forward: { direction: 'forward', query, address, registered }
//   Reverse: { direction: 'reverse', query, names, primary }
//
// Render shape (4 states):
//   Forward + registered:    [●] alex.sui  →  0xab12…cd34   [verified]
//   Forward + unregistered:  [○] alex.sui      not registered
//   Reverse + registered:    [●] 0xab12…cd34  →  alex.sui   [+2 more]
//   Reverse + unregistered:  [○] 0xab12…cd34   no SuiNS name
//
// Visual chrome matches ConfirmationChip (N1/N2/N6) for consistency —
// same border / bg / radius / padding so the four "no-tx-receipt"
// surfaces read as one family. The structural difference is the bi-token
// arrow shape (token1 → token2) instead of single-detail.
// ───────────────────────────────────────────────────────────────────────────

interface SuinsResolutionProps {
  direction: 'forward' | 'reverse';
  /** The original query (lowercased name or 0x address). */
  query: string;
  /** Forward only: the resolved 0x address (null when unregistered). */
  address?: string | null;
  /** Forward only: convenience flag. */
  registered?: boolean;
  /** Reverse only: the conventional primary name (first in `names`), or null. */
  primary?: string | null;
  /** Reverse only: every SuiNS name pointing at the address. */
  names?: string[];
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SuinsResolution(props: SuinsResolutionProps) {
  const { direction, query } = props;
  const isForward = direction === 'forward';

  // Resolved status drives the leading dot color + the trailing pill.
  const isResolved = isForward
    ? props.registered === true && !!props.address
    : !!props.primary;

  // Forward: source = the .sui name, target = the address (or "not registered").
  // Reverse: source = the address, target = the primary name (or "no SuiNS name").
  const source = isForward ? query : truncateAddress(query);
  const target = isForward
    ? props.address
      ? truncateAddress(props.address)
      : null
    : props.primary ?? null;

  const fallbackText = isForward ? 'not registered' : 'no SuiNS name';

  // Reverse-direction `+N more` hint when an address has multiple SuiNS records.
  const extraNamesCount =
    !isForward && props.names && props.names.length > 1 ? props.names.length - 1 : 0;

  // Pill content: "verified" for forward-resolved, "+N more" for reverse with multiples.
  const pillText = isResolved
    ? isForward
      ? 'verified'
      : extraNamesCount > 0
        ? `+${extraNamesCount} more`
        : null
    : null;

  // Title surfaces the full untruncated forms on hover (forward shows the
  // full address; reverse shows the full address + every registered name).
  const title = isForward
    ? props.address
      ? `${query} → ${props.address}`
      : `${query} (not registered)`
    : props.names && props.names.length > 0
      ? `${query} → ${props.names.join(', ')}`
      : `${query} (no SuiNS name)`;

  // Aria-label mirrors the visual line so screen readers get the same
  // shape — direction + source + target + status. Falls back to the
  // unresolved-state text when no target.
  const ariaLabel = target
    ? `SuiNS resolution: ${source} ${isForward ? 'resolves to' : 'has SuiNS name'} ${target}`
    : `SuiNS resolution: ${source} ${fallbackText}`;

  const dotColor = isResolved ? 'bg-success-solid' : 'bg-fg-muted';

  return (
    <div
      className="my-1.5 flex items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2"
      role="status"
      aria-label={ariaLabel}
      title={title}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
        {isForward ? 'SUINS' : 'ADDRESS'}
      </span>
      <span className="ml-auto flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] text-fg-primary truncate">{source}</span>
        {target ? (
          <>
            <span className="font-mono text-[11px] text-fg-muted" aria-hidden="true">
              →
            </span>
            <span className="font-mono text-[11px] text-fg-primary truncate">{target}</span>
          </>
        ) : (
          <span className="font-mono text-[11px] text-fg-muted truncate">{fallbackText}</span>
        )}
        {pillText && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-fg-muted rounded-full px-2 py-0.5"
            style={{ border: '0.5px solid var(--border-subtle)', background: 'var(--surface-sunken)' }}
          >
            {pillText}
          </span>
        )}
      </span>
    </div>
  );
}
