/**
 * Defensive host-side strip for `<proactive ...>BODY</proactive>` markers.
 *
 * Re-export of `stripProactiveMarkers` from @t2000/engine v1.19.0 (P9.6
 * release). Audric used to ship a local copy until the engine promoted
 * the export — that local copy is gone now and this file exists only as
 * an alias so existing imports (`from '@/lib/proactive-marker'`) keep
 * resolving without a project-wide rename.
 */
export { stripProactiveMarkers } from '@t2000/engine';
