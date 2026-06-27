/**
 * Video-intent gate — mirrors the S.490 payment-intent fix for the same class of
 * bug. Incident (2026-06-26): on an IMAGE turn ("create a better version of this
 * image"), the model repeatedly mis-fired `generate_video` instead of
 * `generate_image`, hit the Gateway's ~1 video/min quota, and looped. Removing
 * `generate_video` from the active-tool set on non-video turns makes that
 * structurally impossible — the model can't call a tool it doesn't have.
 *
 * Bias CLOSED (toward image): video is expensive + quota-limited, so a false
 * negative (a real video request without the keyword) is recoverable — the user
 * says "make a video …" and the gate opens; a false positive re-opens the
 * incident. Pure + dependency-free (unit-testable, importable from the route).
 */

// Words that signal the user wants a VIDEO (not a still image). Broad enough to
// catch the real asks; absent from image-edit/gen prompts (the incident class).
// `movie`/`film` are included but NOT when followed by "poster" — "make a movie
// poster" is a still-IMAGE request (a real prior-turn case), so it must stay on
// generate_image, while "turn it into a movie" / "make a film" open the gate.
const VIDEO_VERBS =
  /\b(?:video|animate|animated|animation|clip|footage|motion|cinemagraph|gif|moving image|trailer|bring .* to life)\b|\b(?:movie|film)s?\b(?!\s+posters?)/i;

export function hasVideoIntent(opts: { text: string }): boolean {
  return VIDEO_VERBS.test(opts.text);
}
