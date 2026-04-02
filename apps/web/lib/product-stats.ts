import { getRegistry } from '@/lib/protocol-registry';

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://mpp.t2000.ai';

interface UsdcRates {
  saveApy: number;
  borrowApr: number;
}

/**
 * Fetch live USDC save/borrow rates from the protocol registry.
 * Returns best save APY and lowest borrow APR across all registered protocols.
 * Falls back to null on error so pages can show a placeholder.
 */
export async function getUsdcRates(): Promise<UsdcRates | null> {
  try {
    const registry = getRegistry();
    const allRates = await registry.allRatesAcrossAssets();
    const usdcRates = allRates.filter((r) => r.asset === 'USDC');

    let bestSave = 0;
    let bestBorrow = Infinity;

    for (const r of usdcRates) {
      if (r.rates.saveApy > bestSave) bestSave = r.rates.saveApy;
      if (r.rates.borrowApy > 0 && r.rates.borrowApy < bestBorrow) bestBorrow = r.rates.borrowApy;
    }

    if (bestSave === 0) return null;

    return {
      saveApy: bestSave,
      borrowApr: bestBorrow === Infinity ? 0 : bestBorrow,
    };
  } catch {
    return null;
  }
}

interface GatewayStats {
  serviceCount: number;
  endpointCount: number;
}

/**
 * Fetch service/endpoint count from the gateway.
 * Uses Next.js fetch cache with 5-minute revalidation.
 */
export async function getGatewayStats(): Promise<GatewayStats | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/api/services`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;

    const services: { endpoints?: unknown[] }[] = await res.json();
    const endpointCount = services.reduce(
      (sum, s) => sum + (Array.isArray(s.endpoints) ? s.endpoints.length : 0),
      0,
    );

    return { serviceCount: services.length, endpointCount };
  } catch {
    return null;
  }
}

export function formatRate(rate: number): string {
  return `${rate.toFixed(2)}%`;
}
