/**
 * Defensive host-side strip for `<proactive ...>BODY</proactive>` markers.
 * The engine emits a `proactive_text` SSE event with `body` already stripped,
 * but a marker can still appear briefly in `text_delta` chunks before the
 * closing `</proactive>` arrives. This helper keeps the streamed text clean
 * during that window.
 *
 * Mirror of `stripProactiveMarkers` in `@t2000/engine` (intentionally
 * duplicated). The clean re-export tried in P9.6 broke the Next.js client
 * build — `@t2000/engine`'s value-export entry point pulls in `node:fs` /
 * `node:buffer` from server-side tools, and Webpack walks the import graph
 * into the client bundle. Type-only imports (`import type ...`) tree-shake
 * fine; value imports don't. This file lives in the client-render path
 * (`lib/timeline-builder.ts` → `hooks/useEngine.ts` → `app/new/page.tsx`),
 * so we keep the regex local.
 *
 * The regex MUST stay in sync with `packages/engine/src/proactive-marker.ts`.
 * Idempotent.
 */
export function stripProactiveMarkers(text: string): string {
  if (!text.includes('<proactive')) return text;
  return text.replace(
    /<proactive\s+([^>]+)>([\s\S]*?)<\/proactive>/g,
    (_match, _attrs, body: string) => body,
  );
}
