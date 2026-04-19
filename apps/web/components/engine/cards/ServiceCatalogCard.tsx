'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CardShell } from './primitives';

interface Endpoint {
  url: string;
  method: string;
  description: string;
  price: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  categories: string[];
  endpoints: Endpoint[];
}

interface ServiceCatalogData {
  services: Service[];
  total: number;
}

function groupByCategory(services: Service[]): Record<string, Service[]> {
  const groups: Record<string, Service[]> = {};
  for (const svc of services) {
    const cat = svc.categories[0] ?? 'Other';
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    if (!groups[label]) groups[label] = [];
    groups[label].push(svc);
  }
  return groups;
}

function extractEndpointLabel(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/[^/]+\//, '');
    return path || url;
  } catch {
    return url;
  }
}

export function ServiceCatalogCard({ data }: { data: ServiceCatalogData }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const groups = groupByCategory(data.services);
  const categoryKeys = Object.keys(groups).sort();

  function toggle(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  return (
    <CardShell
      title="Available Services"
      badge={
        <span className="text-[10px] font-mono text-fg-muted">{data.total} total</span>
      }
    >
      <div className="space-y-1">
        {categoryKeys.map((cat) => {
          const svcs = groups[cat];
          const isOpen = expanded.has(cat);
          const endpointCount = svcs.reduce((n, s) => n + s.endpoints.length, 0);

          return (
            <div key={cat} className="border border-border-subtle/50 rounded overflow-hidden">
              <button
                onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-border-subtle/20 transition-colors"
              >
                <span className="text-[11px] font-semibold text-fg-primary">{cat}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-fg-muted">{endpointCount} endpoint{endpointCount !== 1 ? 's' : ''}</span>
                  <span className="inline-flex text-fg-muted">
                    <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={10} />
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border-subtle/50">
                  {svcs.map((svc) =>
                    svc.endpoints.map((ep, i) => (
                      <div
                        key={`${svc.id}-${i}`}
                        className="flex items-center justify-between px-3 py-1.5 border-b border-border-subtle/30 last:border-0 bg-surface-card/50"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] text-fg-primary font-medium">{svc.name}</span>
                          <span className="text-[10px] text-fg-muted font-mono ml-1.5">
                            {extractEndpointLabel(ep.url)}
                          </span>
                          {ep.description && (
                            <p className="text-[10px] text-fg-secondary mt-0.5 leading-tight truncate">{ep.description}</p>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-accent-primary ml-3 shrink-0">{ep.price}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[10px] text-fg-muted font-mono">
        Ask me to use any service above. Paid per request in USDC.
      </p>
    </CardShell>
  );
}
