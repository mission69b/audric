// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-W2 — InvoiceCard polish coverage
//
// Mirror of PaymentLinkCard.test.tsx — same four invariants pinned for
// the invoice surface:
//   1. Single branch RENDERS QrCode pointing at inv.url.
//   2. List branch does NOT render QrCode.
//   3. List rows use tightened density classes (py-1.5 / space-y-1.5).
//   4. Empty list still renders cleanly.
//
// (No "label fallback" test — Invoice.label is required at the type
// level; PaymentLink.label is the only one that can be null and was the
// only one with the slug-double-render bug.)
// ───────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { InvoiceCard } from './InvoiceCard';

vi.mock('@/components/dashboard/QrCode', () => ({
  QrCode: ({ value, size }: { value: string; size: number }) => (
    <div data-testid="qr-mock" data-value={value} data-size={String(size)} />
  ),
}));

describe('InvoiceCard (single branch)', () => {
  const single = {
    slug: 'inv_xyz789',
    url: 'https://audric.ai/i/inv_xyz789',
    amount: 100,
    currency: 'USDC',
    label: 'May consulting',
    memo: null,
    dueDate: null,
  };

  it('renders the QrCode pointing at inv.url with the W2 size (96px)', () => {
    const { getByTestId } = render(<InvoiceCard data={single} />);
    const qr = getByTestId('qr-mock');
    expect(qr.getAttribute('data-value')).toBe('https://audric.ai/i/inv_xyz789');
    expect(qr.getAttribute('data-size')).toBe('96');
  });

  it('renders the "Scan to pay" caption alongside the QR', () => {
    const { container } = render(<InvoiceCard data={single} />);
    expect(container.textContent).toContain('Scan to pay');
  });

  it('renders the URL block + Copy button before the QR', () => {
    const { container } = render(<InvoiceCard data={single} />);
    const text = container.textContent ?? '';
    const urlIdx = text.indexOf('https://audric.ai/i/inv_xyz789');
    const copyIdx = text.indexOf('Copy link');
    const scanIdx = text.indexOf('Scan to pay');
    expect(urlIdx).toBeGreaterThanOrEqual(0);
    expect(copyIdx).toBeGreaterThan(urlIdx);
    expect(scanIdx).toBeGreaterThan(copyIdx);
  });
});

describe('InvoiceCard (list branch)', () => {
  const list = {
    invoices: [
      {
        slug: 'inv_a',
        url: 'https://audric.ai/i/inv_a',
        amount: 50,
        currency: 'USDC',
        label: 'Apr consulting',
        status: 'paid',
        dueDate: '2026-04-30',
        paidAt: '2026-05-01T12:00:00Z',
        createdAt: '2026-04-15T12:00:00Z',
      },
      {
        slug: 'inv_b',
        url: 'https://audric.ai/i/inv_b',
        amount: 75,
        currency: 'USDC',
        label: 'May consulting',
        status: 'pending',
        dueDate: '2026-05-31',
        paidAt: null,
        createdAt: '2026-05-01T12:00:00Z',
      },
    ],
  };

  it('renders NO QrCode (one-per-row would dominate the list)', () => {
    const { queryAllByTestId } = render(<InvoiceCard data={list} />);
    expect(queryAllByTestId('qr-mock')).toHaveLength(0);
  });

  it('uses tightened W2 density classes (py-1.5 row + space-y-1.5 stack)', () => {
    const { container } = render(<InvoiceCard data={list} />);
    const stack = container.querySelector('.space-y-1\\.5');
    expect(stack).not.toBeNull();
    const rows = container.querySelectorAll('.py-1\\.5');
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it('renders each row\'s status pill', () => {
    const { container } = render(<InvoiceCard data={list} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Paid');
    expect(text).toContain('Pending');
  });

  it('handles the empty list (no QR, no row, just empty-state copy)', () => {
    const { container, queryAllByTestId } = render(<InvoiceCard data={{ invoices: [] }} />);
    expect(container.textContent).toContain('No invoices yet');
    expect(queryAllByTestId('qr-mock')).toHaveLength(0);
  });
});
