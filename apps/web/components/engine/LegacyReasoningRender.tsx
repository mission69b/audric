'use client';

import type { EngineChatMessage, PendingAction, ToolExecution } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel } from './AgentStep';
import { ToolResultCard } from './ToolResultCard';
import { ThinkingState } from './ThinkingState';
import { ReasoningAccordion } from './ReasoningAccordion';
import { PermissionCard, type DenyReason } from './PermissionCard';
import { CanvasCard } from './CanvasCard';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { useVoiceModeContext } from '@/components/dashboard/VoiceModeContext';
import { VoiceHighlightedText } from '@/components/dashboard/VoiceHighlightedText';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.3 — LegacyReasoningRender
//
// The pre-B2 "tools section first → reasoning accordion → final text"
// renderer, extracted into a dedicated component so:
//   1. <ChatMessage> can be a thin gate that picks between the legacy
//      tree and the new <ReasoningTimeline> based on the per-session
//      pinned harness version.
//   2. The legacy tree is now an explicit, named removal target — when
//      we reach 100% rollout for the new timeline, deleting this file
//      (plus its consumer branch in ChatMessage) is a single-PR cleanup.
//   3. Voice-mode hooks (`useVoiceModeContext`) only fire on the path
//      that actually renders text content, instead of being called
//      unconditionally from ChatMessage even on the v2 path.
//
// Behavior is byte-for-byte identical to the pre-extraction tree —
// see B3.3 commit for the diff. NO new logic introduced here.
// ───────────────────────────────────────────────────────────────────────────

interface LegacyReasoningRenderProps {
  message: EngineChatMessage;
  onActionResolve?: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  // [F14-fix-2 / 2026-05-03] MUST include `steps` so bundle iteration in
  // `shouldClientAutoApprove` runs. The legacy path already passes the
  // full `message.pendingAction!` so this is just tightening the type to
  // catch any future callsite that strips `steps` at compile time.
  shouldAutoApprove?: (
    action: Pick<PendingAction, 'toolName' | 'input' | 'steps'>,
  ) => boolean;
  onSendMessage?: (text: string) => void;
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  walletAddress?: string | null;
  recentUserText?: string;
  /**
   * [SPEC 7 P2.4b] Quote-Refresh handler — wired through to the
   * legacy `<PermissionCard>` so legacy-pinned sessions also benefit
   * from the Regenerate button. Bundle pending_actions only.
   */
  onRegenerate?: (action: PendingAction) => void;
  regeneratingAttemptIds?: ReadonlySet<string>;
}

function ToolSteps({ tools }: { tools: ToolExecution[] }) {
  const runningCount = tools.filter((t) => t.status === 'running').length;
  const isParallel = runningCount >= 2;

  if (isParallel && tools.length >= 2) {
    return (
      <AgentStep
        icon="⊞"
        label="RUNNING TASKS IN PARALLEL"
        status={tools.some((t) => t.status === 'running') ? 'running' : 'done'}
        collapsible
        defaultExpanded
      >
        <div className="space-y-0.5">
          {tools.map((tool) => (
            <AgentStep
              key={tool.toolUseId}
              icon={getStepIcon(tool.toolName)}
              label={getStepLabel(tool.toolName)}
              status={tool.status}
            />
          ))}
        </div>
      </AgentStep>
    );
  }

  return (
    <div className="space-y-0.5">
      {tools.map((tool) => (
        <AgentStep
          key={tool.toolUseId}
          icon={getStepIcon(tool.toolName)}
          label={getStepLabel(tool.toolName)}
          status={tool.status}
        />
      ))}
    </div>
  );
}

// [SIMPLIFICATION DAY 7] Tool-card grouping/dedupe was only used by the four
// allowance_* tools (now removed). Render every tool result as-is until a new
// multi-tool card group emerges that needs collapsing.
function dedupeToolCards(tools: ToolExecution[]): ToolExecution[] {
  return tools;
}

export function LegacyReasoningRender({
  message,
  onActionResolve,
  shouldAutoApprove,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
  onRegenerate,
  regeneratingAttemptIds,
}: LegacyReasoningRenderProps) {
  // Voice mode: when this assistant message is the one currently being
  // spoken aloud, swap the markdown renderer for the word-highlight
  // variant so the UI matches Claude's "lighter color = not yet spoken"
  // playback indicator. Falls back to the standard renderer at all other
  // times — including for older messages and once TTS has finished.
  const voice = useVoiceModeContext();
  const isBeingSpoken =
    voice.state === 'speaking' &&
    voice.speakingMessageId === message.id &&
    !!voice.currentSpans;

  const hasTools = message.tools && message.tools.length > 0;
  const hasCanvases = message.canvases && message.canvases.length > 0;
  const hasPendingAction = !!message.pendingAction;
  const hasContent = message.content.length > 0;
  const isOnlyStreaming = message.isStreaming && !hasContent && !hasTools;

  return (
    <div className="space-y-2" role="log" aria-label="Audric response">
      {hasTools && (
        <div className="pl-1" role="status" aria-label="Agent activity">
          <ToolSteps tools={message.tools!} />
          {!message.isStreaming && dedupeToolCards(message.tools!).map((tool) => (
            <ToolResultCard key={`card-${tool.toolUseId}`} tool={tool} />
          ))}
        </div>
      )}

      {hasCanvases && !message.isStreaming && (
        <div className="pl-1 space-y-2">
          {message.canvases!.map((canvas) => (
            <CanvasCard
              key={canvas.toolUseId}
              canvas={canvas}
              onSendMessage={onSendMessage}
            />
          ))}
        </div>
      )}

      {hasPendingAction && onActionResolve && !shouldAutoApprove?.(message.pendingAction!) && (() => {
        const action = message.pendingAction!;
        // [SPEC 7 P2.4b + SPEC 15 v0.7 follow-up — single-write
        // regenerate, 2026-05-04] Pre-v0.7 the gate was
        // `isBundle && canRegenerate && regenerateInput`. v0.7
        // dropped the bundle-only gate because `@t2000/engine`
        // ≥1.16.0 stamps `canRegenerate=true` on confirm-tier
        // single-write actions whose composition consumed a
        // regeneratable read (e.g. a $50 swap_execute that
        // referenced a prior `swap_quote`). Keeping the
        // `canRegenerate` + `regenerateInput` checks ensures the
        // slot stays empty for actions whose inputs came from user
        // text (no upstream read to re-fire). Same shape applies in
        // `PermissionCardBlockView`.
        const showRegenerate = Boolean(
          onRegenerate && action.canRegenerate && action.regenerateInput,
        );
        return (
          <PermissionCard
            action={action}
            onResolve={onActionResolve}
            contacts={contacts}
            walletAddress={walletAddress}
            recentUserText={recentUserText}
            regenerate={
              showRegenerate
                ? {
                    onRegenerate: () => onRegenerate?.(action),
                    isRegenerating:
                      regeneratingAttemptIds?.has(action.attemptId) ?? false,
                  }
                : undefined
            }
          />
        );
      })()}

      {message.isThinking && !message.content && !hasTools && (
        <div className="pl-1">
          <ThinkingState status="thinking" intensity="active" />
        </div>
      )}

      {isOnlyStreaming && !message.isThinking && !message.thinking && (
        <div className="pl-1">
          <ThinkingState status="thinking" intensity="active" />
        </div>
      )}

      {message.thinking && !message.isThinking && (
        <ReasoningAccordion thinking={message.thinking} isStreaming={message.isStreaming} />
      )}

      {hasContent && (
        <div
          className="pl-1 text-sm"
          aria-live={message.isStreaming ? 'polite' : 'off'}
          aria-atomic="false"
        >
          <span className="text-success-solid mr-1.5 float-left mt-0.5 text-[12px]" aria-hidden="true">✦</span>
          <div className="text-fg-primary leading-relaxed overflow-hidden">
            {message.isStreaming ? (
              <span className="whitespace-pre-wrap">
                {message.content}
                <span className="inline-flex items-center ml-1.5 align-text-bottom">
                  <ThinkingState status="delivering" intensity="transitioning" />
                </span>
              </span>
            ) : isBeingSpoken ? (
              <VoiceHighlightedText
                text={message.content}
                spans={voice.currentSpans!}
                spokenWordIndex={voice.spokenWordIndex}
              />
            ) : (
              <AgentMarkdown text={message.content} />
            )}
          </div>
          {message.isStreaming && (
            <span className="sr-only">Audric is typing</span>
          )}
        </div>
      )}

      {message.usage && !message.isStreaming && (
        <div className="flex justify-start pl-1">
          <span className="text-[11px] text-fg-muted" aria-label={`${message.usage.inputTokens + message.usage.outputTokens} tokens used`}>
            {message.usage.inputTokens + message.usage.outputTokens} tokens
          </span>
        </div>
      )}
    </div>
  );
}
