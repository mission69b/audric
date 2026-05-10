/**
 * Helpers for `app/api/engine/sessions/[id]/route.ts`.
 *
 * Lives in a sibling file because Next.js App Router forbids
 * non-handler exports from `route.ts` files (build type-check fails
 * with: _Type error: Route "..." does not match the required types of
 * a Next.js Route. "convertSessionMessages" is not a valid Route
 * export field._). This `route-helpers.ts` + `route.test.ts` pattern
 * mirrors `app/api/engine/resume-with-input/`.
 *
 * Currently exports `convertSessionMessages`, which converts the
 * engine's persisted Anthropic-shaped message ledger (alternating
 * user/assistant with `tool_use` / `tool_result` blocks) into the
 * flat `ChatMessage[]` shape the client renders.
 */

import {
  SESSION_BOOTSTRAP_SENTINEL,
  stripLlmDirectives,
} from '@/lib/engine/strip-llm-directives';

export interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  id?: string;
  toolUseId?: string;
  input?: unknown;
  content?: string;
  isError?: boolean;
}

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  tools?: {
    toolName: string;
    toolUseId: string;
    input: unknown;
    status: 'done' | 'error';
    result?: unknown;
    isError?: boolean;
  }[];
  // [B3.4 / Gap J] Optional interruption flag — set on the LAST
  // assistant message when `metadata.lastInterruption` matches its
  // turn index. Powers the `<RetryInterruptedTurn>` pill on rehydrate.
  interrupted?: boolean;
  interruptedReplayText?: string;
}

export function convertSessionMessages(
  messages: SessionMessage[],
  createdAt: number,
): ChatMessage[] {
  const result: ChatMessage[] = [];
  let idx = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'user') {
      const textBlocks = msg.content.filter((b) => b.type === 'text');
      if (textBlocks.length === 0) continue;

      // [spec_session_refresh_chat_divergence / 2026-05-11] Strip
      // LLM-only meta-directives that audric + the engine prepend to
      // the user message text for grounding. The live SSE stream
      // never echoes these blocks back; rehydrate must match the
      // live surface or the user sees `<post_write_anchor>...` and
      // `<canonical_route>...` rendered verbatim. See the helper for
      // the full list of stripped tags + the bootstrap-sentinel
      // handling rationale.
      const rawText = textBlocks.map((b) => b.text ?? '').join('\n').trim();
      if (rawText === SESSION_BOOTSTRAP_SENTINEL) continue;
      const cleanedText = stripLlmDirectives(rawText);
      if (cleanedText.length === 0) continue;

      result.push({
        id: `hist_${idx++}`,
        role: 'user',
        content: cleanedText,
        timestamp: createdAt + i * 1000,
      });
    } else if (msg.role === 'assistant') {
      const textParts = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '');

      const thinkingParts = msg.content
        .filter((b) => b.type === 'thinking')
        .map((b) => (b as unknown as { thinking: string }).thinking ?? '');
      const thinking = thinkingParts.length > 0 ? thinkingParts.join('\n') : undefined;

      const toolUses = msg.content.filter((b) => b.type === 'tool_use');
      const nextMsg = messages[i + 1];
      const toolResultMap = new Map<string, ContentBlock>();

      if (nextMsg?.role === 'user') {
        for (const b of nextMsg.content) {
          if (b.type === 'tool_result' && b.toolUseId) {
            toolResultMap.set(b.toolUseId, b);
          }
        }
      }

      const tools = toolUses.map((tu) => {
        const resultBlock = toolResultMap.get(tu.id!);
        return {
          toolName: tu.name!,
          toolUseId: tu.id!,
          input: tu.input,
          status: (resultBlock?.isError ? 'error' : 'done') as 'done' | 'error',
          result: resultBlock?.content ? tryParseJson(resultBlock.content) : undefined,
          isError: resultBlock?.isError,
        };
      });

      result.push({
        id: `hist_${idx++}`,
        role: 'assistant',
        content: textParts.join('\n'),
        timestamp: createdAt + i * 1000,
        ...(tools.length > 0 ? { tools } : {}),
        ...(thinking ? { thinking } : {}),
      });
    }
  }

  return result;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
