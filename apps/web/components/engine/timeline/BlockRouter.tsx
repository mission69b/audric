'use client';

import type { TimelineBlock, PendingAction } from '@/lib/engine-types';
import type { DenyReason } from '../PermissionCard';
import type { TextBlockVoiceSlice } from '@/lib/voice/timeline-voice-slices';
import { ThinkingBlockView } from './ThinkingBlockView';
import { ToolBlockView } from './ToolBlockView';
import { TextBlockView } from './TextBlockView';
import { TodoBlockView } from './TodoBlockView';
import { CanvasBlockView } from './CanvasBlockView';
import { PermissionCardBlockView } from './PermissionCardBlockView';
import { PendingInputBlockView } from './PendingInputBlockView';
import { RegeneratedBlockView } from './RegeneratedBlockView';
import { ContactResolvedBlockView } from './ContactResolvedBlockView';
import { PlanStreamBlockView } from './PlanStreamBlockView';
import { BundleReceiptBlockView } from './BundleReceiptBlockView';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — BlockRouter (B2.2)
//
// Switch over TimelineBlock.type → render the right per-block view.
// TypeScript exhaustiveness on the discriminated union guarantees we
// never miss a variant. When SPEC 9 adds new block types, the compiler
// flags every router that hasn't been updated.
//
// Single-block path. Parallel groups go through ParallelToolsGroup.
// ───────────────────────────────────────────────────────────────────────────

interface BlockRouterProps {
  block: TimelineBlock;
  isStreaming?: boolean;
  onActionResolve?: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  onSendMessage?: (text: string) => void;
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  walletAddress?: string | null;
  recentUserText?: string;
  /**
   * [B3.1 / audit Gap A] Forwarded to `PermissionCardBlockView` so the
   * new timeline path matches `ChatMessage.tsx`'s legacy auto-approve
   * gating. See `PermissionCardBlockView` for the contract.
   */
  // [F14-fix-2 / 2026-05-03] MUST include `steps` so bundle iteration
  // runs in `shouldClientAutoApprove`. See PermissionCardBlockView.tsx
  // F14-fix-2 comment for the full root-cause writeup.
  shouldAutoApprove?: (
    action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>,
  ) => boolean;
  /**
   * [SPEC 7 P2.4b] Quote-Refresh wiring. Passed through to
   * `PermissionCardBlockView` which forwards to the underlying
   * `PermissionCard.regenerate` slot. Only consulted on bundle
   * payloads whose `canRegenerate === true`. The `regeneratingAttemptIds`
   * set lets the renderer mark the in-flight regenerate state without
   * a per-card React refactor.
   */
  onRegenerate?: (action: PendingAction) => void;
  regeneratingAttemptIds?: ReadonlySet<string>;
  /**
   * [SPEC 9 v0.1.3 P9.4] Submit handler for `pending-input` blocks.
   * Receives `(inputId, values)` where `inputId` is the engine-stamped
   * UUID v4 and `values` is the typed result of the inline form. The
   * parent (`useEngine.handlePendingInputSubmit`) flips the block's
   * status, POSTs to `/api/engine/resume-with-input`, and streams the
   * resumed-turn SSE response into the same timeline.
   */
  onPendingInputSubmit?: (inputId: string, values: Record<string, unknown>) => void;
  /**
   * [B3.3 / G8] Controlled-mode expansion state for thinking blocks.
   * The parent (`<ReasoningTimeline>`) owns the per-message
   * `Map<blockIndex, ...>` and forwards the relevant slice to each
   * thinking block via these two props. `undefined` for non-thinking
   * blocks (and for thinking blocks when a non-timeline consumer of
   * `<BlockRouter>` opts out of controlled mode).
   */
  thinkingExpanded?: boolean;
  onToggleThinking?: () => void;
  /**
   * [B3.4 / Gap F] Voice slice for THIS block (only meaningful when
   * `block.type === 'text'` and TTS is active for the message). The
   * parent computes one slice per text block via
   * `computeTextBlockVoiceSlices(blocks, spans)` and forwards the
   * matching entry. Undefined for non-text blocks and on every
   * non-active assistant message.
   */
  voiceSlice?: TextBlockVoiceSlice;
  /**
   * [B3.4 / Gap F] Global `spokenWordIndex` from `useVoiceModeContext`.
   * Forwarded as-is — `<TextBlockView>` re-bases it via
   * `localSpokenWordIndex(slice, idx)`.
   */
  spokenWordIndex?: number;
  /**
   * [S.123 v0.55.x] Self-healing zkLogin recovery handler. Wired to
   * `useZkLogin.refresh` (logout + login) at the dashboard. Forwarded
   * to `BundleReceiptBlockView` which renders an inline "Sign back in"
   * button when a bundle's `sessionExpired === true`.
   */
  onSignBackIn?: () => void;
}

export function BlockRouter({
  block,
  isStreaming,
  onActionResolve,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  shouldAutoApprove,
  thinkingExpanded,
  onToggleThinking,
  voiceSlice,
  spokenWordIndex,
  onRegenerate,
  regeneratingAttemptIds,
  onPendingInputSubmit,
  onSignBackIn,
}: BlockRouterProps) {
  switch (block.type) {
    case 'thinking':
      return (
        <ThinkingBlockView
          block={block}
          expanded={thinkingExpanded}
          onToggle={onToggleThinking}
        />
      );

    case 'tool':
      return <ToolBlockView block={block} isStreaming={isStreaming} />;

    case 'text':
      return (
        <TextBlockView
          block={block}
          voiceSlice={voiceSlice}
          spokenWordIndex={spokenWordIndex}
        />
      );

    case 'todo':
      return <TodoBlockView block={block} />;

    case 'canvas':
      return <CanvasBlockView block={block} onSendMessage={onSendMessage} />;

    case 'permission-card':
      if (!onActionResolve) return null;
      return (
        <PermissionCardBlockView
          block={block}
          onActionResolve={onActionResolve}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
          shouldAutoApprove={shouldAutoApprove}
          onRegenerate={onRegenerate}
          regeneratingAttemptIds={regeneratingAttemptIds}
        />
      );

    case 'pending-input':
      // Without a submit handler the form would be a no-op — fall back
      // to null rather than rendering a half-broken UI.
      if (!onPendingInputSubmit) return null;
      return <PendingInputBlockView block={block} onSubmit={onPendingInputSubmit} />;

    case 'regenerated':
      return <RegeneratedBlockView block={block} />;

    case 'contact-resolved':
      return <ContactResolvedBlockView block={block} />;

    case 'plan-stream':
      return <PlanStreamBlockView block={block} />;

    case 'bundle-receipt':
      return <BundleReceiptBlockView block={block} onSignBackIn={onSignBackIn} />;
  }
}
