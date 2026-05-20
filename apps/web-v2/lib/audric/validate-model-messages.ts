// ───────────────────────────────────────────────────────────────────────────
// validate-model-messages — Anthropic strict-shape safety net for web-v2.
//
// [S.213 — 2026-05-21] Ported from the legacy engine's
// `packages/engine/src/v2/validate-history.ts` (added in engine v2.0.5 after
// audric session s_1778993279816_47a9814c835d hit
// `messages.12.content.0: unexpected tool_use_id found in tool_result blocks`
// on a fast-path bundle resume).
//
// Production trigger that surfaced this in web-v2 (2026-05-21, post-S.212):
//
//   `messages.1: tool_use ids were found without tool_result blocks
//    immediately after: toolu_01DjSs7Fr96UqwfViqMCzgTF, ...`
//
// Root mechanism: when a stream is truncated mid-turn (Vercel 300s ceiling
// hit, browser disconnect, network blip) BETWEEN a tool's `tool-input-
// available` chunk and its `tool-output-available` chunk, the client part
// stays in `state: 'input-available'`. AI SDK's `convertToModelMessages`
// then emits an assistant `tool-call` ModelMessage for that part (gate is
// `state !== 'input-streaming'`) but produces NO matching `tool-result`
// ModelMessage (the tool-result switch only handles
// `output-available` / `output-error` / `output-denied`). The next POST
// round-trips this corrupt history → orphan tool_use blocks reach
// Anthropic → 400, and the rejection persists for every subsequent turn
// until the orphan is removed.
//
// Anthropic's contract (verified against `convert-to-anthropic-messages-
// prompt.ts` L443+ in @ai-sdk/anthropic@3.0.78):
//   1. Every `tool-call` (with `providerExecuted !== true`) in an
//      assistant message MUST have a matching `tool-result` in the
//      IMMEDIATELY following `tool` ModelMessage.
//   2. Every `tool-result` in a tool message MUST have a matching
//      `tool-call` in the IMMEDIATELY preceding assistant message.
//   3. Roles should not consecutively repeat after cleanup (Anthropic's
//      `groupIntoBlocks` merges them, but defense-in-depth keeps the
//      ModelMessage[] clean for debug logs / future provider swaps).
//   4. First message must be `user` (or `system`).
//
// Provider-executed tools (web_search, web_fetch, etc.) pair their
// tool-call + tool-result INSIDE the same assistant message — they're
// excluded from orphan checks.
//
// Single point of defense — sits between `convertToModelMessages()` and
// `audricAgent.stream({ messages })` in `app/api/chat/route.ts`. Runs in
// O(n) where n = messages count. No new deps.
// ───────────────────────────────────────────────────────────────────────────

import type { ModelMessage } from "ai";

/**
 * Returns the toolCallIds of every non-provider-executed `tool-call`
 * part in an assistant message's content. Provider-executed tools (e.g.
 * Anthropic's web_search) self-pair their result inline and aren't
 * subject to the next-message tool_result requirement.
 */
function extractToolCallIds(message: ModelMessage): string[] {
  if (message.role !== "assistant") {
    return [];
  }
  const content = message.content;
  if (typeof content === "string") {
    return [];
  }
  const ids: string[] = [];
  for (const part of content) {
    if (
      part.type === "tool-call" &&
      part.providerExecuted !== true &&
      typeof part.toolCallId === "string"
    ) {
      ids.push(part.toolCallId);
    }
  }
  return ids;
}

/**
 * Returns the toolCallIds of every `tool-result` part in a tool
 * message's content. Tool messages can also carry
 * `tool-approval-response` parts (HITL); those are ignored here.
 */
function extractToolResultIds(message: ModelMessage): string[] {
  if (message.role !== "tool") {
    return [];
  }
  const ids: string[] = [];
  for (const part of message.content) {
    if (part.type === "tool-result" && typeof part.toolCallId === "string") {
      ids.push(part.toolCallId);
    }
  }
  return ids;
}

/**
 * Strips tool-call blocks from an assistant message whose ids aren't in
 * `keepIds`. Returns the message with the same shape (or `null` if the
 * resulting content is empty — caller drops the message in that case).
 */
function stripOrphanToolCalls(
  message: ModelMessage,
  keepIds: Set<string>
): ModelMessage | null {
  if (message.role !== "assistant") {
    return message;
  }
  const content = message.content;
  if (typeof content === "string") {
    return message;
  }
  const cleaned = content.filter((part) => {
    if (
      part.type === "tool-call" &&
      part.providerExecuted !== true &&
      typeof part.toolCallId === "string"
    ) {
      return keepIds.has(part.toolCallId);
    }
    return true;
  });
  if (cleaned.length === 0) {
    return null;
  }
  return { ...message, content: cleaned };
}

/**
 * Strips tool-result blocks from a tool message whose ids aren't in
 * `keepIds`. Returns the message with the same shape (or `null` if the
 * resulting content is empty).
 */
function stripOrphanToolResults(
  message: ModelMessage,
  keepIds: Set<string>
): ModelMessage | null {
  if (message.role !== "tool") {
    return message;
  }
  const cleaned = message.content.filter((part) => {
    if (part.type === "tool-result" && typeof part.toolCallId === "string") {
      return keepIds.has(part.toolCallId);
    }
    return true;
  });
  if (cleaned.length === 0) {
    return null;
  }
  return { ...message, content: cleaned };
}

/**
 * Merges two consecutive messages of the same role into one. The merged
 * content is the concatenation of both content arrays. String content
 * is wrapped into a single text part before concatenation (mirrors the
 * legacy engine's behavior).
 *
 * Returns the merged message.
 */
function mergeSameRole(a: ModelMessage, b: ModelMessage): ModelMessage {
  if (a.role !== b.role) {
    throw new Error(
      `mergeSameRole called with mismatched roles: ${a.role} + ${b.role}`
    );
  }
  if (a.role === "system" || b.role === "system") {
    // System messages have string content. Concatenate with newline.
    return {
      role: "system",
      content: `${typeof a.content === "string" ? a.content : ""}\n${typeof b.content === "string" ? b.content : ""}`,
    };
  }
  const aContent =
    typeof a.content === "string"
      ? [{ type: "text" as const, text: a.content }]
      : a.content;
  const bContent =
    typeof b.content === "string"
      ? [{ type: "text" as const, text: b.content }]
      : b.content;
  // The discriminated union forbids mixing tool-result parts (tool
  // role) with text/file/image parts (user/assistant roles). We only
  // merge same-role messages, so the resulting content array is
  // structurally valid for the shared role; the `as any` localizes the
  // union narrowing limitation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ...a, content: [...aContent, ...bContent] as any };
}

/**
 * Counts the total number of `tool-call` and `tool-result` parts across
 * an entire `ModelMessage[]`. Used to detect content-level cleanup that
 * a simple message-count comparison would miss (e.g. an assistant
 * message that had text + 3 orphan tool-calls — the message survives
 * because text remains, but the tool-call parts were stripped).
 */
export function countToolParts(messages: readonly ModelMessage[]): {
  toolCalls: number;
  toolResults: number;
} {
  let toolCalls = 0;
  let toolResults = 0;
  for (const msg of messages) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-call" && part.providerExecuted !== true) {
          toolCalls++;
        }
      }
    }
    if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type === "tool-result") {
          toolResults++;
        }
      }
    }
  }
  return { toolCalls, toolResults };
}

/**
 * Walks a `ModelMessage[]` and strips Anthropic-invariant violations.
 *
 * Returns a new array (input is not mutated). Empty input returns `[]`.
 *
 * Safe to call multiple times — idempotent on clean input (clean ===
 * unchanged shape, modulo object identity).
 */
export function validateModelMessages(
  messages: readonly ModelMessage[]
): ModelMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const result: ModelMessage[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    // ── Pass 1: assistant-with-tool-calls → check next is tool with all results
    if (msg.role === "assistant") {
      const toolCallIds = extractToolCallIds(msg);
      if (toolCallIds.length > 0) {
        const next = messages[i + 1];
        const nextResultIds = next
          ? new Set(extractToolResultIds(next))
          : new Set<string>();

        // Strip orphan tool-calls (no matching tool-result in next).
        const cleanAssistant = stripOrphanToolCalls(msg, nextResultIds);

        if (cleanAssistant !== null) {
          result.push(cleanAssistant);
        }

        // Strip orphan tool-results (whose tool-call was just removed).
        if (next && next.role === "tool") {
          const keptToolCallIds = new Set(
            cleanAssistant ? extractToolCallIds(cleanAssistant) : []
          );
          const cleanNext = stripOrphanToolResults(next, keptToolCallIds);
          if (cleanNext !== null) {
            result.push(cleanNext);
          }
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
    }

    // ── Pass 2: tool message → strip orphans whose tool-call isn't in prior assistant
    if (msg.role === "tool") {
      const prevAssistant = result.at(-1);
      const prevToolCallIds = new Set(
        prevAssistant && prevAssistant.role === "assistant"
          ? extractToolCallIds(prevAssistant)
          : []
      );
      const cleanTool = stripOrphanToolResults(msg, prevToolCallIds);
      if (cleanTool !== null) {
        result.push(cleanTool);
      }
      i += 1;
      continue;
    }

    // Default: pass through (system / user / assistant-without-tool-calls).
    result.push(msg);
    i += 1;
  }

  // ── Pass 3: merge consecutive same-role messages (a side-effect of the
  // strips above when an entire message is removed between two same-role
  // messages).
  const merged: ModelMessage[] = [];
  for (const msg of result) {
    const last = merged.at(-1);
    if (last && last.role === msg.role) {
      merged[merged.length - 1] = mergeSameRole(last, msg);
    } else {
      merged.push(msg);
    }
  }

  // ── Pass 4: shift off leading non-user messages and lead
  // tool-result-only messages. Anthropic rejects any prompt whose first
  // message isn't `user` (or system, which we treat as a pre-prompt
  // and ignore at this stage — system messages are filtered in the
  // route before reaching here). A lead `tool` message has no preceding
  // assistant → all its tool-results are orphans.
  while (merged.length > 0) {
    const head = merged[0];
    if (head.role === "system") {
      // Defensive: system shouldn't reach this gate but if it does, keep it.
      break;
    }
    if (head.role !== "user") {
      merged.shift();
      continue;
    }
    break;
  }

  return merged;
}
