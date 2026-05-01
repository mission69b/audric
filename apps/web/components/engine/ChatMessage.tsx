'use client';

import type { EngineChatMessage, PendingAction, ToolExecution } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel } from './AgentStep';
import { ToolResultCard } from './ToolResultCard';
import { ThinkingState } from './ThinkingState';
import { ReasoningAccordion } from './ReasoningAccordion';
import { ReasoningTimeline } from './ReasoningTimeline';
import { PermissionCard, type DenyReason } from './PermissionCard';
import { CanvasCard } from './CanvasCard';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { AudricMark } from '@/components/ui/AudricMark';
import { useVoiceModeContext } from '@/components/dashboard/VoiceModeContext';
import { VoiceHighlightedText } from '@/components/dashboard/VoiceHighlightedText';
import { isInteractiveHarnessEnabled } from '@/lib/interactive-harness';

interface ChatMessageProps {
  message: EngineChatMessage;
  onActionResolve?: (
    action: PendingAction,
    approved: boolean,
    reason?: DenyReason,
    modifications?: Record<string, unknown>,
  ) => void;
  /**
   * [v1.4 hotfix] Single tier-aware predicate that decides whether to
   * skip rendering the `<PermissionCard>` because the action will be
   * auto-resolved by `<UnifiedTimeline>`'s effect. Replaces the old
   * `autoApproveTools: Set<string>` + `agentBudget` pair, both of
   * which ignored the user's safety preset.
   */
  shouldAutoApprove?: (action: Pick<PendingAction, 'toolName' | 'input'>) => boolean;
  onSendMessage?: (text: string) => void;
  /** Saved contacts — passed through so PermissionCard can render
   *  the Saved-contact badge / near-contact warning / save field. */
  contacts?: ReadonlyArray<{ name: string; address: string }>;
  /** User's own zkLogin address — for the "self-send" badge. */
  walletAddress?: string | null;
  /** Concatenated last ~10 user messages — for the
   *  "Address from your message" badge. */
  recentUserText?: string;
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

export function ChatMessage({
  message,
  onActionResolve,
  shouldAutoApprove,
  onSendMessage,
  contacts,
  walletAddress,
  recentUserText,
}: ChatMessageProps) {
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
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3" role="log" aria-label="Your message">
        {/* User bubble — near-black with white text in BOTH light and dark.
            Cannot use bg-surface-inverse / text-fg-inverse here because those
            tokens semantically invert per theme (white-on-black in light flips
            to black-on-white in dark — wrong for a user chat chip). The
            --bubble-user-* token pair pins the bubble to "near-black + white"
            in both themes, matching the dark prototype's user-bubble frame
            (audric-app-dark/dashboard.jsx line 124) and the light prototype's
            equivalent (background:'var(--text)', color:'#fff'). The hairline
            border is invisible on the white page in light, but provides the
            #0A0A0A-on-#141414 separation the dark spec calls for. */}
        <div className="max-w-[78%] bg-bubble-user-bg px-4 py-2.5 text-sm text-bubble-user-fg break-words overflow-hidden border border-border-subtle" style={{ borderRadius: '16px 16px 4px 16px' }}>
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.tools && message.tools.length > 0;
  const hasCanvases = message.canvases && message.canvases.length > 0;
  const hasPendingAction = !!message.pendingAction;
  const hasContent = message.content.length > 0;
  const isOnlyStreaming = message.isStreaming && !hasContent && !hasTools;

  // [SPEC 8 v0.5.1 B2.2] Flag-gated path. When the interactive harness
  // flag is on AND the message has a populated timeline (B2.1 dual-write
  // ensures this for every engine ≥1.4.0 message), render the new
  // chronological ReasoningTimeline instead of the legacy section layout.
  // Flag OFF / empty timeline → fall through to today's render tree
  // unchanged.
  const useNewTimeline =
    isInteractiveHarnessEnabled() &&
    message.timeline !== undefined &&
    message.timeline.length > 0;

  if (useNewTimeline) {
    return (
      <div className="space-y-2" role="log" aria-label="Audric response">
        {/* Same "thinking-only" spinner as the legacy path — the timeline
            doesn't render anything until the first SSE event arrives, so
            we still need a "Audric is thinking" hint for early frames. */}
        {message.isThinking && !message.content && !hasTools && message.timeline!.length === 0 && (
          <div className="pl-1">
            <ThinkingState status="thinking" intensity="active" />
          </div>
        )}

        <ReasoningTimeline
          blocks={message.timeline!}
          isStreaming={message.isStreaming}
          onActionResolve={onActionResolve}
          onSendMessage={onSendMessage}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
        />

        {message.usage && !message.isStreaming && (
          <div className="flex justify-start pl-1">
            <span
              className="text-[11px] text-fg-muted"
              aria-label={`${message.usage.inputTokens + message.usage.outputTokens} tokens used`}
            >
              {message.usage.inputTokens + message.usage.outputTokens} tokens
            </span>
          </div>
        )}
      </div>
    );
  }

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

      {hasPendingAction && onActionResolve && !shouldAutoApprove?.(message.pendingAction!) && (
        <PermissionCard
          action={message.pendingAction!}
          onResolve={onActionResolve}
          contacts={contacts}
          walletAddress={walletAddress}
          recentUserText={recentUserText}
        />
      )}

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
