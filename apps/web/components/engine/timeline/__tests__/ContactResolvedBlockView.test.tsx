/**
 * SPEC 7 P2.5b Layer 5 — ContactResolvedBlockView render contract.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ContactResolvedBlockView } from '../ContactResolvedBlockView';
import type { ContactResolvedTimelineBlock } from '@/lib/engine-types';

const fullAddress = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

function block(overrides: Partial<ContactResolvedTimelineBlock> = {}): ContactResolvedTimelineBlock {
  return {
    type: 'contact-resolved',
    contactName: 'Mom',
    contactAddress: fullAddress,
    toolUseId: 'tu1',
    ...overrides,
  };
}

describe('ContactResolvedBlockView', () => {
  it('renders the CONTACT label, contact name (quoted), and truncated address', () => {
    const { container } = render(<ContactResolvedBlockView block={block()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('CONTACT');
    expect(text).toContain('Mom');
    expect(text).toContain('0x1234');
    expect(text).toContain('cdef'); // last 4 of full address
  });

  it('exposes a screen-reader label with the full address (truncation is visual-only)', () => {
    const { getByRole } = render(<ContactResolvedBlockView block={block()} />);
    const status = getByRole('status');
    const label = status.getAttribute('aria-label') ?? '';
    expect(label).toContain('Mom');
    expect(label).toContain(fullAddress);
  });

  it('does not truncate addresses that are short enough to display in full', () => {
    const short = '0xabcd';
    const { container } = render(
      <ContactResolvedBlockView block={block({ contactAddress: short })} />,
    );
    expect(container.textContent ?? '').toContain('0xabcd');
  });
});
