'use client';

import type { EngineChatMessage, PendingAction, ToolExecution } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel } from './AgentStep';
import { ToolResultCard } from './ToolResultCard';
import { ThinkingState } from './ThinkingState';
import { ReasoningAccordion } from './ReasoningAccordion';
import { PermissionCard, type DenyReason } from './PermissionCard';
import { CanvasCard } from './CanvasCard';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { AudricMark } from '@/components/ui/AudricMark';

interface ChatMessageProps {
  message: EngineChatMessage;
  onActionResolve?: (action: PendingAction, approved: boolean, reason?: DenyReason) => void;
  autoApproveTools?: Set<string>;
  agentBudget?: number;
  onSendMessage?: (text: string) => void;
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

// Tools that share a card type — only the last result per group should render.
const CARD_GROUP: Record<string, string> = {
  allowance_status:   'allowance',
  toggle_allowance:   'allowance',
  update_daily_limit: 'allowance',
  update_permissions: 'allowance',
};

function dedupeToolCards(tools: ToolExecution[]): ToolExecution[] {
  // Find the last index for each singleton group
  const lastIdx: Record<string, number> = {};
  tools.forEach((t, i) => {
    const group = CARD_GROUP[t.toolName];
    if (group) lastIdx[group] = i;
  });
  return tools.filter((t, i) => {
    const group = CARD_GROUP[t.toolName];
    return !group || lastIdx[group] === i;
  });
}

function getInputAmount(input: unknown): number {
  if (!input || typeof input !== 'object') return Infinity;
  const inp = input as Record<string, unknown>;
  if (typeof inp.amount === 'number') return inp.amount;
  if (typeof inp.maxPrice === 'number') return inp.maxPrice;
  return Infinity;
}

export function ChatMessage({ message, onActionResolve, autoApproveTools, agentBudget = 0, onSendMessage }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-3" role="log" aria-label="Your message">
        <div className="max-w-[78%] bg-[var(--n800)] px-4 py-2.5 text-sm text-foreground break-words overflow-hidden" style={{ borderRadius: '16px 16px 4px 16px' }}>
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

      {hasPendingAction && onActionResolve && !(autoApproveTools?.has(message.pendingAction!.toolName)) && !(agentBudget > 0 && getInputAmount(message.pendingAction!.input) <= agentBudget) && (
        <PermissionCard
          action={message.pendingAction!}
          onResolve={onActionResolve}
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
          <span className="text-success mr-1.5 float-left mt-0.5 text-[12px]" aria-hidden="true">✦</span>
          <div className="text-foreground leading-relaxed overflow-hidden">
            {message.isStreaming ? (
              <span className="whitespace-pre-wrap">
                {message.content}
                <span className="inline-flex items-center ml-1.5 align-text-bottom">
                  <ThinkingState status="delivering" intensity="transitioning" />
                </span>
              </span>
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
          <span className="text-[11px] text-dim" aria-label={`${message.usage.inputTokens + message.usage.outputTokens} tokens used`}>
            {message.usage.inputTokens + message.usage.outputTokens} tokens
          </span>
        </div>
      )}
    </div>
  );
}
