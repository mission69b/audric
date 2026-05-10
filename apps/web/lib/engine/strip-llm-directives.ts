/**
 * Strip LLM-only meta-directives from a persisted user-message text
 * before rendering on the rehydrate path.
 *
 * Why this exists: audric + the engine inject several `<…>` blocks into
 * the user message text the engine sees, so the LLM has fresh grounding
 * (canonical on-chain route, post-write balance anchor, bundle-revert
 * fact). The live SSE stream never echoes these blocks back — the live
 * client renders the user's typed input directly. But on session
 * rehydrate, the persisted ledger IS the source of truth, so the raw
 * directives leak into the rendered chat.
 *
 * Symptom: refresh a session and you see things like:
 *   <post_write_anchor> A write executed earlier in this session… swap 1 usdc to gold
 *   <canonical_route> The user just approved a swap. The CANONICAL route…
 *
 * This helper is the single source of truth for "what's user-facing vs.
 * LLM-facing in a persisted user message." Every render-time consumer
 * of `data.messages[i].content[j].text` for `role: 'user'` MUST pipe
 * through this helper. Today there are two: `convertSessionMessages`
 * (rehydrate, /api/engine/sessions/[id]) and the preview walker
 * (sidebar list, /api/engine/sessions).
 *
 * The `[session bootstrap]` sentinel is handled separately at the
 * caller level — the entire user-message row gets dropped, not just
 * the text (otherwise an empty user bubble renders). See
 * `SESSION_BOOTSTRAP_SENTINEL` below + the call sites.
 *
 * Directives currently stripped:
 *   - <canonical_route>...</canonical_route>     engine-side, post-write resume
 *                                                (packages/engine/src/engine.ts)
 *   - <post_write_anchor>...</post_write_anchor> audric-side, post-write chat
 *                                                (apps/web/app/api/engine/chat/route.ts)
 *   - <bundle_reverted>...</bundle_reverted>     audric-side, post-revert chat
 *                                                (same file, alternative branch)
 *
 * NOT stripped (intentionally):
 *   - <financial_context>...</financial_context> lives in the SYSTEM PROMPT,
 *                                                not in user messages — the
 *                                                system prompt isn't persisted
 *                                                as a ledger row.
 *   - <eval_summary>...</eval_summary>           lives in ASSISTANT thinking
 *                                                blocks, not user text — not
 *                                                a render-time concern.
 *
 * When a new directive is added, add the tag to `DIRECTIVE_TAGS` below
 * AND add an inline test fixture in
 * `lib/engine/__tests__/strip-llm-directives.test.ts`.
 */

const DIRECTIVE_TAGS = ['canonical_route', 'post_write_anchor', 'bundle_reverted'] as const;

/**
 * The audric session-bootstrap sentinel. When a persisted user message
 * has THIS as its only text content, the entire message should be
 * dropped at render time (not just the text stripped — otherwise an
 * empty bubble renders).
 *
 * Source: `apps/web/lib/engine/engine-factory.ts`
 *   `messages.push({ role: 'user', content: [{ type: 'text', text: '[session bootstrap]' }] })`
 *
 * The sentinel exists because Anthropic requires the first message to
 * be `user`, but audric prefetches `balance_check` + `savings_info` for
 * the LLM's first-turn context — so the prefetch goes in the slot the
 * user's first prompt would normally occupy.
 */
export const SESSION_BOOTSTRAP_SENTINEL = '[session bootstrap]';

/**
 * Strip LLM meta-directive blocks from a user message text. Returns the
 * cleaned + trimmed string. May return an empty string if the original
 * was nothing but directives — callers should treat empty output as
 * "drop this message" (it had no real user content).
 */
export function stripLlmDirectives(text: string): string {
  let cleaned = text;
  for (const tag of DIRECTIVE_TAGS) {
    const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>\\s*`, 'g');
    cleaned = cleaned.replace(re, '');
  }
  return cleaned.trim();
}
