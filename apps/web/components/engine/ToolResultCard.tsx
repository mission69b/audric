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
 * presentation. Today only `balance_check` consumes it; other renderers
 * accept the arg for API symmetry but ignore it. When extending, only opt
 * in tools whose card materially changes shape post-write — most read
 * cards look identical in both contexts.
 */
type CardVariant = 'default' | 'post-write';
type CardRenderer = (
  result: unknown,
  variant?: CardVariant,
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
  health_check: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <HealthCard data={data as Parameters<typeof HealthCard>[0]['data']} />;
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
  pay_api: (result) => {
    const data = extractData(result);
    if (!data || typeof data !== 'object') return null;
    return <>{renderMppService(data as PayApiResult)}</>;
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
};

export function ToolResultCard({
  tool,
  variant,
}: {
  tool: ToolExecution;
  /** [SPEC 23B-W1] Request a tighter post-write presentation when the card
   *  is being rendered as part of a post-write refresh cluster
   *  (`<PostWriteRefreshSurface>`). Most renderers ignore this; the
   *  ones that materially change shape opt in via `CARD_RENDERERS`. */
  variant?: CardVariant;
}) {
  if (tool.status !== 'done' || !tool.result || tool.isError) return null;

  const renderer = CARD_RENDERERS[tool.toolName];
  if (renderer) {
    try {
      return <>{renderer(tool.result, variant)}</>;
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
