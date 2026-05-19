// SkeletonCard — geometric placeholder for loading tool results.
// Ported from `apps/web/components/engine/cards/SkeletonCard.tsx` by
// Phase 5a.4 (renderer migration sweep, 2026-05-19). Verbatim.

export type SkeletonVariant =
  | 'compact'
  | 'wide'
  | 'list'
  | 'chip'
  | 'media-image'
  | 'media-audio'
  | 'receipt';

interface SkeletonCardProps {
  variant: SkeletonVariant;
  ariaLabel?: string;
}

const PULSE_BAR =
  'rounded bg-border-subtle/60 motion-reduce:animate-none animate-pulse';

export function SkeletonCard({
  variant,
  ariaLabel = 'Loading',
}: SkeletonCardProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-busy="true"
      data-skeleton={variant}
      className="my-1.5 rounded-lg border border-border-subtle bg-surface-card overflow-hidden"
    >
      {variant === 'compact' && <CompactSkeleton />}
      {variant === 'wide' && <WideSkeleton />}
      {variant === 'list' && <ListSkeleton />}
      {variant === 'chip' && <ChipSkeleton />}
      {variant === 'media-image' && <MediaImageSkeleton />}
      {variant === 'media-audio' && <MediaAudioSkeleton />}
      {variant === 'receipt' && <ReceiptSkeleton />}
    </div>
  );
}

function CompactSkeleton() {
  return (
    <div className="px-4 py-3 space-y-2">
      <div className={`${PULSE_BAR} h-3 w-24`} />
      <div className={`${PULSE_BAR} h-4 w-40`} />
    </div>
  );
}

function WideSkeleton() {
  return (
    <div className="px-4 py-3 space-y-3">
      <div className={`${PULSE_BAR} h-3 w-20`} />
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <div className={`${PULSE_BAR} h-2.5 w-12`} />
          <div className={`${PULSE_BAR} h-5 w-16`} />
        </div>
        <div className="space-y-1.5">
          <div className={`${PULSE_BAR} h-2.5 w-14`} />
          <div className={`${PULSE_BAR} h-5 w-20`} />
        </div>
        <div className="space-y-1.5">
          <div className={`${PULSE_BAR} h-2.5 w-10`} />
          <div className={`${PULSE_BAR} h-5 w-14`} />
        </div>
      </div>
      <div className={`${PULSE_BAR} h-3 w-3/5`} />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className={`${PULSE_BAR} h-3 w-28`} />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-3 pt-1">
          <div className={`${PULSE_BAR} h-3.5 w-2/5`} />
          <div className={`${PULSE_BAR} h-3.5 w-1/5`} />
        </div>
      ))}
    </div>
  );
}

function ChipSkeleton() {
  return (
    <div className="px-3 py-1.5 flex items-center gap-2">
      <div className={`${PULSE_BAR} h-3 w-3 rounded-full`} />
      <div className={`${PULSE_BAR} h-3 w-32`} />
    </div>
  );
}

function MediaImageSkeleton() {
  return (
    <div className="space-y-0">
      <div
        className={`${PULSE_BAR} rounded-none w-full aspect-square max-h-64`}
      />
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className={`${PULSE_BAR} h-3 w-32`} />
        <div className={`${PULSE_BAR} h-3 w-12`} />
      </div>
    </div>
  );
}

function MediaAudioSkeleton() {
  return (
    <div className="px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-3">
        <div className={`${PULSE_BAR} h-10 w-10 rounded-full`} />
        <div className="flex-1 space-y-1.5">
          <div className={`${PULSE_BAR} h-3 w-2/5`} />
          <div className={`${PULSE_BAR} h-2 w-full`} />
        </div>
      </div>
    </div>
  );
}

function ReceiptSkeleton() {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <div className="space-y-1.5">
        <div className={`${PULSE_BAR} h-3 w-24`} />
        <div className={`${PULSE_BAR} h-2.5 w-32`} />
      </div>
      <div className={`${PULSE_BAR} h-4 w-12`} />
    </div>
  );
}
