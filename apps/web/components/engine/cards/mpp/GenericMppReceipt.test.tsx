/**
 * SPEC 23B-MPP1 — GenericMppReceipt tests.
 *
 * Pinned behavior:
 *   - Vendor derived from data.serviceName, falling back to first path
 *     segment of serviceId, falling back to "MPP Service"
 *   - data.amount preferred over data.price (legacy field), formatted as $N.NN
 *   - data.deliveryEstimate rendered as the description line
 *   - Falls back to "Service call: <serviceId>" when no deliveryEstimate
 *   - paymentDigest renders SuiscanLink
 *   - Defensive: never throws on empty data
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { GenericMppReceipt } from './GenericMppReceipt';

describe('GenericMppReceipt', () => {
  it('uses serviceName when present', () => {
    const { container } = render(
      <GenericMppReceipt data={{ serviceName: 'Foo Service', amount: 0.5 }} />,
    );
    expect(container.textContent).toContain('FOO SERVICE');
  });

  it('falls back to capitalised first segment of serviceId', () => {
    const { container } = render(
      <GenericMppReceipt data={{ serviceId: 'walrus/v1/upload', price: '0' }} />,
    );
    expect(container.textContent).toContain('WALRUS');
  });

  it('strips https:// prefix from serviceId before deriving vendor', () => {
    const { container } = render(
      <GenericMppReceipt data={{ serviceId: 'https://mpp.t2000.ai/foo/v1/bar' }} />,
    );
    expect(container.textContent).toContain('FOO');
  });

  it('falls back to "MPP Service" when both serviceName + serviceId absent', () => {
    const { container } = render(<GenericMppReceipt data={{ price: '0.10' }} />);
    expect(container.textContent).toContain('MPP SERVICE');
  });

  it('prefers data.amount (legacy) over data.price', () => {
    const { container } = render(
      <GenericMppReceipt data={{ serviceName: 'X', amount: 1.5, price: '0.99' }} />,
    );
    expect(container.textContent).toContain('$1.50');
    expect(container.textContent).not.toContain('$0.99');
  });

  it('falls back to data.price when amount absent', () => {
    const { container } = render(
      <GenericMppReceipt data={{ serviceName: 'X', price: '0.04' }} />,
    );
    expect(container.textContent).toContain('$0.04');
  });

  it('renders deliveryEstimate as description', () => {
    const { container } = render(
      <GenericMppReceipt
        data={{ serviceName: 'Foo', amount: 1, deliveryEstimate: 'Ships Friday' }}
      />,
    );
    expect(container.textContent).toContain('Ships Friday');
  });

  it('falls back to "Service call: <serviceId>" when no deliveryEstimate', () => {
    const { container } = render(
      <GenericMppReceipt data={{ serviceId: 'newservice/v1/foo', amount: 0.05 }} />,
    );
    expect(container.textContent).toContain('newservice/v1/foo');
  });

  it('renders SuiscanLink when paymentDigest present', () => {
    const { container } = render(
      <GenericMppReceipt
        data={{
          serviceName: 'Foo',
          amount: 1,
          paymentDigest: 'ABCDEF1234567890ABCDEF1234567890ABCD',
        }}
      />,
    );
    expect(container.textContent).toContain('Suiscan');
  });

  it('never throws on completely empty data', () => {
    expect(() => render(<GenericMppReceipt data={{}} />)).not.toThrow();
  });
});
