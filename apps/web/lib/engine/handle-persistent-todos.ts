// ---------------------------------------------------------------------------
// SPEC 9 v0.1.3 P9.3 — persist update_todo items into the long-lived Goal table
//
// The LLM calls `update_todo` with one or more items. When an item carries
// `persist: true`, this helper writes a `Goal` row so the item survives
// across sessions (the engine's `<open_goals>` block reads the same table
// next turn / next session).
//
// Pattern mirrors `handleAdviceResults` in `app/api/engine/chat/route.ts`:
// - Runs as a fire-and-forget side effect at end-of-turn.
// - Scans the FULL messages array (the engine guarantees the LATEST
//   `update_todo` call wins because the tool replaces the list, but we
//   only read tool_use blocks so re-scanning is cheap).
// - Dedupes on `(userId, content)` because the LLM may re-emit the same
//   goal across turns (e.g. it called update_todo last turn and is
//   re-narrating progress this turn). Re-emit MUST NOT create duplicates.
// - User-initiated state changes (dismiss / complete) take precedence: if a
//   matching Goal already exists with `status === 'dismissed'` or
//   `'completed'`, we DO NOT recreate. The user can re-add from the UI if
//   they want it back.
//
// Failure mode:
// - DB errors are caught at the call site (`.catch()` wrapper) — the user
//   never sees a UI failure for a missed goal write.
// ---------------------------------------------------------------------------

import { prisma, withPrismaRetry } from '@/lib/prisma';
import type { TodoItem as EngineTodoItem } from '@t2000/engine';

interface MessageLike {
  role: string;
  content?: unknown;
}

// [SPEC 9 v0.1.3 P9.3] Local extension of `@t2000/engine`'s `TodoItem` until
// v1.18.0 ships with the `persist?: boolean` field on the canonical type.
// Drop this alias and inline `EngineTodoItem` once audric pins
// @t2000/engine@^1.18.0 (see SPEC 9 P9.6).
type TodoItem = EngineTodoItem & { persist?: boolean };

export async function handlePersistentTodos(
  address: string,
  sessionId: string,
  messages: MessageLike[],
): Promise<void> {
  const persistableItems = collectLatestPersistableItems(messages);
  if (persistableItems.length === 0) return;

  const user = await withPrismaRetry(
    () =>
      prisma.user.findUnique({
        where: { suiAddress: address },
        select: { id: true },
      }),
    { label: 'handlePersistentTodos:userFind' },
  );
  if (!user) return;

  for (const item of persistableItems) {
    const content = item.label.trim();
    if (content.length === 0) continue;

    // Dedupe on (userId, content). If a Goal already exists in any status
    // (in_progress / dismissed / completed), skip the create — re-emission
    // by the LLM is a no-op, and we MUST NOT resurrect a Goal the user
    // explicitly dismissed.
    const existing = await withPrismaRetry(
      () =>
        prisma.goal.findFirst({
          where: { userId: user.id, content },
          select: { id: true },
        }),
      { label: 'handlePersistentTodos:findExisting' },
    );
    if (existing) continue;

    await withPrismaRetry(
      () =>
        prisma.goal.create({
          data: {
            userId: user.id,
            content,
            status: 'in_progress',
            sourceSessionId: sessionId,
          },
        }),
      { label: 'handlePersistentTodos:create' },
    );
  }
}

/**
 * Walk the messages array and return the items from the LAST `update_todo`
 * tool_use block in the turn that have `persist === true`. Earlier calls
 * are intentionally ignored — the tool replaces the list each call, so the
 * latest call is the LLM's final intent for the turn.
 */
function collectLatestPersistableItems(messages: MessageLike[]): TodoItem[] {
  let latestItems: TodoItem[] | null = null;

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      const b = block as Record<string, unknown>;
      if (b.type !== 'tool_use' || b.name !== 'update_todo') continue;
      const input = b.input as { items?: TodoItem[] } | undefined;
      if (Array.isArray(input?.items)) {
        latestItems = input.items;
      }
    }
  }

  if (!latestItems) return [];
  return latestItems.filter((item) => item.persist === true);
}
