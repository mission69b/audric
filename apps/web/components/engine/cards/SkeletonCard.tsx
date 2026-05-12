// ───────────────────────────────────────────────────────────────────────────
// SPEC 23C C2 — SkeletonCard primitive
//
// Renders a placeholder of the eventual card's geometry while the tool is
// in the `running` state. Replaces the previous "header appears alone for
// 1-3s, then content materializes" two-tick mount pattern that produced
// every layout-shift bug we whack-a-mole'd on 2026-05-12 (chip-pushed-card-
// down, audio "no supported sources" rendering before src bound, regen-
// cluster vertical stacking, ReviewCard footer overflow when both states
// materialized at once). The card slot is now occupied from t=0.
//
// Variants are SHAPES not pixel-perfect copies — the goal is to reserve
// the right amount of vertical space so the real card slides in without
// layout shift, not to deceive the user into thinking they're seeing
// real data. The pulse animation makes the placeholder-ness obvious.
//
// Variants chosen by surveying every card renderer in
// ToolResultCard.tsx's CARD_RENDERERS table:
//
//   compact     ~80px   single-row reads (RatesCard, SwapQuoteCard,
//                       HealthCard summary, PriceCard, StakingCard summary)
//   wide        ~180px  multi-row analytics (BalanceCard, PortfolioCard,
//                       SavingsCard, ActivitySummaryCard, YieldEarningsCard,
//                       TransactionReceiptCard for write tools, PaymentLinkCard,
//                       InvoiceCard create variant, ExplainTxCard, ProtocolCard)
//   list        ~140px  multi-item lists with rows (TransactionHistoryCard,
//                       ServiceCatalogCard, SearchResultsCard, list_*)
//   chip         ~28px  single-line confirmations (ConfirmationChip cases,
//                       SuinsResolution, save_contact)
//   media-image ~280px  pay_api DALL-E / image generation (CardPreview hosts
//                       a 256px image area + ReviewCard footer)
//   media-audio ~120px  pay_api TTS / audio (TrackPlayer hosts a play button +
//                       progress bar + ReviewCard footer)
//   receipt      ~72px  pay_api terminal vendors (Lob/Resend) + generic
//                       fallback. Just the vendor receipt, no media area.
//
// Reduced-motion: Tailwind's `motion-reduce:animate-none` modifier kills
// the pulse for users with prefers-reduced-motion. The skeleton still
// renders (just no shimmer) — visual continuity matters more than the
// pulse, and removing the pulse satisfies WCAG 2.3.3 (Animation from
// Interactions) without needing JS.
// ───────────────────────────────────────────────────────────────────────────

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
  /** ARIA-friendly description of what's loading. Read by screen readers
   *  via the role="status" + aria-label. Defaults to "Loading"; pass the
   *  tool's display label (e.g. "Loading balance check") for better a11y. */
  ariaLabel?: string;
}

const PULSE_BAR =
  'rounded bg-border-subtle/60 motion-reduce:animate-none animate-pulse';

export function SkeletonCard({ variant, ariaLabel = 'Loading' }: SkeletonCardProps) {
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
