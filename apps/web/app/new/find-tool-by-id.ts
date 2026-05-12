/**
 * [SPEC 23B-MPP6-fastpath / 2026-05-12]
 *
 * Locate a previously executed tool call by `toolUseId` across the
 * engine message ledger. Used by `handleRegenerateToolCall` in
 * `dashboard-content.tsx` to recover the original `pay_api` input
 * (url + body) so the regen can fire with the same parameters as the
 * LLM-driven first call.
 *
 * Returns BOTH the matching tool AND the parent assistant message id —
 * the messageId is needed to anchor the optimistic upsert into the
 * SAME conversational turn that produced the original (otherwise old-
 * card regens render at the bottom of the chat instead of next to the
 * original; see useEngine.upsertToolBlock JSDoc for the full story).
 *
 * Triple-source lookup, in priority order:
 *   1. timeline[] tool block — populated by mergeWriteExecutionIntoTimeline
 *      in resolveAction with the correct action.input for confirm-tier
 *      writes. Also populated by applyEventToTimeline.tool_start for
 *      read-only tools.
 *   2. tools[] entry — populated by useEngine's SSE reducer. Now correct
 *      for confirm-tier writes too thanks to the pendingInputsRef root
 *      fix in useEngine.ts (see "SPEC 23B-MPP6-fastpath / 2026-05-12
 *      root fix" anchor). Also correct on session rehydration via
 *      convertSessionMessages reading tu.input from persisted Anthropic
 *      blocks.
 *   3. timeline[] permission-card.payload.input — fallback for the
 *      pathological case where mergeWriteExecutionIntoTimeline didn't
 *      fire (e.g. timeline was undefined when resolveAction ran) AND
 *      the SSE reducer's pendingInputsRef miss happened. This source
 *      always exists for confirm-tier writes because applyEventToTimeline
 *      stamps the full PendingAction onto a permission-card block
 *      when pending_action arrives.
 *
 * All three sources should agree post-root-fix. Belt+suspenders here
 * means: even if a regression breaks one source, the other two cover.
 *
 * Returns null when no message in scope holds the tool (e.g. session
 * truncated, race against rehydration, or the toolUseId came from a
 * stale render). Searches from newest-to-oldest because regens are
 * usually on recent cards — order doesn't affect correctness, only
 * hot-path latency.
 */

export interface FindToolMessage {
  id: string;
  role: 'user' | 'assistant';
  tools?: Array<{
    toolUseId: string;
    toolName: string;
    input: unknown;
    result?: unknown;
  }>;
  timeline?: Array<{
    type: string;
    toolUseId?: string;
    toolName?: string;
    input?: unknown;
    result?: unknown;
    payload?: { toolUseId?: string; toolName?: string; input?: unknown };
  }>;
}

export interface FindToolResult {
  tool: {
    toolUseId: string;
    toolName: string;
    input: unknown;
    result?: unknown;
  };
  messageId: string;
}

export function findToolByToolUseId(
  messages: FindToolMessage[],
  toolUseId: string,
): FindToolResult | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;

    const timelineMatch = msg.timeline?.find(
      (b) => b.type === 'tool' && b.toolUseId === toolUseId,
    );
    if (timelineMatch?.toolName !== undefined) {
      return {
        tool: {
          toolUseId,
          toolName: timelineMatch.toolName,
          input: timelineMatch.input ?? {},
          result: timelineMatch.result,
        },
        messageId: msg.id,
      };
    }

    const toolsMatch = msg.tools?.find((t) => t.toolUseId === toolUseId);
    if (toolsMatch) return { tool: toolsMatch, messageId: msg.id };

    const permissionCardMatch = msg.timeline?.find(
      (b) => b.type === 'permission-card' && b.payload?.toolUseId === toolUseId,
    );
    if (permissionCardMatch?.payload?.toolName !== undefined) {
      return {
        tool: {
          toolUseId,
          toolName: permissionCardMatch.payload.toolName,
          input: permissionCardMatch.payload.input ?? {},
          result: undefined,
        },
        messageId: msg.id,
      };
    }
  }
  return null;
}
