/**
 * Audric chat surface — `/chat`.
 *
 * Lives OUTSIDE the template's `(chat)` route group so the template's
 * sidebar / chrome / auth-guard chrome can't interfere. Previously at
 * `/audric-chat` (template-debris naming to dodge the pre-existing
 * `/chat/[id]` template route); S.197b (v0.7c Session 5.5, 2026-05-20)
 * deleted the template route + renamed this page to its natural URL
 * `/chat`. The `(chat)` route group itself + the remaining template
 * chrome delete in Session 9a.
 *
 * **JWT input pattern:** the Day 1c zkLogin stub adapter is server-
 * side decode-only. Phase 3 wires the real `ZkLoginProvider` with
 * Google OAuth + Enoki sponsored gas; until then the user pastes a
 * fresh JWT into the textarea + the page passes it as the
 * `x-zklogin-jwt` header on every `useChat()` fetch. This intentionally
 * matches the same JWT-in-header contract the curl smoke uses.
 */

import { Suspense } from "react";
import { AudricChatClient } from "./audric-chat-client";

// `useChat` internally calls `Math.random()` for message ids; Next 16's
// Cache Components prerender disallows non-deterministic Client
// Component renders unless they're isolated behind a `<Suspense>`
// boundary (route segment `export const dynamic` is also forbidden
// under Cache Components). Wrapping in Suspense tells the prerenderer
// to skip this subtree and stream it at request time, which is what
// we want for an interactive chat surface anyway.
export default function AudricChatPage() {
  return (
    <Suspense fallback={null}>
      <AudricChatClient />
    </Suspense>
  );
}
