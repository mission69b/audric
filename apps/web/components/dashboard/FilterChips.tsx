'use client';

// [PHASE 6] FilterChips — re-skinned to match `activity.jsx`'s centered,
// wrapped pill row. Switched from a custom .rounded-full button to the shared
// <Pill> primitive (mono, uppercase, low-contrast inactive state, info-bg
// active state). Behavior is unchanged: a single-select radiogroup that calls
// `onChange(filter.id)` on click, and `active` is derived from props.

import { Pill } from '@/components/ui/Pill';
import { ACTIVITY_FILTERS, type ActivityFilter } from '@/lib/activity-types';

interface FilterChipsProps {
  active: ActivityFilter;
  onChange: (filter: ActivityFilter) => void;
}

export function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <div
      className="flex gap-1.5 flex-wrap justify-center"
      role="radiogroup"
      aria-label="Filter activity"
    >
      {ACTIVITY_FILTERS.map((f) => (
        <Pill
          key={f.id}
          role="radio"
          aria-checked={active === f.id}
          active={active === f.id}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </Pill>
      ))}
    </div>
  );
}
