'use client';

// SuinsResolution — `resolve_suins` tool renderer. Inline single-line
// surface (not wrapped in CardShell). Ported from
// `apps/web/components/engine/cards/SuinsResolution.tsx` by Phase 5a.3
// (renderer migration sweep, 2026-05-19). Verbatim.

interface SuinsResolutionProps {
  direction: 'forward' | 'reverse';
  query: string;
  address?: string | null;
  registered?: boolean;
  primary?: string | null;
  names?: string[];
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function SuinsResolution(props: SuinsResolutionProps) {
  const { direction, query } = props;
  const isForward = direction === 'forward';

  const isResolved = isForward
    ? props.registered === true && !!props.address
    : !!props.primary;

  const source = isForward ? query : truncateAddress(query);
  const target = isForward
    ? props.address
      ? truncateAddress(props.address)
      : null
    : props.primary ?? null;

  const fallbackText = isForward ? 'not registered' : 'no SuiNS name';

  const extraNamesCount =
    !isForward && props.names && props.names.length > 1
      ? props.names.length - 1
      : 0;

  const pillText = isResolved
    ? isForward
      ? 'verified'
      : extraNamesCount > 0
        ? `+${extraNamesCount} more`
        : null
    : null;

  const title = isForward
    ? props.address
      ? `${query} → ${props.address}`
      : `${query} (not registered)`
    : props.names && props.names.length > 0
      ? `${query} → ${props.names.join(', ')}`
      : `${query} (no SuiNS name)`;

  const ariaLabel = target
    ? `SuiNS resolution: ${source} ${isForward ? 'resolves to' : 'has SuiNS name'} ${target}`
    : `SuiNS resolution: ${source} ${fallbackText}`;

  const dotColor = isResolved ? 'bg-success' : 'bg-muted-foreground';

  return (
    <div
      className="my-1.5 flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      role="status"
      aria-label={ariaLabel}
      title={title}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`}
        aria-hidden="true"
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {isForward ? 'SUINS' : 'ADDRESS'}
      </span>
      <span className="ml-auto flex items-center gap-2 min-w-0">
        <span className="font-mono text-[11px] text-foreground truncate">
          {source}
        </span>
        {target ? (
          <>
            <span
              className="font-mono text-[11px] text-muted-foreground"
              aria-hidden="true"
            >
              →
            </span>
            <span className="font-mono text-[11px] text-foreground truncate">
              {target}
            </span>
          </>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground truncate">
            {fallbackText}
          </span>
        )}
        {pillText && (
          <span
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground rounded-full px-2 py-0.5"
            style={{
              border: '0.5px solid var(--border)',
              background: 'var(--muted)',
            }}
          >
            {pillText}
          </span>
        )}
      </span>
    </div>
  );
}
