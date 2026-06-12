"use client";

import type { ToolUIPart } from "ai";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { ConfirmationChip } from "./cards/ConfirmationChip";
import { MppResultCard } from "./cards/MppResultCard";
import { extractData } from "./cards/primitives";
import { SwapQuoteCardV2 } from "./cards/SwapQuoteCardV2";
import { TransactionReceiptCard } from "./cards/TransactionReceiptCard";

/**
 * ToolResultRouter — discriminated renderer for AI SDK `tool-*` parts.
 *
 * Renders:
 *  - AI Elements `<Tool>` accordion while the tool input is streaming /
 *    dispatched (a compact "name · Running" row the user can watch) —
 *    matches vercel/chatbot's `tool-getWeather` running state.
 *  - A rich Audric card for tools in the switch below once output lands
 *    (the bare card replaces the running accordion, like the demo's
 *    `<Weather>` on `output-available`).
 *  - Generic AI Elements `<Tool>` JSON dump otherwise.
 *
 * [SPEC_AUDRIC_DEFI_REMOVAL §2e — 2026-06-10] Render-surface collapse:
 * chat renders the agent's *transactional output* only (Services results
 * + Pay receipts). The DeFi read cards (rates / balance / health /
 * savings / portfolio / yield / rewards / prices), the explorer cards
 * (history / explain_tx / activity), the payment-link cards (deferred to
 * Audric Store), the standalone SuiNS card (resolution folds into the
 * send confirm), and the entire `render_canvas` subsystem were deleted.
 * Read tools that survive (`balance_check`, `transaction_history`,
 * `resolve_suins`) answer in prose — no card.
 *
 * Grace-window surfaces (cut after the §2d 7-day exit window closes):
 * `swap_quote` card + `withdraw` / `repay_debt` / `swap_execute`
 * receipts and denial pills.
 */

const WRITE_TOOLS_WITH_RECEIPT = new Set([
  "send_transfer",
  // §2d grace window — cut post-window:
  "withdraw",
  "repay_debt",
  "swap_execute",
]);

// [S.296 — 2026-05-24] Denial pill labels per write tool. Replaces
// the generic `<Tool>` JSON dump that fired after Deny tap pre-fix
// (founder smoke catch — "i see the json after pressing deny instead
// of any card"). Pill is quiet + neutral by design: the user already
// saw what they denied on the PermissionCard above, the pill just
// confirms it's gone. Falls back to a derived label for any write
// tool not in the map.
const DENIAL_LABELS: Record<string, string> = {
  send_transfer: "TRANSFER CANCELLED",
  // §2d grace window — cut post-window:
  withdraw: "WITHDRAW CANCELLED",
  repay_debt: "REPAY CANCELLED",
  swap_execute: "SWAP CANCELLED",
};

// Exact string written by BOTH deny paths:
//   - audric-chat-client.tsx PermissionCard `onDeny` (client click)
//   - route.ts translateChunk `tool-output-denied` mapper (server-side
//     denial event from engine-level guard rejections post-approval)
// Keep this match string-exact — any other `errorText` is a real error
// and should still hit the generic <Tool> fallback so the user sees it.
export const USER_DENIAL_ERROR_TEXT = "User denied the action.";

function renderCard(toolName: string, output: unknown): React.ReactNode | null {
  // mpp_call hits ANY Service — render its result by output modality
  // (media chips + verbatim JSON), not a per-Service card. Handled before
  // the `extractData` unwrap because the payload lives in `output.body`,
  // not `output.data`.
  if (toolName === "mpp_call") {
    return <MppResultCard output={output} />;
  }

  const data = extractData(output);
  if (!(data && typeof data === "object")) {
    return null;
  }

  switch (toolName) {
    // §2d grace window — exit-quote card; cut with the swap verb
    // post-window.
    case "swap_quote":
      return (
        <SwapQuoteCardV2
          data={data as Parameters<typeof SwapQuoteCardV2>[0]["data"]}
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
}: {
  part: ToolUIPart;
  onSendMessage?: (text: string) => void;
}) {
  const toolName = part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : part.type;

  // [S.296 — 2026-05-24] Both deny paths (PermissionCard onDeny click
  // in audric-chat-client.tsx + translateChunk `tool-output-denied`
  // mapper in route.ts) emit `state: 'output-error'` with the exact
  // errorText `USER_DENIAL_ERROR_TEXT`. Pre-fix this fell through to
  // the generic <Tool> renderer below, which dumped `part.input` as
  // raw JSON ("Parameters { amount: 5, asset: 'USDC' }") + "Error
  // User denied the action." — confusing because the user just denied
  // the same parameters they'd already seen on the PermissionCard.
  // Quiet pill replaces the dump: the user saw the card, tapped Deny,
  // and the pill just confirms the action is gone.
  //
  // Why string-exact (`===`) not `startsWith`: any other errorText is
  // a real error (preflight rejection, runtime exception, etc.) and
  // must still hit the generic fallback so the user sees the actual
  // message.
  if (
    part.state === "output-error" &&
    part.errorText === USER_DENIAL_ERROR_TEXT
  ) {
    const label =
      DENIAL_LABELS[toolName] ??
      `${toolName.toUpperCase().replace(/_/g, " ")} CANCELLED`;
    return <ConfirmationChip glyph="×" label={label} tone="neutral" />;
  }

  // [B2 / vercel parity — 2026-05-30] While a tool is executing (or a
  // confirmed write is submitting after the PermissionCard tap), show the
  // vendored `<Tool>` accordion — a compact "name · Running" row the user
  // can watch and expand to see params — exactly like vercel/chatbot's
  // `tool-getWeather` running branch. On `output-available` (below) it
  // resolves into the bare rich card.
  if (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-responded"
  ) {
    return (
      <Tool className="w-full">
        <ToolHeader state={part.state} type={part.type} />
        <ToolContent>
          {part.input !== undefined && <ToolInput input={part.input} />}
        </ToolContent>
      </Tool>
    );
  }

  if (part.state === "output-available") {
    const card = renderCard(toolName, part.output);
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
