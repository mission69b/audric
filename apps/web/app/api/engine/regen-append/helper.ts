/**
 * SPEC 23B-MPP6-fastpath / 2026-05-12 — appendRegenToMessages helper.
 *
 * Lives next to `route.ts` rather than INSIDE it because Next.js 15
 * App Router forbids any export from a route handler other than HTTP
 * methods (GET/POST/...) + a short list of config knobs (runtime,
 * maxDuration, dynamic, ...). Exporting a pure helper from `route.ts`
 * is a `next build` type error — local `tsc --noEmit` doesn't catch
 * it. Sibling files in the same folder are NOT routes; they're freely
 * importable by both the route handler and tests.
 *
 * See `route.ts` for the full flow + lifecycle JSDoc.
 */
import type { Message, ContentBlock } from '@t2000/engine';

export interface AppendRegenInput {
  originalToolUseId: string;
  newToolUseId: string;
  input: { url: string; body?: string };
  payApiResult: unknown;
  isError: boolean;
}

export interface AppendRegenSuccess {
  messages: Message[];
}

export interface AppendRegenError {
  error: string;
  status: number;
}

/**
 * Pure helper — appends the regen tool_use + tool_result to the
 * existing assistant + user message pair that contained the original
 * pay_api dispatch. Preserves Claude's strict user/assistant
 * alternation by mutating IN PLACE rather than inserting new messages.
 *
 * Failure modes:
 *   - originalToolUseId not found in any assistant message → 404
 *   - originalToolUseId found, but no following user message exists →
 *     409 (the original call never completed; regen is meaningless)
 *   - originalToolUseId found, but the following user message has no
 *     tool_result for it → 409 (history corruption; regen can't safely
 *     append because we can't anchor on the original tool_result row)
 *   - newToolUseId already exists in any message → 409 (double-fire
 *     defense; the client's click latch should prevent this but we
 *     enforce server-side too)
 *
 * Returns the FULL updated messages array (immutable — original is
 * not mutated; only deep-cloned message i and i+1 are modified).
 */
export function appendRegenToMessages(
  messages: Message[],
  args: AppendRegenInput,
): AppendRegenSuccess | AppendRegenError {
  const { originalToolUseId, newToolUseId, input, payApiResult, isError } = args;

  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_use' && block.id === newToolUseId) {
        return { error: `newToolUseId ${newToolUseId} collides with existing tool_use`, status: 409 };
      }
      if (block.type === 'tool_result' && block.toolUseId === newToolUseId) {
        return { error: `newToolUseId ${newToolUseId} collides with existing tool_result`, status: 409 };
      }
    }
  }

  let assistantIdx = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role !== 'assistant') continue;
    const hasOriginal = messages[i].content.some(
      (b) => b.type === 'tool_use' && b.id === originalToolUseId,
    );
    if (hasOriginal) {
      assistantIdx = i;
      break;
    }
  }

  if (assistantIdx === -1) {
    return { error: `Original tool_use ${originalToolUseId} not found in session`, status: 404 };
  }

  const userIdx = assistantIdx + 1;
  if (userIdx >= messages.length || messages[userIdx].role !== 'user') {
    return {
      error: `Original tool_use ${originalToolUseId} has no following user message — call never completed`,
      status: 409,
    };
  }

  const userMsg = messages[userIdx];
  const hasOriginalResult = userMsg.content.some(
    (b) => b.type === 'tool_result' && b.toolUseId === originalToolUseId,
  );
  if (!hasOriginalResult) {
    return {
      error: `Following user message lacks tool_result for ${originalToolUseId} — history corrupted`,
      status: 409,
    };
  }

  const newToolUseBlock: ContentBlock = {
    type: 'tool_use',
    id: newToolUseId,
    name: 'pay_api',
    input,
  };

  const newToolResultBlock: ContentBlock = {
    type: 'tool_result',
    toolUseId: newToolUseId,
    content: typeof payApiResult === 'string' ? payApiResult : JSON.stringify(payApiResult),
    isError,
  };

  const updatedAssistant: Message = {
    ...messages[assistantIdx],
    content: [...messages[assistantIdx].content, newToolUseBlock],
  };
  const updatedUser: Message = {
    ...userMsg,
    content: [...userMsg.content, newToolResultBlock],
  };

  const nextMessages = [
    ...messages.slice(0, assistantIdx),
    updatedAssistant,
    updatedUser,
    ...messages.slice(userIdx + 1),
  ];

  return { messages: nextMessages };
}
