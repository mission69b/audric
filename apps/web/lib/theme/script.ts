/**
 * Anti-flash inline script for `<head>`.
 *
 * Runs synchronously after the initial HTML is parsed but BEFORE
 * React hydrates and BEFORE first paint, so the correct
 * `data-theme="dark"` attribute is on `<html>` when the browser
 * computes styles for the first frame.
 *
 * Invocation contract:
 *   <script dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
 *
 * Behaviour:
 *   1. Bail out if the current pathname is a light-locked route —
 *      those never theme (marketing homepage, legal, product info
 *      pages). Note that `/verify` and `/pay/[slug]` were removed
 *      from this list post-launch — they now follow the user's
 *      stored theme or OS `prefers-color-scheme` (see
 *      `public-paths.ts` module header for rationale). The public-
 *      route list is inlined from `public-paths.ts` at build time
 *      so the source of truth is shared with the runtime
 *      ThemeProvider.
 *   2. Otherwise read `localStorage['audric-theme']`. Valid values:
 *      `'light'`, `'dark'`, `'system'`. Anything else → default to
 *      `'system'`.
 *   3. Resolve `'system'` via `prefers-color-scheme: dark` media
 *      query. The result is `'light'` or `'dark'`.
 *   4. If resolved is `'dark'`, set `data-theme="dark"` on `<html>`.
 *      Otherwise leave the attribute absent (light is the default).
 *
 * Failure modes are silent — if `localStorage`, `matchMedia`, or
 * any other API throws (private browsing, very old browsers, etc.)
 * we fall through to light. Light is always the safe default.
 */

import { PUBLIC_PATHS, PUBLIC_PREFIXES } from './public-paths';

/**
 * Escape a JSON string for safe embedding inside an inline `<script>` tag.
 *
 * `JSON.stringify` is NOT script-safe by itself: a value containing `</script>`
 * would break out of the surrounding `<script>` context, and U+2028 / U+2029
 * are valid in JSON strings but are JavaScript line terminators (legacy ES5
 * behaviour) so they break inline scripts in old browsers.
 *
 * Today both `PUBLIC_PATHS` and `PUBLIC_PREFIXES` are hard-coded constants
 * with no script-breaking characters, but the rule is "any value embedded
 * in a script tag must be escape-sanitised regardless of source." This
 * closes the `js/bad-code-sanitization` CodeQL alert structurally — the
 * escape is applied to every embedded value, so a future contributor
 * adding `</script>` to one of the path lists wouldn't cause the inline
 * script to break out.
 */
function escapeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function getThemeScript(): string {
  const publicPathsJson = escapeForScript(PUBLIC_PATHS);
  const publicPrefixesJson = escapeForScript(PUBLIC_PREFIXES);

  return `(function(){try{var p=${publicPathsJson},x=${publicPrefixesJson},h=window.location.pathname,i=p.indexOf(h)!==-1;if(!i){for(var k=0;k<x.length;k++){if(h.indexOf(x[k])===0){i=true;break;}}}if(i)return;var s=null;try{s=localStorage.getItem('audric-theme');}catch(_){}var t=(s==='light'||s==='dark')?s:'system';var r=t==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;if(r==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(_){}})();`;
}
