// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-W2 — PaymentLinkCard polish coverage
//
// Pins the four W2 deliverables for this card:
//   1. Single branch RENDERS a QrCode component pointing at link.url.
//   2. List branch does NOT render a QrCode (one-per-row would dwarf the row).
//   3. List rows use the tightened density classes (py-1.5 / space-y-1.5).
//   4. List labels no longer double-render the slug — when label is null,
//      the row title is the literal "Payment Link" string and the slug
//      appears once below as the canonical short-id.
//
// QrCode is mocked (the same pattern the identity tests use) so this file
// doesn't depend on the `qrcode` package's async data-URL generation.
// ───────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PaymentLinkCard } from './PaymentLinkCard';

vi.mock('@/components/dashboard/QrCode', () => ({
  QrCode: ({ value, size }: { value: string; size: number }) => (
    <div data-testid="qr-mock" data-value={value} data-size={String(size)} />
  ),
}));

describe('PaymentLinkCard (single branch)', () => {
  const single = {
    slug: 'pl_abcdef123',
    url: 'https://audric.ai/p/pl_abcdef123',
    amount: 25,
    currency: 'USDC',
    label: 'Lunch',
    memo: null,
    expiresAt: null,
  };

  it('renders the QrCode pointing at link.url with the W2 size (96px)', () => {
    const { getByTestId } = render(<PaymentLinkCard data={single} />);
    const qr = getByTestId('qr-mock');
    expect(qr.getAttribute('data-value')).toBe('https://audric.ai/p/pl_abcdef123');
    expect(qr.getAttribute('data-size')).toBe('96');
  });

  it('renders the "Scan to pay" caption alongside the QR', () => {
    const { container } = render(<PaymentLinkCard data={single} />);
    expect(container.textContent).toContain('Scan to pay');
  });

  it('renders the URL block + Copy button before the QR', () => {
    const { container } = render(<PaymentLinkCard data={single} />);
    const text = container.textContent ?? '';
    const urlIdx = text.indexOf('https://audric.ai/p/pl_abcdef123');
    const copyIdx = text.indexOf('Copy link');
    const scanIdx = text.indexOf('Scan to pay');
    // Sanity: all three substrings are present
    expect(urlIdx).toBeGreaterThanOrEqual(0);
    expect(copyIdx).toBeGreaterThan(urlIdx);
    expect(scanIdx).toBeGreaterThan(copyIdx);
  });
});

describe('PaymentLinkCard (list branch)', () => {
  const list = {
    links: [
      {
        slug: 'pl_a',
        url: 'https://audric.ai/p/pl_a',
        amount: 10,
        currency: 'USDC',
        label: 'Coffee',
        status: 'active',
        paidAt: null,
        createdAt: '2026-05-10T12:00:00Z',
      },
      {
        slug: 'pl_b',
        url: 'https://audric.ai/p/pl_b',
        amount: null,
        currency: 'USDC',
        label: null,
        status: 'paid',
        paidAt: '2026-05-10T13:00:00Z',
        createdAt: '2026-05-09T12:00:00Z',
      },
    ],
  };

  it('renders NO QrCode (one-per-row would dominate the list)', () => {
    const { queryAllByTestId } = render(<PaymentLinkCard data={list} />);
    expect(queryAllByTestId('qr-mock')).toHaveLength(0);
  });

  it('uses tightened W2 density classes (py-1.5 row + space-y-1.5 stack)', () => {
    const { container } = render(<PaymentLinkCard data={list} />);
    // Stack container
    const stack = container.querySelector('.space-y-1\\.5');
    expect(stack).not.toBeNull();
    // Row containers
    const rows = container.querySelectorAll('.py-1\\.5');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('renders "Payment Link" (not "Link <slug>") when label is null — no slug double-render', () => {
    const { container } = render(<PaymentLinkCard data={list} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Coffee');
    expect(text).toContain('Payment Link');
    // Defensive: the labelless row's slug shows EXACTLY once (in the
    // dedicated slug row below). Pre-W2 it would have shown twice — once
    // as part of the label "Link pl_b" and once as the slug row.
    const slugMatches = text.match(/pl_b/g) ?? [];
    expect(slugMatches.length).toBe(1);
  });

  it('renders each row\'s status pill', () => {
    const { container } = render(<PaymentLinkCard data={list} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Active');
    expect(text).toContain('Paid');
  });

  it('handles the empty list (no QR, no row, just empty-state copy)', () => {
    const { container, queryAllByTestId } = render(<PaymentLinkCard data={{ links: [] }} />);
    expect(container.textContent).toContain('No payment links yet');
    expect(queryAllByTestId('qr-mock')).toHaveLength(0);
  });
});
