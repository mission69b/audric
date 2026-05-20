/**
 * [S.205 — 2026-05-20] "New chat" signal between sidebar and chat panel.
 *
 * Problem: the sidebar's "New chat" button used to call `router.push("/chat")`,
 * but the user is ALREADY at `/chat` (the only authenticated chat route in
 * web-v2 — there's no `/chat/[sessionId]` split-route surface in the post-
 * S.197b world). `router.push` to the same URL is a no-op; the chat panel
 * doesn't re-mount, the `useChat()` instance keeps its messages array, and
 * "New chat" appears to do nothing.
 *
 * Solution: bridge sidebar → panel with a window CustomEvent. The sidebar
 * dispatches `audric:new-chat`. The chat panel listens for the event and
 * bumps an internal `chatNonce` state that's woven into its child mount
 * key — bumping the nonce re-mounts `AudricChatPanelInner`, which gives
 * `useChat()` a fresh `messages = []` slate.
 *
 * Why a window event (vs. context, vs. URL state):
 *   - Sidebar + chat client live under separate layouts (sidebar is in
 *     `/chat/layout.tsx`, panel is in `/chat/page.tsx` via `AudricChatClient`).
 *     They share the SidebarProvider context but adding a chat-nonce context
 *     above both would be a layout-level refactor for a single signal.
 *   - URL state (`/chat?n=<ts>`) would pollute the bar with timestamps and
 *     break "share this URL". The signal is ephemeral.
 *   - Window events are exactly the right tool for "fire-and-forget signal
 *     between sibling components in separate trees" — React's official
 *     escape hatch when context would be overkill.
 *
 * Both helpers are SSR-safe: `dispatchNewChat` no-ops on the server; the
 * subscribe helper returns a no-op cleanup if `window` is unavailable. The
 * subscribe helper exists as a typed boundary so callers don't have to
 * touch raw `addEventListener` / event-type casts.
 */

const NEW_CHAT_EVENT = "audric:new-chat";

export function dispatchNewChat(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(NEW_CHAT_EVENT));
}

export function subscribeNewChat(handler: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      // SSR no-op cleanup
    };
  }
  window.addEventListener(NEW_CHAT_EVENT, handler);
  return () => {
    window.removeEventListener(NEW_CHAT_EVENT, handler);
  };
}
