/**
 * SPEC 23B-MPP1 — VendorReceipt tests.
 *
 * Pinned behavior:
 *   - vendor prop dictates the displayed label (uppercased)
 *   - Falls back to data.serviceName, then "MPP" when both absent
 *   - description extracted from result.description / item / summary / name
 *   - Lob's expected_delivery_date → "Print + mail" + "ETA · YYYY-MM-DD"
 *   - Falls back to data.deliveryEstimate when result has no description
 *   - paymentDigest renders SuiscanLink
 *   - Defensive: never throws on empty data
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VendorReceipt } from './VendorReceipt';

describe('VendorReceipt', () => {
  it('renders vendor label uppercased', () => {
    const { container } = render(
      <VendorReceipt data={{ price: '45.00' }} vendor="Teleflora" />,
    );
    expect(container.textContent).toContain('TELEFLORA');
  });

  it('falls back to data.serviceName when vendor prop absent', () => {
    const { container } = render(
      <VendorReceipt data={{ serviceName: 'CakeBoss', price: '55.00' }} />,
    );
    expect(container.textContent).toContain('CAKEBOSS');
  });

  it('falls back to "MPP" when both vendor and serviceName missing', () => {
    const { container } = render(<VendorReceipt data={{ price: '0.10' }} />);
    expect(container.textContent).toContain('MPP');
  });

  it('extracts description from result.description', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '55.00', result: { description: 'Custom 10-inch birthday cake' } }}
        vendor="CakeBoss"
      />,
    );
    expect(container.textContent).toContain('Custom 10-inch birthday cake');
  });

  it('extracts description from result.item', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '24.00', result: { item: 'Fairy lights 10m' } }}
        vendor="Amazon"
      />,
    );
    expect(container.textContent).toContain('Fairy lights 10m');
  });

  it('extracts description from result.summary', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '11.00', result: { summary: 'Pepsi × 6, water × 6' } }}
        vendor="Walmart"
      />,
    );
    expect(container.textContent).toContain('Pepsi × 6');
  });

  it('extracts description from result.name', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '20.00', result: { name: 'Balloons + streamers' } }}
        vendor="Party City"
      />,
    );
    expect(container.textContent).toContain('Balloons + streamers');
  });

  it('special-cases Lob expected_delivery_date', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '1.00', result: { expected_delivery_date: '2026-04-24' } }}
        vendor="Lob"
      />,
    );
    expect(container.textContent).toContain('Print + mail');
    expect(container.textContent).toContain('2026-04-24');
  });

  it('shows result.status as ETA / status line', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '20.00', result: { description: 'Balloons', status: 'SHIPS SAT · USPS' } }}
        vendor="Party City"
      />,
    );
    expect(container.textContent).toContain('✓');
    expect(container.textContent).toContain('SHIPS SAT');
  });

  it('falls back to deliveryEstimate when result has no description', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '0.05', deliveryEstimate: 'instant' }}
        vendor="OpenWeather"
      />,
    );
    expect(container.textContent).toContain('instant');
  });

  it('renders price', () => {
    const { container } = render(
      <VendorReceipt data={{ price: '55.00' }} vendor="CakeBoss" />,
    );
    expect(container.textContent).toContain('$55.00');
  });

  it('renders SuiscanLink when paymentDigest present', () => {
    const { container } = render(
      <VendorReceipt
        data={{ price: '1.00', paymentDigest: 'ABCDEF1234567890ABCDEF1234567890ABCD' }}
        vendor="Lob"
      />,
    );
    expect(container.textContent).toContain('Suiscan');
  });

  it('does not render SuiscanLink when paymentDigest absent', () => {
    const { container } = render(<VendorReceipt data={{ price: '1.00' }} vendor="Lob" />);
    expect(container.textContent).not.toContain('Suiscan');
  });

  it('never throws on completely empty data', () => {
    expect(() => render(<VendorReceipt data={{}} />)).not.toThrow();
  });
});
