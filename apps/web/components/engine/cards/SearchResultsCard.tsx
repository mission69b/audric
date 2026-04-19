'use client';

import { useState } from 'react';
import { CardShell } from './primitives';

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

interface SearchResultsData {
  results: SearchResult[];
  error?: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function SearchResultsCard({ data }: { data: SearchResultsData }) {
  const [showAll, setShowAll] = useState(false);

  if (data.error || !data.results?.length) return null;

  const visible = showAll ? data.results : data.results.slice(0, 3);
  const remaining = data.results.length - 3;

  return (
    <CardShell
      title="Search Results"
      badge={
        <span className="text-[10px] font-mono text-fg-muted">{data.results.length} found</span>
      }
    >
      <div className="space-y-0 divide-y divide-border-subtle/40">
        {visible.map((r, i) => (
          <div key={i} className="py-2 first:pt-0 last:pb-0">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[12px] font-medium text-fg-primary hover:text-accent-primary transition-colors leading-snug block truncate"
            >
              {r.title}
            </a>
            <span className="text-[10px] font-mono text-accent-primary/70 block truncate mt-0.5">
              {extractDomain(r.url)}
            </span>
            {r.description && (
              <p className="text-[11px] text-fg-secondary leading-[1.5] mt-0.5 line-clamp-2">
                {r.description}
              </p>
            )}
          </div>
        ))}
      </div>

      {remaining > 0 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-[10px] font-mono text-fg-muted hover:text-fg-secondary transition-colors"
        >
          Show {remaining} more result{remaining !== 1 ? 's' : ''} ↓
        </button>
      )}
    </CardShell>
  );
}
