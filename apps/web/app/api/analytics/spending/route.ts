import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * GET /api/analytics/spending?period=month
 * Header: x-sui-address (also accepts ?address= for backward compatibility)
 *
 * Aggregates AppEvent + ServicePurchase data to show spending by service/category.
 * Period: "week" | "month" | "year" | "all"
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const address = request.headers.get('x-sui-address')
    ?? searchParams.get('address');
  const period = searchParams.get('period') ?? 'month';

  if (!address || !address.startsWith('0x')) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const since = periodToDate(period);

  try {
    const [purchases, payEvents] = await Promise.all([
      prisma.servicePurchase.findMany({
        where: { address, createdAt: { gte: since } },
        select: { serviceId: true, amountUsd: true, productId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appEvent.findMany({
        where: { address, type: 'pay', createdAt: { gte: since } },
        select: { details: true, createdAt: true },
      }),
    ]);

    const serviceMap = new Map<string, { service: string; endpoint: string; category: string; totalSpent: number; requestCount: number }>();

    for (const p of purchases) {
      const key = p.serviceId;
      const existing = serviceMap.get(key) ?? {
        service: extractServiceName(p.serviceId),
        endpoint: p.serviceId,
        category: categorizeService(p.serviceId),
        totalSpent: 0,
        requestCount: 0,
      };
      existing.totalSpent += p.amountUsd;
      existing.requestCount++;
      serviceMap.set(key, existing);
    }

    // ServicePurchase is the authoritative source. Only use AppEvent for
    // services NOT already covered by ServicePurchase to avoid double-counting.
    const purchaseServiceIds = new Set(purchases.map((p) => p.serviceId));

    for (const e of payEvents) {
      const details = (e.details ?? {}) as Record<string, unknown>;
      const service = (details.service as string) ?? 'unknown';
      if (purchaseServiceIds.has(service)) continue;

      const amount = typeof details.amount === 'number' ? details.amount : (typeof details.amountUsdc === 'number' ? details.amountUsdc : 0);
      if (amount <= 0) continue;

      if (!serviceMap.has(service)) {
        serviceMap.set(service, {
          service: extractServiceName(service),
          endpoint: service,
          category: categorizeService(service),
          totalSpent: 0,
          requestCount: 0,
        });
      }
      const existing = serviceMap.get(service)!;
      existing.totalSpent += amount;
      existing.requestCount++;
    }

    const byService = [...serviceMap.values()].sort((a, b) => b.totalSpent - a.totalSpent);
    const totalSpent = byService.reduce((s, e) => s + e.totalSpent, 0);
    const requestCount = byService.reduce((s, e) => s + e.requestCount, 0);
    const serviceCount = byService.length;

    const now = new Date();
    const periodLabel = period === 'month'
      ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      : period === 'week' ? 'This week'
      : period === 'year' ? `${now.getFullYear()}`
      : 'All time';

    return NextResponse.json({
      period: periodLabel,
      totalSpent: Math.round(totalSpent * 100) / 100,
      requestCount,
      serviceCount,
      byService: byService.map((s) => ({
        ...s,
        totalSpent: Math.round(s.totalSpent * 100) / 100,
      })),
    });
  } catch (err) {
    console.error('[spending] Error:', err);
    return NextResponse.json({
      period: period,
      totalSpent: 0,
      requestCount: 0,
      serviceCount: 0,
      byService: [],
    });
  }
}

function periodToDate(period: string): Date {
  const now = new Date();
  switch (period) {
    case 'week': { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
    case 'all': return new Date(2020, 0, 1);
    default: return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function extractServiceName(serviceId: string): string {
  if (serviceId.startsWith('http')) {
    try {
      const url = new URL(serviceId);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      return pathSegments[0] || url.hostname;
    } catch {
      return serviceId;
    }
  }
  const parts = serviceId.split('/');
  return parts[0] || serviceId;
}

function categorizeService(serviceId: string): string {
  let id = serviceId.toLowerCase();
  if (id.startsWith('http')) {
    try { id = new URL(id).pathname.toLowerCase(); } catch { /* use raw */ }
  }
  if (id.includes('fal') || id.includes('flux') || id.includes('image') || id.includes('runway') || id.includes('stability')) return 'AI Images';
  if (id.includes('eleven') || id.includes('suno') || id.includes('audio') || id.includes('music') || id.includes('tts')) return 'Audio';
  if (id.includes('lob') || id.includes('postcard') || id.includes('letter')) return 'Mail';
  if (id.includes('brave') || id.includes('search') || id.includes('firecrawl') || id.includes('serp')) return 'Search';
  if (id.includes('weather') || id.includes('openweather')) return 'Utilities';
  if (id.includes('heygen') || id.includes('video')) return 'Video';
  if (id.includes('openai') || id.includes('anthropic') || id.includes('gemini') || id.includes('groq') || id.includes('deepseek') || id.includes('mistral')) return 'AI Chat';
  if (id.includes('deepl') || id.includes('translate')) return 'Translation';
  return 'Other';
}
