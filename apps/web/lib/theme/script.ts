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
 *   1. Bail out if the current pathname is a public route — those
 *      never theme (marketing, legal, public pay receipt, auth, etc).
 *      Public-route list is inlined from `public-paths.ts` at build
 *      time so the source of truth is shared with the runtime
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

export function getThemeScript(): string {
  const publicPathsJson = JSON.stringify(PUBLIC_PATHS);
  const publicPrefixesJson = JSON.stringify(PUBLIC_PREFIXES);

  return `(function(){try{var p=${publicPathsJson},x=${publicPrefixesJson},h=window.location.pathname,i=p.indexOf(h)!==-1;if(!i){for(var k=0;k<x.length;k++){if(h.indexOf(x[k])===0){i=true;break;}}}if(i)return;var s=null;try{s=localStorage.getItem('audric-theme');}catch(_){}var t=(s==='light'||s==='dark')?s:'system';var r=t==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;if(r==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(_){}})();`;
}
