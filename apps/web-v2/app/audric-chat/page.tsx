/**
 * Day 2b minimal audric chat surface — `/audric-chat`.
 *
 * Lives OUTSIDE the template's `(chat)` route group so the template's
 * sidebar / chrome / auth-guard chrome can't interfere with the
 * minimum-viable smoke. Phase 6 cutover deletes this page (the
 * template's chat surface gets rewired to `/api/audric-chat`).
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
