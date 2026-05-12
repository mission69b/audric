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

// [UX polish followup #2 / 2026-05-12] Was groupByCategory →
// groupByVendor. Pre-fix the card grouped services by their
// `categories[0]` field, producing badges like "Ai" (lowercase
// category from gateway, capitalized first letter only). With the
// catalog narrowed to OpenAI-only, founder smoke surfaced "Ai · 5
// endpoints" — the user has no idea what vendor that is.
//
// Vendor grouping uses `service.name` ("OpenAI", "ElevenLabs", etc.)
// which is already brand-cased correctly by the gateway. Falls back
// to capitalized category if a service somehow has no name (defensive,
// shouldn't happen in production). With multiple vendors (future),
// each gets its own group with its endpoint count — much more
// scannable than category buckets that mix vendors.
function groupByVendor(services: Service[]): Record<string, Service[]> {
  const groups: Record<string, Service[]> = {};
  for (const svc of services) {
    const label = svc.name && svc.name.trim().length > 0
      ? svc.name
      : ((svc.categories[0] ?? 'Other').charAt(0).toUpperCase() +
         (svc.categories[0] ?? 'Other').slice(1));
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
  // Defensive: ToolResultCard already filters refinement payloads, but if a
  // future tool revision changes the shape we'd rather render an empty card
  // than crash the page-level error boundary.
  const services = Array.isArray(data?.services) ? data.services : [];
  const total = typeof data?.total === 'number' ? data.total : services.length;
  const groups = groupByVendor(services);
  const vendorKeys = Object.keys(groups).sort();

  // [UX polish followup #2 / 2026-05-12] Auto-expand single-vendor
  // catalog. With the OpenAI-only allow-list there's only one group;
  // making the user click to see what OpenAI offers is friction. When
  // 2+ vendors land back in the catalog (via dedicated tools or a
  // future vendor expansion), the default reverts to "all collapsed"
  // so the user can skim the vendor list first.
  const [expanded, setExpanded] = useState<Set<string>>(
    () => (vendorKeys.length === 1 ? new Set(vendorKeys) : new Set()),
  );

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
        <span className="text-[10px] font-mono text-fg-muted">{total} total</span>
      }
    >
      <div className="space-y-1">
        {vendorKeys.map((vendor) => {
          const svcs = groups[vendor];
          const isOpen = expanded.has(vendor);
          const endpointCount = svcs.reduce((n, s) => n + s.endpoints.length, 0);

          return (
            <div key={vendor} className="border border-border-subtle/50 rounded overflow-hidden">
              <button
                onClick={() => toggle(vendor)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-border-subtle/20 transition-colors"
              >
                <span className="text-[11px] font-semibold text-fg-primary">{vendor}</span>
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
                          {/* [UX polish followup #2 / 2026-05-12]
                              Was: vendor name + endpoint label inline.
                              Now: endpoint description as the primary
                              line (e.g. "Generate images with DALL-E"),
                              endpoint path as a secondary mono label
                              underneath. The vendor name is already
                              the group header above, so repeating it
                              per row was redundant. */}
                          <p className="text-[11px] text-fg-primary leading-tight">
                            {ep.description || extractEndpointLabel(ep.url)}
                          </p>
                          <span className="text-[10px] text-fg-muted font-mono">
                            {ep.method} {extractEndpointLabel(ep.url)}
                          </span>
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
