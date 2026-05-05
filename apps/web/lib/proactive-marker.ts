/**
 * Defensive host-side strip for `<proactive ...>BODY</proactive>` markers.
 * The engine emits a `proactive_text` SSE event with `body` already stripped,
 * but a marker can still appear briefly in `text_delta` chunks before the
 * closing `</proactive>` arrives. This helper keeps the streamed text clean
 * during that window.
 *
 * Mirror of `stripProactiveMarkers` in `@t2000/engine` (intentionally
 * duplicated until v1.18.0 ships the export — see SPEC 9 P9.6). The regex
 * MUST stay in sync with `packages/engine/src/proactive-marker.ts` so swapping
 * the import in v1.18.0 is a behaviour-preserving change. Idempotent.
 */
export function stripProactiveMarkers(text: string): string {
  if (!text.includes('<proactive')) return text;
  return text.replace(
    /<proactive\s+([^>]+)>([\s\S]*?)<\/proactive>/g,
    (_match, _attrs, body: string) => body,
  );
}
