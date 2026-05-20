/**
 * Choose the assistant `messageId` the route emits in its `start` chunk.
 *
 * Mirrors AI SDK v6's `getResponseUIMessageId` (`ai@6.0.185` L5133-5142):
 * when the incoming history's tail is an assistant message, REUSE its id;
 * otherwise generate a fresh one via the supplied factory.
 *
 * This is load-bearing for resume turns. Without id reuse, the resume-turn
 * server starts a new assistant message via `{ type: "start", messageId }`,
 * but the client's `processUIMessageStream` (`ai@6.0.185` L5359-L5371 +
 * L13334-L13375) has already SEEDED `state.message` as a CLONE of the
 * tail assistant — including its `output-available` tool parts. The
 * `start` chunk then only flips `state.message.id` to the new id; the
 * cloned tool parts stay. New text chunks append to those parts, so by
 * stream end `state.message = { id: NEW_ID, parts: [save_deposit, text] }`.
 *
 * At `write()` time, the client checks `replaceLastMessage = state.message.id
 * === this.lastMessage.id`. With a NEW id, the check is FALSE → the
 * client calls `pushMessage` instead of `replaceMessage` → a brand-new
 * assistant message is appended, carrying the cloned `save_deposit` plus
 * the new text. The chat now has TWO transaction receipt cards for ONE
 * execution. The bug is visible only after the user approves a write,
 * because that's when `addToolOutput` flips a tool part to
 * `output-available` and `sendAutomaticallyWhen` auto-fires the resume
 * turn.
 *
 * By REUSING the tail assistant's id, the route's `start` chunk leaves
 * `state.message.id` unchanged → `replaceLastMessage` is true → the new
 * text splices into the existing assistant message in-place. One receipt
 * card, one narration.
 *
 * @param messages   The incoming `body.messages` from the chat request.
 *                   Each entry has an optional `id` (UI messages from
 *                   `useChat`) and a `role`.
 * @param generateId Factory for a fresh UUID/nanoid when no resume id
 *                   applies.
 * @returns The id the route should emit in its `start` chunk.
 */
export function selectResponseMessageId(
  messages: ReadonlyArray<{ id?: string; role: string }>,
  generateId: () => string
): string {
  const tail = messages.at(-1);
  if (
    tail?.role === "assistant" &&
    typeof tail.id === "string" &&
    tail.id.length > 0
  ) {
    return tail.id;
  }
  return generateId();
}
