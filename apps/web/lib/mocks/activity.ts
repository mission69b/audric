// [PHASE 6] Activity panel — suggestion-row mock stubs.
//
// The new design (`design_handoff_audric/.../activity.jsx`) shows
// "Suggestion confirmed" / "Suggestion snoozed 24h" rows in the day-grouped
// feed (kind: 'sug', no amount, optional digest, mono EXPLAIN ›/SUISCAN ↗
// inline links). There is no current backend source for these — the autonomy
// stack was retired (`SIMPLIFICATION DAY 12.5` note in `lib/activity-types.ts`)
// and no chip / API emits `suggestion_confirmed` / `suggestion_snoozed` events
// today.
//
// Per Hard Rule 10 of IMPLEMENTATION_PLAN.md ("If the design shows a UI
// element that has no current data source, it gets a typed mock stub with
// `// TODO: wire to real source`"), these rows ship as a typed mock stub.
// `getMockSuggestionItems()` returns timestamps relative to "now" so the
// feed grouper places them under the correct date label. The injection
// happens in `<ActivityFeed>` (filter === 'all'), behind no flag — they are
// part of the shipped visual until the real source lands.
//
// TODO: wire to real source. When the backend re-introduces autonomous
// suggestions (or a new "suggestion" event source), populate these rows
// from `useActivityFeed` and delete this stub.

import type { ActivityItem } from '@/lib/activity-types';

const HOURS = 60 * 60 * 1000;

export function getMockSuggestionItems(): ActivityItem[] {
  const now = Date.now();
  return [
    {
      id: 'mock-sug-confirmed',
      source: 'app',
      type: 'suggestion_confirmed',
      title: 'Suggestion confirmed',
      timestamp: now - 24 * HOURS,
      digest: 'EPeW1LQGXkxBSampleDigestForVisualPreview',
    },
    {
      id: 'mock-sug-snoozed',
      source: 'app',
      type: 'suggestion_snoozed',
      title: 'Suggestion snoozed 24h',
      timestamp: now - 26 * HOURS,
    },
  ];
}
