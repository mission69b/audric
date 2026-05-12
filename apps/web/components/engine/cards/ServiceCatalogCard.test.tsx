/**
 * SPEC 23B-polish — ServiceCatalogCard render tests.
 *
 * Covers:
 *   - title bar + total badge render
 *   - services group correctly BY VENDOR (UX polish followup #2:
 *     was groupByCategory → groupByVendor; with OpenAI-only catalog
 *     this changes "Ai · 5 endpoints" → "OpenAI · 5 endpoints")
 *   - accordions auto-expand for single-vendor catalogs (UX followup
 *     #2: skip the click for the common case); collapsed by default
 *     for multi-vendor catalogs
 *   - endpoint count pluralizes correctly (1 endpoint vs 2 endpoints)
 *   - empty data renders the title bar but no rows (defensive)
 *
 * Convention: per `BalanceCard.test.tsx`, raw DOM API only.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ServiceCatalogCard } from './ServiceCatalogCard';

const baseServices = [
  {
    id: 'dalle',
    name: 'DALL-E',
    description: 'Image generation',
    categories: ['art'],
    endpoints: [
      { url: 'https://mpp.t2000.ai/dalle/generate', method: 'POST', description: 'Generate an image.', price: '$0.04' },
    ],
  },
  {
    id: 'suno',
    name: 'Suno',
    description: 'Music generation',
    categories: ['music'],
    endpoints: [
      { url: 'https://mpp.t2000.ai/suno/generate', method: 'POST', description: 'Generate a track.', price: '$0.20' },
      { url: 'https://mpp.t2000.ai/suno/extend', method: 'POST', description: 'Extend a track.', price: '$0.15' },
    ],
  },
  {
    id: 'lob',
    name: 'Lob',
    description: 'Print + ship',
    categories: ['shipping'],
    endpoints: [
      { url: 'https://mpp.t2000.ai/lob/postcard', method: 'POST', description: 'Send a postcard.', price: '$2.00' },
    ],
  },
];

describe('ServiceCatalogCard', () => {
  it('renders title bar + total badge', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: baseServices.length }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Available Services');
    expect(text).toContain('3 total');
  });

  it('groups services by vendor name (one group per vendor)', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    const text = document.body.textContent ?? '';
    // Each vendor name renders as its own group header. Pre-fix this
    // test asserted on category labels ("Art", "Music", "Shipping")
    // which produced confusing badges for catalogs with one vendor
    // per category. Vendor grouping is more user-meaningful.
    expect(text).toContain('DALL-E');
    expect(text).toContain('Suno');
    expect(text).toContain('Lob');
  });

  it('renders endpoint counts with correct pluralization', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('1 endpoint');
    expect(text).toContain('2 endpoints');
  });

  it('keeps accordions collapsed by default for multi-vendor catalogs', () => {
    // baseServices has 3 vendors → not the single-vendor auto-expand
    // case → all accordions start collapsed.
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    expect(document.body.textContent).not.toContain('dalle/generate');
    expect(document.body.textContent).not.toContain('suno/extend');
  });

  it('auto-expands the only vendor for single-vendor catalogs', () => {
    // [UX polish followup #2 / 2026-05-12] OpenAI-only is the
    // production case today (post-S.46 catalog narrowing). Making
    // the user click to see what OpenAI offers when it's the only
    // option is friction.
    const { container } = render(
      <ServiceCatalogCard data={{ services: [baseServices[0]], total: 1 }} />,
    );
    // Endpoint description renders without a click → accordion is open.
    expect(container.textContent).toContain('Generate an image.');
    expect(container.textContent).toContain('$0.04');
  });

  it('expands an accordion on click and reveals endpoint rows', () => {
    const { container } = render(
      <ServiceCatalogCard data={{ services: baseServices, total: 3 }} />,
    );
    const buttons = container.querySelectorAll('button');
    // Vendor-grouped header shows the vendor NAME ("DALL-E") not the
    // category ("Art").
    const dalleButton = Array.from(buttons).find((b) => b.textContent?.includes('DALL-E'));
    expect(dalleButton).not.toBeNull();
    fireEvent.click(dalleButton!);
    // `extractEndpointLabel` strips the leading `/<service>/` segment, so
    // `https://mpp.t2000.ai/dalle/generate` collapses to just `generate`.
    expect(container.textContent).toContain('generate');
    expect(container.textContent).toContain('$0.04');
    expect(container.textContent).toContain('Generate an image.');
  });

  it('renders the "Paid per request in USDC" footer always', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    expect(document.body.textContent).toContain('Paid per request in USDC');
  });

  it('uses vendor name as the group header even when categories array is empty', () => {
    // [UX polish followup #2 / 2026-05-12] Pre-fix this asserted
    // "Other" because the card grouped by category and the empty
    // categories array fell back to "Other". Now it groups by
    // vendor — the vendor name is the header. The "Other" fallback
    // only fires when the vendor name is also missing/empty.
    render(
      <ServiceCatalogCard
        data={{
          services: [
            {
              id: 'unknown',
              name: 'Unknown',
              description: 'no category',
              categories: [],
              endpoints: [
                { url: 'https://mpp.t2000.ai/x/y', method: 'GET', description: '', price: '$0.01' },
              ],
            },
          ],
          total: 1,
        }}
      />,
    );
    expect(document.body.textContent).toContain('Unknown');
  });

  it('renders defensively when data.services is missing or non-array', () => {
    // @ts-expect-error intentional bad shape
    const { container } = render(<ServiceCatalogCard data={{ services: null, total: 0 }} />);
    expect(container.textContent).toContain('Available Services');
    expect(container.textContent).toContain('0 total');
  });

  it('falls back to total = services.length when total is missing', () => {
    // @ts-expect-error intentional missing field
    render(<ServiceCatalogCard data={{ services: baseServices }} />);
    expect(document.body.textContent).toContain('3 total');
  });
});
