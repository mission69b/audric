"use client";

import type { ToolUIPart } from "ai";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { ActivitySummaryCard } from "./cards/ActivitySummaryCard";
import { BalanceCardV2 } from "./cards/BalanceCardV2";
import { ConfirmationChip } from "./cards/ConfirmationChip";
import { CanvasCard, type CanvasData } from "./cards/canvas";
import { ExplainTxCard } from "./cards/ExplainTxCard";
import { HealthCardV2 } from "./cards/HealthCardV2";
import { PaymentLinkCard } from "./cards/PaymentLinkCard";
import { PendingRewardsCardV2 } from "./cards/PendingRewardsCardV2";
import { PortfolioCardV2 } from "./cards/PortfolioCardV2";
import { PriceCard } from "./cards/PriceCard";
import { ProtocolCard } from "./cards/ProtocolCard";
import { extractData } from "./cards/primitives";
import { RatesCardV2 } from "./cards/RatesCardV2";
import { SavingsCard } from "./cards/SavingsCard";
import { SearchResultsCard } from "./cards/SearchResultsCard";
import { SkeletonCard } from "./cards/SkeletonCard";
import { StakingCard } from "./cards/StakingCard";
import { SuinsResolution } from "./cards/SuinsResolution";
import { SwapQuoteCardV2 } from "./cards/SwapQuoteCardV2";
import { getSkeletonVariant } from "./cards/skeleton-variants";
import { TransactionHistoryCard } from "./cards/TransactionHistoryCard";
import { TransactionReceiptCard } from "./cards/TransactionReceiptCard";
import { YieldEarningsCard } from "./cards/YieldEarningsCard";

/**
 * ToolResultRouter — discriminated renderer for AI SDK `tool-*` parts.
 *
 * Mirrors `apps/web/components/engine/ToolResultCard.tsx` (`CARD_RENDERERS`
 * map + write-tool fallback) but consumes AI SDK v6 `ToolUIPart` directly
 * instead of the legacy `useEngine` `ToolExecution` shape.
 *
 * Renders:
 *  - `SkeletonCard` while the tool input is streaming / dispatched.
 *  - A rich Audric card for tools in the switch below once output lands.
 *  - Generic AI Elements `<Tool>` JSON dump otherwise.
 *
 * Coverage as of Phase 5b (2026-05-19): 20+ light cards + 8 canvas
 * templates wired. Deferred intentionally:
 *  - `spending_analytics` — has no card (returns text-only)
 *
 * S.245 cleanup: `pay_api` / `mpp_services` references removed —
 * tools deleted from engine entirely; redesigned cleanly in Audric
 * Store SPEC.
 *
 * Motion family is intentionally NOT ported — founder-locked
 * 2026-05-19 to skeleton-pulse only (Tailwind `animate-pulse`). The
 * legacy `MountAnimate` / `NumberTicker` / `TypingDots` /
 * `WorkingState` / `ReceiptChoreography` components stay deleted from
 * scope, NOT deferred. See BENEFITS_SPEC_v07c.md §"Phase 5".
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 5 — Renderer migration
 * sweep" + Phase 5a.1 (infra) + 5a.2-5a.4 (light cards) + 5b (canvas).
 */

const WRITE_TOOLS_WITH_RECEIPT = new Set([
  "save_deposit",
  "withdraw",
  "send_transfer",
  "borrow",
  "repay_debt",
  "swap_execute",
  "volo_stake",
  "volo_unstake",
  "claim_rewards",
  "harvest_rewards",
]);

function renderCard(
  toolName: string,
  output: unknown,
  toolCallId: string,
  onSendMessage?: (text: string) => void
): React.ReactNode | null {
  // Canvas has a special wire-shape stamped by the engine's
  // `render_canvas` tool (see `packages/engine/src/tools/canvas.ts`):
  //   { __canvas: true, template: <id>, title: <string>, templateData: <payload> }
  // The actual canvas payload lives in `templateData`, NOT `data` — the
  // legacy `apps/web` reads `tool.result.templateData` and maps it to
  // the card's `data` prop (see `apps/web/lib/timeline-builder.ts` line
  // ~1045). Pre-S.206 web-v2 read `output.data` here, which was always
  // `undefined` → S.205's defensive coercion painted the "Canvas data
  // was not returned by the tool" fallback for every canvas render
  // (surfaced during the post-S.205 production smoke).
  if (toolName === "render_canvas") {
    const canvasOutput = output as
      | {
          __canvas?: boolean;
          template?: string;
          title?: string;
          templateData?: unknown;
        }
      | undefined;
    if (
      !canvasOutput ||
      typeof canvasOutput.template !== "string" ||
      typeof canvasOutput.title !== "string"
    ) {
      return null;
    }
    // [S.205 — 2026-05-20] Defensive coercion: canvas data MUST be a
    // plain object so the canvas components' `"available" in data`
    // discriminator doesn't crash on the `in` operator. The engine's
    // tool *usually* returns `{ available: true, address, ... }` or
    // `{ available: false, message }`, but an upstream tool failure
    // could still surface `templateData: undefined`. Coerce to the
    // safe `available: false` sentinel so the existing "not available"
    // fallback paints instead of crashing.
    const safeData: unknown =
      canvasOutput.templateData &&
      typeof canvasOutput.templateData === "object" &&
      !Array.isArray(canvasOutput.templateData)
        ? canvasOutput.templateData
        : {
            available: false as const,
            message: "Canvas data was not returned by the tool.",
          };
    const canvas: CanvasData = {
      template: canvasOutput.template,
      title: canvasOutput.title,
      data: safeData,
      toolUseId: toolCallId,
    };
    return <CanvasCard canvas={canvas} onSendMessage={onSendMessage} />;
  }

  const data = extractData(output);
  if (!(data && typeof data === "object")) {
    return null;
  }

  switch (toolName) {
    // ─── Read tools ─────────────────────────────────────────────────────
    case "rates_info":
      return (
        <RatesCardV2 data={data as Parameters<typeof RatesCardV2>[0]["data"]} />
      );
    case "balance_check":
      return (
        <BalanceCardV2
          data={data as Parameters<typeof BalanceCardV2>[0]["data"]}
        />
      );
    case "health_check":
      return (
        <HealthCardV2
          data={data as Parameters<typeof HealthCardV2>[0]["data"]}
        />
      );
    case "savings_info":
      return (
        <SavingsCard data={data as Parameters<typeof SavingsCard>[0]["data"]} />
      );
    case "portfolio_analysis":
      return (
        <PortfolioCardV2
          data={data as Parameters<typeof PortfolioCardV2>[0]["data"]}
        />
      );
    case "resolve_suins":
      return (
        <SuinsResolution {...(data as Parameters<typeof SuinsResolution>[0])} />
      );
    case "swap_quote":
      return (
        <SwapQuoteCardV2
          data={data as Parameters<typeof SwapQuoteCardV2>[0]["data"]}
        />
      );
    case "activity_summary":
      return (
        <ActivitySummaryCard
          data={data as Parameters<typeof ActivitySummaryCard>[0]["data"]}
        />
      );
    case "yield_summary":
      return (
        <YieldEarningsCard
          data={data as Parameters<typeof YieldEarningsCard>[0]["data"]}
        />
      );
    case "transaction_history":
      return (
        <TransactionHistoryCard
          data={data as Parameters<typeof TransactionHistoryCard>[0]["data"]}
        />
      );
    case "explain_tx":
      return (
        <ExplainTxCard
          data={data as Parameters<typeof ExplainTxCard>[0]["data"]}
        />
      );
    case "token_prices":
      return (
        <PriceCard data={data as Parameters<typeof PriceCard>[0]["data"]} />
      );
    case "protocol_deep_dive":
      return (
        <ProtocolCard
          data={data as Parameters<typeof ProtocolCard>[0]["data"]}
        />
      );
    case "volo_stats":
      return (
        <StakingCard data={data as Parameters<typeof StakingCard>[0]["data"]} />
      );
    case "web_search":
      return (
        <SearchResultsCard
          data={data as Parameters<typeof SearchResultsCard>[0]["data"]}
        />
      );
    case "pending_rewards":
      return (
        <PendingRewardsCardV2
          data={data as Parameters<typeof PendingRewardsCardV2>[0]["data"]}
        />
      );

    // ─── Payment links (invoicing folded in — V07E_INVOICE_DEPRECATION
    //     / S.269 item 7, 2026-05-23). create_invoice / list_invoices /
    //     cancel_invoice are gone from the engine; payment-link cards
    //     render every receivable.
    case "create_payment_link":
    case "list_payment_links":
      return <PaymentLinkCard data={data} />;

    // ─── No-tx-receipt write confirmations ───────────────────────────
    case "cancel_payment_link":
      return (
        <ConfirmationChip
          detail={(data as { slug?: string }).slug ?? undefined}
          label="PAYMENT LINK CANCELLED"
          tone="neutral"
        />
      );
    default: {
      // ─── On-chain write receipts (default for write tools that
      //     emit a `tx` digest, per legacy CARD_RENDERERS fallback). ──
      if (WRITE_TOOLS_WITH_RECEIPT.has(toolName)) {
        return (
          <TransactionReceiptCard
            data={data as Parameters<typeof TransactionReceiptCard>[0]["data"]}
            toolName={toolName}
          />
        );
      }
      return null;
    }
  }
}

export function ToolResultRouter({
  part,
  onSendMessage,
}: {
  part: ToolUIPart;
  onSendMessage?: (text: string) => void;
}) {
  const toolName = part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : part.type;

  // Skeleton state — the input is still streaming from the model, or
  // it's been dispatched and we're awaiting the tool result. Renders
  // an animate-pulse placeholder shaped like the eventual output so
  // the page doesn't jump when the real card lands. Tools mapped to
  // `null` in `skeleton-variants.ts` (e.g. `render_canvas`,
  // `spending_analytics`) fall through to the generic Tool view.
  if (part.state === "input-streaming" || part.state === "input-available") {
    const variant = getSkeletonVariant(toolName);
    if (variant !== null) {
      return <SkeletonCard variant={variant} />;
    }
  }

  if (part.state === "output-available") {
    const card = renderCard(
      toolName,
      part.output,
      part.toolCallId,
      onSendMessage
    );
    if (card !== null) {
      return card;
    }
  }

  return (
    <Tool className="w-full" defaultOpen={true}>
      <ToolHeader state={part.state} type={part.type} />
      <ToolContent>
        {part.input !== undefined && <ToolInput input={part.input} />}
        {(part.output !== undefined || part.errorText !== undefined) && (
          <ToolOutput errorText={part.errorText} output={part.output} />
        )}
      </ToolContent>
    </Tool>
  );
}
