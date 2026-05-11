/**
 * SPEC 23B — N1/N2/N6 — ConfirmationChip primitive tests.
 *
 * These cover both the primitive itself (default props, tone variants,
 * glyph suppression, detail formatting) and the consumer branches in
 * ToolResultCard's CARD_RENDERERS map for the 3 wired tools.
 *
 * Why bundle: the consumer branches just feed the primitive — testing
 * them in isolation would mean re-rendering ToolResultCard with
 * synthetic ToolExecution shapes for each tool. Inline here keeps the
 * verification next to what's actually being verified, matching the
 * existing inline-test convention from `coding-discipline.mdc`.
 *
 * Convention: this codebase does NOT extend `@testing-library/jest-dom`
 * matchers in `vitest.setup.ts` (verified 2026-05-11 during SPEC 23B-N
 * landing). Tests use raw DOM API (`textContent`, `getAttribute`,
 * `querySelector`) instead of `toHaveTextContent` / `toBeInTheDocument`.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfirmationChip } from './ConfirmationChip';

describe('ConfirmationChip primitive', () => {
  it('renders label + default ✓ glyph + success tone', () => {
    const { container } = render(<ConfirmationChip label="DONE" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('DONE');
    expect(status.textContent).toContain('DONE');
    expect(status.textContent).toContain('✓');
    expect(container.querySelector('.text-success-solid')).not.toBeNull();
  });

  it('renders detail when provided and reflects in aria-label', () => {
    render(<ConfirmationChip label="CANCELLED" detail="LzLawhY7" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe('CANCELLED: LzLawhY7');
    expect(status.textContent).toContain('LzLawhY7');
  });

  it('omits detail when not provided', () => {
    render(<ConfirmationChip label="DONE" />);
    const status = screen.getByRole('status');
    // Just the glyph + label, no extra mono detail span
    expect(status.textContent?.replace(/\s+/g, '')).toBe('✓DONE');
  });

  it('uses muted glyph color for tone="neutral"', () => {
    const { container } = render(
      <ConfirmationChip label="CANCELLED" tone="neutral" />,
    );
    expect(container.querySelector('.text-fg-muted')).not.toBeNull();
    expect(container.querySelector('.text-success-solid')).toBeNull();
  });

  it('suppresses glyph when glyph={null}', () => {
    const { container } = render(
      <ConfirmationChip label="DONE" glyph={null} />,
    );
    expect(container.textContent).not.toContain('✓');
  });

  it('renders custom glyph when provided', () => {
    const { container } = render(
      <ConfirmationChip label="DONE" glyph="✗" />,
    );
    expect(container.textContent).toContain('✗');
    expect(container.textContent).not.toContain('✓');
  });
});

describe('ConfirmationChip — N1/N2/N6 wiring shapes', () => {
  // Mirror the exact CARD_RENDERERS branch shapes in ToolResultCard.tsx.
  // If those branches diverge from the primitive's contract, these break.

  it('N1 cancel_payment_link shape: { slug } → "PAYMENT LINK CANCELLED" + slug', () => {
    const data = { slug: 'LzLawhY7', status: 'cancelled' };
    render(
      <ConfirmationChip
        label="PAYMENT LINK CANCELLED"
        detail={data.slug}
        tone="neutral"
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('PAYMENT LINK CANCELLED');
    expect(status.textContent).toContain('LzLawhY7');
  });

  it('N2 cancel_invoice shape: { slug } → "INVOICE CANCELLED" + slug', () => {
    const data = { slug: 'xFYKBWy5', status: 'cancelled' };
    render(
      <ConfirmationChip
        label="INVOICE CANCELLED"
        detail={data.slug}
        tone="neutral"
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('INVOICE CANCELLED');
    expect(status.textContent).toContain('xFYKBWy5');
  });

  it('N6 save_contact shape: { name, address } → "CONTACT SAVED" + "name · 0x...…..."', () => {
    const data = {
      saved: true,
      name: 'Alex',
      address: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    };
    const truncated = `${data.address.slice(0, 6)}…${data.address.slice(-4)}`;
    const detail = `${data.name} · ${truncated}`;
    render(
      <ConfirmationChip
        label="CONTACT SAVED"
        detail={detail}
        tone="success"
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('CONTACT SAVED');
    expect(status.textContent).toContain('Alex');
    expect(status.textContent).toContain('0xabcd…6789');
  });

  it('N6 short address (e.g. SuiNS pre-resolve): no truncation', () => {
    const detail = 'Alex · alex.sui';
    render(
      <ConfirmationChip
        label="CONTACT SAVED"
        detail={detail}
        tone="success"
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Alex · alex.sui');
  });
});
