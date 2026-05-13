'use client';

import type { ToolExecution } from '@/lib/engine-types';
import { extractData } from './cards/primitives';
import { RatesCard } from './cards/RatesCard';
import { BalanceCard } from './cards/BalanceCard';
import { SavingsCard } from './cards/SavingsCard';
import { PortfolioCard } from './cards/PortfolioCard';
import { ExplainTxCard } from './cards/ExplainTxCard';
import { TransactionReceiptCard } from './cards/TransactionReceiptCard';
import { HealthCard } from './cards/HealthCard';
import { TransactionHistoryCard } from './cards/TransactionHistoryCard';
import { SwapQuoteCard } from './cards/SwapQuoteCard';
import { PaymentLinkCard } from './cards/PaymentLinkCard';
import { InvoiceCard } from './cards/InvoiceCard';
import { ServiceCatalogCard } from './cards/ServiceCatalogCard';
import { SearchResultsCard } from './cards/SearchResultsCard';
import { YieldEarningsCard } from './cards/YieldEarningsCard';
import { ActivitySummaryCard } from './cards/ActivitySummaryCard';
import { StakingCard } from './cards/StakingCard';
import { ProtocolCard } from './cards/ProtocolCard';
import { PriceCard } from './cards/PriceCard';
import { ConfirmationChip } from './cards/ConfirmationChip';
import { SuinsResolution } from './cards/SuinsResolution';
import { PendingRewardsCard } from './cards/PendingRewardsCard';
import { DownloadableArtifact } from './cards/DownloadableArtifact';
import { renderMppService, type PayApiResult } from './cards/mpp';

const WRITE_TOOL_NAMES = new Set([
  'save_deposit', 'withdraw', 'send_transfer', 'swap_execute',
  'volo_stake', 'volo_unstake', 'borrow', 'repay_debt', 'claim_rewards',
  // [Track B / 2026-05-08] Compound write — atomic claim+swap+save in one PTB.
  'harvest_rewards',
  // pay_api is intentionally absent from this list. ServiceResult has no
  // `tx` field (only `paymentDigest`), so the WRITE_TOOL_NAMES fallback
  // (which gates on `'tx' in data`) would always reject it. SPEC 23B-MPP2
  // routes pay_api through CARD_RENDERERS below — see the `pay_api` entry.
]);

/**
 * [v1.4 ACI] Tools that opt into Agent-Controlled Interface refinement
 * (transaction_history, mpp_services) may return a `_refine` payload
 * instead of their normal data shape. The LLM uses that to re-call with
 * narrower params; the UI has no card to show, so we skip rendering.
 * Without this, cards that destructure the missing data shape (e.g.
 * `ServiceCatalogCard` iterating `data.services`) crash with
 * "TypeError: e is not iterable" and the page-level error boundary
 * swallows the entire chat.
 *
 * [v1.4 — Day 3] Pre-Day-3 `defillama_yield_pools` was the third tool in
 * this set; deletion of all 7 `defillama_*` LLM tools narrowed it to two.
 */
function isRefinementPayload(data: unknown): boolean {
  return !!data && typeof data === 'object' && '_refine' in (data as Record<string, unknown>);
}

/**
 * [SPEC 23B-W1] `variant` lets the caller request a tighter post-write
 * presentation. `balance_check` (W1) and `health_check` (HealthSummary,
 * 2026-05-12) consume it; other renderers accept the arg for API
 * symmetry but ignore it. When extending, only opt in tools whose card
 * materially changes shape post-write — most read cards look identical
 * in both contexts.
 */
type CardVariant = 'default' | 'post-write';
/**
 * [SPEC 23B-MPP6] `onSendMessage` is the optional third arg threaded
 * through from `<ToolBlockView>` so per-vendor MPP renderers (DALL-E,
 * ElevenLabs) can render a `<ReviewCard>` whose Regenerate / Cancel
 * buttons fire a synthesized user message via `engine.sendMessage`.
 * Most card renderers ignore it; opt in only when the card needs a
 * "send a chat message via button click" affordance.
 *
 * [SPEC 23B-MPP6-fastpath / 2026-05-12] `onRegenerate` is the optional
 * fourth arg — a toolUseId-bound async closure for the fastpath
 * Regenerate path (bypasses LLM round-trip via direct
 * `executeToolAction.pay_api`). The toolUseId binding is performed at
 * the `<ToolBlockView>` call site so renderers don't need to know
 * about toolUseIds.
 */
type CardRenderer = (
  result: unknown,
  variant?: CardVariant,
  onSendMessage?: (text: string) => void,
  onRegenerate?: () => Promise<void>,
  /**
   * [SPEC 23C C10 / 2026-05-13] True when the tool block being rendered
   * has been superseded by a later regen in the same MppReceiptGrid
   * cluster. Only the `pay_api` renderer reads this — every other
   * renderer ignores it. Threaded down to `<ReviewCard>` as
   * `forceCollapsed`. See ReviewCard.tsx C10 props docstring for the
   * remount-loses-state rationale.
   */
  isSuperseded?: boolean,
) => React.ReactNode | null;

const CARD_RENDERERS: Record<string, CardRenderer> = {
  rates_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <RatesCard data={data as Record<string, { saveApy: number; borrowApy: number }>} />;
  },
  balance_check: (result, variant) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return (
      <BalanceCard
        data={data as Parameters<typeof BalanceCard>[0]['data']}
        variant={variant}
      />
    );
  },
  savings_info: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SavingsCard data={data as Parameters<typeof SavingsCard>[0]['data']} />;
  },
  portfolio_analysis: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <PortfolioCard data={data as Parameters<typeof PortfolioCard>[0]['data']} />;
  },
  explain_tx: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ExplainTxCard data={data as Parameters<typeof ExplainTxCard>[0]['data']} />;
  },
  health_check: (result, variant) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return (
      <HealthCard
        data={data as Parameters<typeof HealthCard>[0]['data']}
        variant={variant}
      />
    );
  },
  transaction_history: (result) => {
    const data = extractData(result);
    if (isRefinementPayload(data)) return null;
    if (!data || typeof data !== 'object') return null;
    return <TransactionHistoryCard data={data as Parameters<typeof TransactionHistoryCard>[0]['data']} />;
  },
  swap_quote: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SwapQuoteCard data={data as Parameters<typeof SwapQuoteCard>[0]['data']} />;
  },
  mpp_services: (result) => {
    const data = extractData(result);
    if (isRefinementPayload(data)) return null;
    if (!data || typeof data !== 'object') return null;
    return <ServiceCatalogCard data={data as Parameters<typeof ServiceCatalogCard>[0]['data']} />;
  },
  web_search: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <SearchResultsCard data={data as Parameters<typeof SearchResultsCard>[0]['data']} />;
  },
  yield_summary: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <YieldEarningsCard data={data as Parameters<typeof YieldEarningsCard>[0]['data']} />;
  },
  activity_summary: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ActivitySummaryCard data={data as Parameters<typeof ActivitySummaryCard>[0]['data']} />;
  },
  create_payment_link: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <PaymentLinkCard data={data} />;
  },
  list_payment_links: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <PaymentLinkCard data={data} />;
  },
  create_invoice: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <InvoiceCard data={data} />;
  },
  list_invoices: (result) => {
    const data = extractData(result);
    if (!data) return null;
    return <InvoiceCard data={data} />;
  },
  volo_stats: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <StakingCard data={data as Parameters<typeof StakingCard>[0]['data']} />;
  },
  protocol_deep_dive: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <ProtocolCard data={data as Parameters<typeof ProtocolCard>[0]['data']} />;
  },
  // [v1.4 — Day 3] BlockVision-backed `token_prices` replaces
  // `defillama_token_prices` and `defillama_price_change`. Same array
  // shape `[{ coinType, symbol, price, change24h?, priceUnavailable? }]`
  // — feeds straight into PriceCard's existing array branch. The
  // optional `change24h` lets PriceRow render a 24h trend pill when the
  // tool was called with `include24hChange: true`.
  token_prices: (result) => {
    const data = extractData(result);
    if (!Array.isArray(data)) return null;
    return <PriceCard data={data as Parameters<typeof PriceCard>[0]['data']} />;
  },
  // ─── SPEC 23B-MPP2 — pay_api per-vendor surface dispatch ──────────────────
  // The `pay_api` engine tool is the user-facing front of the MPP gateway
  // (40+ services: DALL-E, Suno, ElevenLabs, PDFShift, Lob, Teleflora,
  // Amazon, …). Pre-MPP2 the result fell through to TransactionReceiptCard
  // → `'tx' in data` check → null (because ServiceResult only carries
  // `paymentDigest`, not `tx`) — i.e. every successful pay_api call rendered
  // NOTHING in chat. MPP2 routes the result through `renderMppService`
  // which dispatches to the per-vendor primitive (image preview, audio
  // player, PDF cover, etc.) registered in `cards/mpp/registry.tsx`.
  //
  // Shape: host's `executeToolAction.pay_api` returns
  //   `{ success: true, data: { success, paymentDigest, price, serviceId, result } }`
  // → `extractData` unwraps `.data` → directly usable as `PayApiResult`.
  pay_api: (result, _variant, onSendMessage, onRegenerate, isSuperseded) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <>{renderMppService(data as PayApiResult, onSendMessage, onRegenerate, isSuperseded)}</>;
  },
  // ─── SPEC native_content_tools P5 / 2026-05-13 ──────────────────────────
  // Server-side composition tools (compose_pdf, compose_image_grid) return
  // a hosted artifact URL. Both flow through the generic
  // <DownloadableArtifact> primitive — see its header for the rationale on
  // not extending the MPP renderer chain instead.
  compose_pdf: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const d = data as { url?: string; filename?: string; pageCount?: number; sizeKb?: number; expiresAt?: string };
    if (!d.url || !d.filename || typeof d.sizeKb !== 'number') return null;
    return (
      <DownloadableArtifact
        data={{
          kind: 'pdf',
          url: d.url,
          filename: d.filename,
          sizeKb: d.sizeKb,
          pageCount: d.pageCount,
          expiresAt: d.expiresAt,
        }}
      />
    );
  },
  compose_image_grid: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const d = data as {
      url?: string;
      width?: number;
      height?: number;
      sizeKb?: number;
      expiresAt?: string;
      layout?: string;
    };
    if (!d.url || typeof d.sizeKb !== 'number') return null;
    // The image-grid tool doesn't return a filename; synthesize one from
    // the layout for display purposes (the actual Vercel Blob URL has
    // its own random-suffixed filename).
    const filename = `audric-grid-${d.layout ?? 'composed'}.webp`;
    return (
      <DownloadableArtifact
        data={{
          kind: 'image',
          url: d.url,
          filename,
          sizeKb: d.sizeKb,
          width: d.width,
          height: d.height,
          expiresAt: d.expiresAt,
        }}
      />
    );
  },
  // ─── SPEC 23B — N1 / N2 / N6 — confirmation chips for no-tx-receipt writes ──
  // These three tools don't produce on-chain transactions, so they bypass
  // TransactionReceiptCard entirely and render a single-line ConfirmationChip
  // instead. Pre-23B all three fell through to `null` (silent — the user
  // saw only the LLM narration "I cancelled it" with no UI confirmation).
  cancel_payment_link: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const slug = (data as { slug?: string }).slug;
    return (
      <ConfirmationChip
        label="PAYMENT LINK CANCELLED"
        detail={slug}
        tone="neutral"
      />
    );
  },
  cancel_invoice: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const slug = (data as { slug?: string }).slug;
    return (
      <ConfirmationChip
        label="INVOICE CANCELLED"
        detail={slug}
        tone="neutral"
      />
    );
  },
  save_contact: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const { name, address } = data as { name?: string; address?: string };
    if (!name) return null;
    // Detail format: `funkii · 0xab12…cd34` — name + chunked address so
    // the user can verify what was saved without expanding the contact list.
    const truncatedAddr = address && address.length > 12
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : address ?? '';
    const detail = truncatedAddr ? `${name} · ${truncatedAddr}` : name;
    return (
      <ConfirmationChip
        label="CONTACT SAVED"
        detail={detail}
        tone="success"
      />
    );
  },
  // ─── SPEC 23B — N5 — pending_rewards card ────────────────────────────────
  // Pre-N5 the tool fell through to `null` — the user only saw the LLM's
  // prose ("you have 0.0165 vSUI ≈ $0.04 pending") with no visual breakdown.
  // PendingRewardsCard renders 3 states: healthy+claimable (rewards table +
  // total), healthy+empty (quiet "No claimable rewards yet"), and degraded
  // (warning). The "🌾 HARVEST ALL" / "🎁 JUST CLAIM" CTAs already exist
  // via lib/suggested-actions.ts:131-134 chips below the assistant turn —
  // see PendingRewardsCard.tsx header for the data-only design rationale.
  pending_rewards: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const r = data as Partial<{
      rewards: Array<{
        protocol: string;
        asset: string;
        coinType: string;
        symbol: string;
        amount: number;
        estimatedValueUsd: number;
      }>;
      totalValueUsd: number;
      degraded: boolean;
      degradationReason: string | null;
    }>;
    if (!Array.isArray(r.rewards)) return null;
    return (
      <PendingRewardsCard
        data={{
          rewards: r.rewards,
          totalValueUsd: r.totalValueUsd ?? 0,
          degraded: r.degraded ?? false,
          degradationReason: r.degradationReason ?? null,
        }}
      />
    );
  },
  // ─── SPEC 23B — N4 — resolve_suins inline bidirectional surface ──────────
  // Pre-N4 the tool fell through to `null` — the user only saw the LLM's
  // prose with no UI confirmation of which way the lookup ran or whether
  // the name was actually registered. SuinsResolution renders the same
  // inline-chip chrome as N1/N2/N6 (ConfirmationChip) but with a bi-token
  // arrow shape (source → target) and a verified / +N more / not registered
  // status indicator. See SuinsResolution.tsx for the four render states.
  resolve_suins: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    const r = data as Partial<{
      direction: 'forward' | 'reverse';
      query: string;
      address: string | null;
      registered: boolean;
      primary: string | null;
      names: string[];
    }>;
    if (!r.direction || !r.query) return null;
    return (
      <SuinsResolution
        direction={r.direction}
        query={r.query}
        address={r.address}
        registered={r.registered}
        primary={r.primary}
        names={r.names}
      />
    );
  },
};

export function ToolResultCard({
  tool,
  variant,
  onSendMessage,
  onRegenerate,
  isSuperseded,
}: {
  tool: ToolExecution;
  /** [SPEC 23B-W1] Request a tighter post-write presentation when the card
   *  is being rendered as part of a post-write refresh cluster
   *  (`<PostWriteRefreshSurface>`). Most renderers ignore this; the
   *  ones that materially change shape opt in via `CARD_RENDERERS`. */
  variant?: CardVariant;
  /** [SPEC 23B-MPP6] Forwarded to renderers that need a "send chat
   *  message via button" affordance — today only `pay_api`'s DALL-E +
   *  ElevenLabs branches use it (via `<ReviewCard>`). Threaded the same
   *  way `<CanvasBlockView>` already receives `onSendMessage`. */
  onSendMessage?: (text: string) => void;
  /** [SPEC 23B-MPP6-fastpath / 2026-05-12] Already-toolUseId-bound async
   *  closure for the fastpath Regenerate path. The toolUseId binding is
   *  performed in `<ToolBlockView>` so this card doesn't need to know
   *  about toolUseIds. Forwarded to `pay_api` renderer (DALL-E +
   *  ElevenLabs paths use it via `<ReviewCard>`). */
  onRegenerate?: () => Promise<void>;
  /** [SPEC 23C C10 / 2026-05-13] True when this tool block has been
   *  superseded by a later regen in the same MppReceiptGrid cluster.
   *  Forwarded to the `pay_api` renderer → `renderMppService` →
   *  vendor-specific renderer → `<ReviewCard forceCollapsed>`.
   *  See ReviewCard.tsx C10 props docstring. */
  isSuperseded?: boolean;
}) {
  if (tool.status !== 'done' || !tool.result || tool.isError) return null;

  const renderer = CARD_RENDERERS[tool.toolName];
  if (renderer) {
    try {
      return <>{renderer(tool.result, variant, onSendMessage, onRegenerate, isSuperseded)}</>;
    } catch {
      return null;
    }
  }

  if (WRITE_TOOL_NAMES.has(tool.toolName)) {
    try {
      const data = extractData(tool.result);
      if (data && typeof data === 'object' && 'tx' in data) {
        return <TransactionReceiptCard data={data as Parameters<typeof TransactionReceiptCard>[0]['data']} toolName={tool.toolName} />;
      }
    } catch {
      return null;
    }
  }

  return null;
}
