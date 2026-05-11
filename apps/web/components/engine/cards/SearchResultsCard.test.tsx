/**
 * SPEC 23B-polish — SearchResultsCard render tests.
 *
 * Covers:
 *   - title bar + "N found" badge render
 *   - first 3 results render by default; "Show N more" pill renders when >3
 *   - clicking "Show more" reveals the rest
 *   - returns null on empty results / error
 *   - links open in new tab + use noopener/noreferrer
 *   - description renders when present, omitted when blank
 *
 * Convention: per `BalanceCard.test.tsx`, raw DOM API only.
 */

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { SearchResultsCard } from './SearchResultsCard';

const fiveResults = [
  { title: 'Audric Finance', url: 'https://audric.ai/finance', description: 'Manage savings, swap, borrow.' },
  { title: 'Sui Foundation', url: 'https://sui.io/about', description: 'Sui blockchain official site.' },
  { title: 'NAVI Protocol', url: 'https://naviprotocol.io/', description: 'Lending and borrowing on Sui.' },
  { title: 'Cetus DEX', url: 'https://www.cetus.zone/', description: 'AMM aggregator.' },
  { title: 'BlockVision Sui', url: 'https://blockvision.org/sui', description: 'Sui block explorer.' },
];

describe('SearchResultsCard', () => {
  it('renders title bar + "N found" badge', () => {
    render(<SearchResultsCard data={{ results: fiveResults }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Search Results');
    expect(text).toContain('5 found');
  });

  it('renders first 3 results by default', () => {
    render(<SearchResultsCard data={{ results: fiveResults }} />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Audric Finance');
    expect(text).toContain('Sui Foundation');
    expect(text).toContain('NAVI Protocol');
    expect(text).not.toContain('Cetus DEX');
    expect(text).not.toContain('BlockVision Sui');
  });

  it('renders "Show N more" button when results > 3', () => {
    render(<SearchResultsCard data={{ results: fiveResults }} />);
    expect(document.body.textContent).toContain('Show 2 more results');
  });

  it('reveals all results when "Show more" is clicked', () => {
    const { container } = render(<SearchResultsCard data={{ results: fiveResults }} />);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    const text = container.textContent ?? '';
    expect(text).toContain('Cetus DEX');
    expect(text).toContain('BlockVision Sui');
    // The "Show more" button is now hidden.
    expect(container.querySelector('button')).toBeNull();
  });

  it('does NOT render the "Show more" button when results <= 3', () => {
    const { container } = render(
      <SearchResultsCard data={{ results: fiveResults.slice(0, 3) }} />,
    );
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders external links with target="_blank" + rel="noopener noreferrer"', () => {
    const { container } = render(
      <SearchResultsCard data={{ results: fiveResults.slice(0, 1) }} />,
    );
    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('target')).toBe('_blank');
    expect(anchor?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('extracts the bare domain (strips www. prefix)', () => {
    const { container } = render(
      <SearchResultsCard
        data={{
          results: [
            {
              title: 'Cetus',
              url: 'https://www.cetus.zone/some/path?q=1',
              description: 'AMM aggregator.',
            },
          ],
        }}
      />,
    );
    expect(container.textContent).toContain('cetus.zone');
    expect(container.textContent).not.toContain('www.cetus.zone');
  });

  it('returns null on empty results array', () => {
    const { container } = render(<SearchResultsCard data={{ results: [] }} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null on error payload', () => {
    const { container } = render(
      <SearchResultsCard data={{ results: [], error: 'API rate limit' }} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('omits description paragraph when description is blank', () => {
    const { container } = render(
      <SearchResultsCard
        data={{
          results: [{ title: 'Bare', url: 'https://example.com', description: '' }],
        }}
      />,
    );
    expect(container.querySelector('p')).toBeNull();
  });
});
