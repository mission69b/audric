import { prisma } from '@/lib/prisma';

interface MessageLike {
  role: string;
  content?: unknown;
}

interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
}

/**
 * Extract unique tool names from engine messages.
 * Scans assistant message content blocks for tool_use entries.
 */
function extractToolNames(messages: MessageLike[]): string[] {
  const names = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content as Array<{ type: string; name?: string }>) {
      if (block.type === 'tool_use' && block.name) {
        names.add(block.name);
      }
    }
  }
  return [...names];
}

/**
 * Log a single engine invocation (chat or resume) to SessionUsage.
 * Fire-and-forget — callers should `.catch()` errors.
 *
 * @param priorMessageCount - Number of messages in the engine before this
 *   invocation ran. Used to extract tool names only from new messages,
 *   avoiding inflated counts from prior turns in multi-turn sessions.
 */
export async function logSessionUsage(
  address: string,
  sessionId: string,
  usage: UsageSnapshot,
  messages: MessageLike[],
  model?: string,
  priorMessageCount = 0,
): Promise<void> {
  const newMessages = priorMessageCount > 0 ? messages.slice(priorMessageCount) : messages;
  const toolNames = extractToolNames(newMessages);

  await prisma.sessionUsage.create({
    data: {
      address,
      sessionId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costUsd: usage.estimatedCostUsd,
      toolNames,
      model,
    },
  });
}
