'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useZkLogin } from '@/components/auth/useZkLogin';

interface GatewayEndpoint {
  method: string;
  path: string;
  description: string;
  price: string;
}

interface GatewayService {
  id: string;
  name: string;
  description: string;
  categories: string[];
  endpoints: GatewayEndpoint[];
  serviceUrl?: string;
  logo?: string;
  examplePrompt?: string;
}

interface SpendingData {
  totalUsdc: number;
  totalRequests: number;
  byService: Array<{
    serviceId: string;
    totalUsdc: number;
    count: number;
  }>;
}

const CATEGORY_ICONS: Record<string, string> = {
  image: '\uD83C\uDFA8',
  search: '\uD83D\uDD0D',
  translation: '\uD83C\uDF10',
  tts: '\uD83D\uDD0A',
  code: '\uD83D\uDCBB',
  email: '\u2709\uFE0F',
  ai: '\uD83E\uDDE0',
  storage: '\uD83D\uDCC1',
  analytics: '\uD83D\uDCC8',
};

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';

function DiscoverContent() {
  const { address } = useZkLogin();
  const router = useRouter();
  const [services, setServices] = useState<GatewayService[]>([]);
  const [spending, setSpending] = useState<SpendingData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [servicesRes, spendingRes] = await Promise.all([
        fetch(`${GATEWAY_URL}/api/services`, { signal: AbortSignal.timeout(10_000) }).catch(() => null),
        address
          ? fetch(`/api/analytics/spending?address=${address}&period=day`).catch(() => null)
          : null,
      ]);

      if (servicesRes?.ok) {
        const data = await servicesRes.json();
        setServices(Array.isArray(data) ? data : data.services ?? []);
      }

      if (spendingRes?.ok) {
        const data = await spendingRes.json();
        if (data && typeof data.totalUsdc === 'number') {
          setSpending(data);
        }
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [address]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categories = [...new Set(services.flatMap((s) => s.categories ?? []))].filter(Boolean);

  function handleServiceClick(service: GatewayService) {
    const firstEndpoint = service.endpoints?.[0];
    const prompt = service.examplePrompt ?? (firstEndpoint ? `Use ${service.name} to ${firstEndpoint.description.toLowerCase()}` : `Use ${service.name}`);
    router.push(`/new?prefill=${encodeURIComponent(prompt)}`);
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Discover</h1>
          <p className="text-sm text-muted mt-1">Explore Audric&apos;s capabilities powered by MPP services</p>
        </div>

        {/* Spend tracker */}
        {spending && (
          <div className="rounded-xl border border-border bg-surface/50 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted uppercase tracking-wider">Today&apos;s API usage</p>
                <p className="text-lg font-semibold text-foreground mt-0.5">
                  ${spending.totalUsdc.toFixed(4)}
                  <span className="text-sm font-normal text-muted ml-2">across {spending.totalRequests} calls</span>
                </p>
              </div>
              <button
                onClick={() => router.push('/settings?section=safety')}
                className="text-xs text-accent hover:text-accent/80 transition"
              >
                Set daily budget →
              </button>
            </div>
          </div>
        )}

        {/* Categories grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface/50 p-5 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-border mb-3" />
                <div className="h-4 w-32 bg-border rounded mb-2" />
                <div className="h-3 w-full bg-border rounded" />
              </div>
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/50 p-8 text-center">
            <p className="text-sm text-muted">No services available right now.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((category) => {
              const categoryServices = services.filter((s) => s.categories?.includes(category));
              const icon = CATEGORY_ICONS[category.toLowerCase()] ?? '\u2699\uFE0F';

              return (
                <div key={category}>
                  <h2 className="text-sm font-medium text-muted uppercase tracking-wider mb-3">
                    {icon} {category}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {categoryServices.map((service) => {
                      const serviceSpend = spending?.byService.find((s) => s.serviceId === service.id);

                      return (
                        <button
                          key={service.id}
                          onClick={() => handleServiceClick(service)}
                          className="rounded-xl border border-border bg-surface/50 p-4 text-left hover:border-accent/50 hover:bg-surface transition group"
                        >
                          <p className="text-sm font-medium text-foreground group-hover:text-accent transition">
                            {service.name}
                          </p>
                          <p className="text-xs text-muted mt-1 line-clamp-2">{service.description}</p>
                          {service.endpoints?.length > 1 && (
                            <p className="text-[10px] text-dim mt-1.5">{service.endpoints.length} endpoints</p>
                          )}
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                            <span className="text-xs font-mono text-dim">
                              from ${Math.min(...(service.endpoints ?? []).map((e) => parseFloat(e.price) || 0)).toFixed(4)}/req
                            </span>
                            {serviceSpend && (
                              <span className="text-xs text-muted">
                                {serviceSpend.count} used today
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <AuthGuard>
      <DiscoverContent />
    </AuthGuard>
  );
}
