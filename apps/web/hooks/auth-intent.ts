/**
 * [S.123 v0.55.x] Pre-LLM auth intent classifier.
 *
 * The engine has NO logout/login tool. Before this fix, typing "logout"
 * in chat caused the LLM to hallucinate a confident "you're logged out"
 * response without actually clearing the zkLogin session. Users (notably
 * Teo at Mysten Labs) ended up stuck in an expired-session loop because
 * every recovery they tried (logout → login) was hallucinated.
 *
 * `detectAuthIntent` runs against the user's text BEFORE dispatching to
 * the engine. When it matches, the chat layer fires the real
 * `useZkLogin.logout()` / `login()` callback and synthesizes a
 * deterministic assistant ack — the engine never sees the message.
 *
 * Anchored regex (`^...$`) means we only match LONE commands. Natural-
 * language sentences like "actually I want to log out tomorrow" still
 * route to the LLM as normal, which is the intended behavior.
 */
export function detectAuthIntent(text: string): { type: 'logout' | 'login' } | null {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return null;
  if (/^\/?(log\s?out|sign\s?out|exit|quit)$/i.test(normalized)) {
    return { type: 'logout' };
  }
  if (/^\/?(log\s?in|sign\s?in|login)$/i.test(normalized)) {
    return { type: 'login' };
  }
  return null;
}
