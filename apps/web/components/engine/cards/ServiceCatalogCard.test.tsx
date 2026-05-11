/**
 * SPEC 23B-polish — ServiceCatalogCard render tests.
 *
 * Covers:
 *   - title bar + total badge render
 *   - services group correctly by first category
 *   - accordions are collapsed by default; click to expand
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

  it('groups services by first category (capitalized)', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Art');
    expect(text).toContain('Music');
    expect(text).toContain('Shipping');
  });

  it('renders endpoint counts with correct pluralization', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('1 endpoint');
    expect(text).toContain('2 endpoints');
  });

  it('keeps accordions collapsed by default (endpoint URLs hidden)', () => {
    render(<ServiceCatalogCard data={{ services: baseServices, total: 3 }} />);
    expect(document.body.textContent).not.toContain('dalle/generate');
    expect(document.body.textContent).not.toContain('suno/extend');
  });

  it('expands an accordion on click and reveals endpoint rows', () => {
    const { container } = render(
      <ServiceCatalogCard data={{ services: baseServices, total: 3 }} />,
    );
    const buttons = container.querySelectorAll('button');
    const artButton = Array.from(buttons).find((b) => b.textContent?.includes('Art'));
    expect(artButton).not.toBeNull();
    fireEvent.click(artButton!);
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

  it('falls back to "Other" when categories array is empty', () => {
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
    expect(document.body.textContent).toContain('Other');
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
