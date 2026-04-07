'use client';

import { ACTIVITY_FILTERS, type ActivityFilter } from '@/lib/activity-types';

interface FilterChipsProps {
  active: ActivityFilter;
  onChange: (filter: ActivityFilter) => void;
}

export function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none py-1" role="radiogroup" aria-label="Filter activity">
      {ACTIVITY_FILTERS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={active === f.id}
          onClick={() => onChange(f.id)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
            active === f.id
              ? 'bg-foreground text-background'
              : 'bg-surface border border-border text-muted hover:text-foreground hover:border-border-bright'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
