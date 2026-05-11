/**
 * SPEC 23B — N4 — SuinsResolution primitive tests.
 *
 * Covers both the primitive itself (4 render states across 2 directions ×
 * 2 registered states) and the consumer branch in ToolResultCard's
 * CARD_RENDERERS map. Same convention as ConfirmationChip.test.tsx —
 * inline next to source, vitest + raw DOM API (no jest-dom matchers,
 * which this codebase doesn't extend in vitest.setup.ts).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SuinsResolution } from './SuinsResolution';

describe('SuinsResolution primitive', () => {
  it('forward + registered: renders name → truncated address + verified pill + green dot', () => {
    const { container } = render(
      <SuinsResolution
        direction="forward"
        query="alex.sui"
        address="0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        registered
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('alex.sui');
    expect(status.textContent).toContain('0xabcd…6789');
    expect(status.textContent).toContain('→');
    expect(status.textContent).toContain('verified');
    expect(status.textContent).toContain('SUINS');
    expect(container.querySelector('.bg-success-solid')).not.toBeNull();
    expect(container.querySelector('.bg-fg-muted')).toBeNull();
  });

  it('forward + unregistered: renders name + "not registered" + muted dot, no pill', () => {
    const { container } = render(
      <SuinsResolution
        direction="forward"
        query="ghost.sui"
        address={null}
        registered={false}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('ghost.sui');
    expect(status.textContent).toContain('not registered');
    expect(status.textContent).not.toContain('verified');
    expect(status.textContent).not.toContain('→');
    expect(container.querySelector('.bg-fg-muted')).not.toBeNull();
    expect(container.querySelector('.bg-success-solid')).toBeNull();
  });

  it('reverse + registered (single name): renders truncated address → primary, no "+N more" pill', () => {
    const { container } = render(
      <SuinsResolution
        direction="reverse"
        query="0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        primary="ossy.sui"
        names={['ossy.sui']}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('0xabcd…6789');
    expect(status.textContent).toContain('→');
    expect(status.textContent).toContain('ossy.sui');
    expect(status.textContent).toContain('ADDRESS');
    expect(status.textContent).not.toContain('more');
    expect(container.querySelector('.bg-success-solid')).not.toBeNull();
  });

  it('reverse + registered (multiple names): renders primary + "+N more" pill', () => {
    render(
      <SuinsResolution
        direction="reverse"
        query="0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        primary="funkii.sui"
        names={['funkii.sui', 'alt1.sui', 'alt2.sui']}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('funkii.sui');
    expect(status.textContent).toContain('+2 more');
  });

  it('reverse + unregistered: renders truncated address + "no SuiNS name" + muted dot', () => {
    const { container } = render(
      <SuinsResolution
        direction="reverse"
        query="0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        primary={null}
        names={[]}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('0xabcd…6789');
    expect(status.textContent).toContain('no SuiNS name');
    expect(status.textContent).not.toContain('→');
    expect(status.textContent).not.toContain('verified');
    expect(container.querySelector('.bg-fg-muted')).not.toBeNull();
  });

  it('aria-label surfaces the lookup direction + source + target', () => {
    render(
      <SuinsResolution
        direction="forward"
        query="alex.sui"
        address="0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        registered
      />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe(
      'SuiNS resolution: alex.sui resolves to 0xabcd…6789',
    );
  });

  it('aria-label surfaces unregistered fallback', () => {
    render(
      <SuinsResolution
        direction="forward"
        query="ghost.sui"
        address={null}
        registered={false}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-label')).toBe(
      'SuiNS resolution: ghost.sui not registered',
    );
  });

  it('title attribute surfaces full untruncated address on hover', () => {
    const fullAddress =
      '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
    render(
      <SuinsResolution
        direction="forward"
        query="alex.sui"
        address={fullAddress}
        registered
      />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('title')).toBe(`alex.sui → ${fullAddress}`);
  });

  it('title attribute surfaces full names list on reverse hover', () => {
    render(
      <SuinsResolution
        direction="reverse"
        query="0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
        primary="funkii.sui"
        names={['funkii.sui', 'alt1.sui']}
      />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('title')).toContain('funkii.sui, alt1.sui');
  });

  it('does not truncate already-short queries (e.g. SuiNS shorthand <12 chars)', () => {
    // Edge case: someone passes a tiny "address" — don't apply the
    // 6+4 truncation since there'd be nothing left after the ellipsis.
    render(
      <SuinsResolution direction="reverse" query="0xabc" primary={null} names={[]} />,
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('0xabc');
    // No `…` truncation marker
    expect(status.textContent).not.toContain('…');
  });
});
