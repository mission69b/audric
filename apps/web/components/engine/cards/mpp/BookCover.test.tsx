/**
 * SPEC 23B-MPP1 — BookCover tests.
 *
 * Pinned behavior:
 *   - PDFShift shape ({ url, page_count, format, title }) extracts cleanly
 *   - Generic shape ({ url, pages }) works
 *   - Missing url → renderless (book null) — caller should never reach this
 *     branch since registry routes by serviceId, but defensive
 *   - Page thumbnails: 6 visible, "+N" overflow
 *   - Cover image (cover_url) renders when present, otherwise serif title placeholder
 *   - Format/page count baked into footer copy
 *   - Open PDF link present + safe attrs (rel, target)
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BookCover } from './BookCover';

describe('BookCover', () => {
  it('extracts PDFShift shape ({ url, page_count, format, title })', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift/v1/convert',
          price: '0.05',
          result: {
            url: 'https://cdn/book.pdf',
            page_count: 24,
            format: 'A4',
            title: "Maya's Coloring Book",
          },
        }}
      />,
    );
    expect(container.textContent).toContain("Maya's Coloring Book");
    expect(container.textContent).toContain('24 PAGES');
    expect(container.textContent).toContain('A4');
  });

  it('extracts generic ({ url, pages }) shape', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'https://cdn/x.pdf', pages: 10 },
        }}
      />,
    );
    expect(container.textContent).toContain('10 PAGES');
  });

  it('renders 6 page thumbnails when page_count >= 6', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'x', page_count: 24 },
        }}
      />,
    );
    expect(container.textContent).toContain('P1');
    expect(container.textContent).toContain('P6');
    expect(container.textContent).not.toContain('P7');
  });

  it('renders "+N" overflow when page_count > 6', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'x', page_count: 24 },
        }}
      />,
    );
    expect(container.textContent).toContain('+18');
  });

  it('renders only N thumbnails when page_count < 6', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'x', page_count: 3 },
        }}
      />,
    );
    expect(container.textContent).toContain('P3');
    expect(container.textContent).not.toContain('P4');
    expect(container.textContent).not.toContain('+');
  });

  it('renders cover image when cover_url present', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'x', cover_url: 'https://cdn/cover.png' },
        }}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/cover.png');
  });

  it('renders serif title placeholder when no cover_url', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'x', title: 'My Book' },
        }}
      />,
    );
    expect(container.querySelector('img')).toBeNull();
    // Title appears in the paper card placeholder + in the side title
    expect((container.textContent ?? '').match(/My Book/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('renders Open PDF link with safe rel + target', () => {
    const { container } = render(
      <BookCover
        data={{
          serviceId: 'pdfshift',
          price: '0.05',
          result: { url: 'https://cdn/book.pdf', title: 'Foo' },
        }}
      />,
    );
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://cdn/book.pdf');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('renders no link when url missing (defensive)', () => {
    const { container } = render(
      <BookCover data={{ serviceId: 'pdfshift', price: '0.05', result: { foo: 'bar' } }} />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('renders price in header', () => {
    const { container } = render(
      <BookCover data={{ serviceId: 'pdfshift', price: '0.05', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('$0.05');
  });

  it('renders default title when none provided', () => {
    const { container } = render(
      <BookCover data={{ serviceId: 'pdfshift', price: '0.05', result: { url: 'x' } }} />,
    );
    expect(container.textContent).toContain('Bound PDF');
  });
});
