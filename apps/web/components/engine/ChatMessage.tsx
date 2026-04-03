'use client';

import type { EngineChatMessage, PendingAction, ToolExecution } from '@/lib/engine-types';
import { AgentStep, getStepIcon, getStepLabel } from './AgentStep';
import { ThinkingState } from './ThinkingState';
import { PermissionCard, type DenyReason } from './PermissionCard';
import { AgentMarkdown } from '@/components/dashboard/AgentMarkdown';
import { AudricMark } from '@/components/ui/AudricMark';

interface ChatMessageProps {
  message: EngineChatMessage;
  onActionResolve?: (action: PendingAction, approved: boolean, reason?: DenyReason) => void;
  autoApproveTools?: Set<string>;
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

export function ChatMessage({ message, onActionResolve, autoApproveTools }: ChatMessageProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" role="log" aria-label="Your message">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-surface border border-border px-4 py-2.5 text-sm text-foreground break-words overflow-hidden">
          {message.content}
        </div>
      </div>
    );
  }

  const hasTools = message.tools && message.tools.length > 0;
  const hasPendingAction = !!message.pendingAction;
  const hasContent = message.content.length > 0;
  const isOnlyStreaming = message.isStreaming && !hasContent && !hasTools;

  return (
    <div className="space-y-2" role="log" aria-label="Audric response">
      {hasTools && (
        <div className="pl-1" role="status" aria-label="Agent activity">
          <ToolSteps tools={message.tools!} />
        </div>
      )}

      {hasPendingAction && onActionResolve && !(autoApproveTools?.has(message.pendingAction!.toolName)) && (
        <PermissionCard
          action={message.pendingAction!}
          onResolve={onActionResolve}
        />
      )}

      {isOnlyStreaming && (
        <div className="pl-1">
          <ThinkingState status="thinking" intensity="active" />
        </div>
      )}

      {hasContent && (
        <div
          className="pl-1 text-sm"
          aria-live={message.isStreaming ? 'polite' : 'off'}
          aria-atomic="false"
        >
          <span className="text-dim mr-1.5 float-left mt-0.5" aria-hidden="true"><AudricMark size={14} /></span>
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
          <span className="text-[10px] text-dim font-mono" aria-label={`${message.usage.inputTokens + message.usage.outputTokens} tokens used`}>
            {message.usage.inputTokens + message.usage.outputTokens} tokens
          </span>
        </div>
      )}
    </div>
  );
}
