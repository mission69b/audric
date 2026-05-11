/**
 * SPEC 23B-MPP1 — chrome primitives tests.
 *
 * Pinned behavior:
 *   - MppTag dark/green/blue tones use Tailwind utility classes that resolve
 *     against audric's `@theme inline` token set (e.g. `bg-success-solid/10`).
 *   - MppTag purple tone uses INLINE STYLE referencing `var(--color-purple)` /
 *     `var(--color-purple-bg)` because the theme exposes purple as a single
 *     token (no shade ramp). A regression to Tailwind classes
 *     (`bg-purple-500/10`, `text-purple-400`) would silently no-op — these
 *     tests catch that.
 *   - MppCardShell renders SuiscanLink strip when `txDigest` is provided.
 *   - fmtMppPrice handles every edge case (NaN, null, sub-cent, large) safely.
 *   - MppHeader respects `showSparkle={false}` toggle.
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MppCardShell, MppHeader, MppFooter, MppTag, fmtMppPrice } from './chrome';

describe('MppTag', () => {
  it('dark tone uses token-backed Tailwind classes', () => {
    const { container } = render(<MppTag tone="dark">VENDOR</MppTag>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-surface-sunken');
    expect(span?.className).toContain('text-fg-muted');
    // No inline style — pure utility classes
    expect(span?.getAttribute('style')).toBeNull();
  });

  it('green tone uses token-backed Tailwind classes', () => {
    const { container } = render(<MppTag tone="green">DELIVERED</MppTag>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-success-solid/10');
    expect(span?.className).toContain('text-success-solid');
  });

  it('blue tone uses token-backed Tailwind classes', () => {
    const { container } = render(<MppTag tone="blue">INFO</MppTag>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-info-solid/10');
    expect(span?.className).toContain('text-info-solid');
  });

  it('purple tone uses inline style (theme has no shade ramp)', () => {
    // CRITICAL — audric's Tailwind v4 `@theme inline` defines `--color-purple`
    // as a single token without a shade ramp. Using `bg-purple-500/10` etc.
    // (the Tailwind default-palette names) silently no-ops in this build.
    // The fix is to render purple via inline style referencing the token.
    const { container } = render(<MppTag tone="purple">AI-DESIGNED</MppTag>);
    const span = container.querySelector('span');
    const style = span?.getAttribute('style') ?? '';
    expect(style).toContain('color: var(--color-purple)');
    expect(style).toContain('background: var(--color-purple-bg)');
    // No raw Tailwind purple classes (regression guard)
    expect(span?.className).not.toContain('purple-500');
    expect(span?.className).not.toContain('purple-400');
  });

  it('defaults to dark tone when tone prop omitted', () => {
    const { container } = render(<MppTag>FALLBACK</MppTag>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-surface-sunken');
  });

  it('renders children content', () => {
    const { container } = render(<MppTag>HELLO</MppTag>);
    expect(container.textContent).toBe('HELLO');
  });
});

describe('MppCardShell', () => {
  it('renders header + body + footer in order', () => {
    const { container } = render(
      <MppCardShell header={<div>HEADER</div>} footer={<div>FOOTER</div>}>
        BODY
      </MppCardShell>,
    );
    const text = container.textContent ?? '';
    expect(text.indexOf('HEADER')).toBeLessThan(text.indexOf('BODY'));
    expect(text.indexOf('BODY')).toBeLessThan(text.indexOf('FOOTER'));
  });

  it('omits header / footer slots when not provided', () => {
    const { container } = render(<MppCardShell>BODY</MppCardShell>);
    expect(container.textContent).toBe('BODY');
  });

  it('renders SuiscanLink when txDigest present', () => {
    const { container } = render(
      <MppCardShell txDigest="ABCDEF1234567890ABCDEF1234567890ABCD">BODY</MppCardShell>,
    );
    expect(container.textContent).toContain('Suiscan');
  });

  it('does not render SuiscanLink when txDigest absent', () => {
    const { container } = render(<MppCardShell>BODY</MppCardShell>);
    expect(container.textContent).not.toContain('Suiscan');
  });

  it('passes external className through', () => {
    const { container } = render(
      <MppCardShell className="my-test-class">BODY</MppCardShell>,
    );
    const shell = container.firstChild as HTMLElement;
    expect(shell.className).toContain('my-test-class');
  });

  it('respects bodyNoPadding to drop body padding', () => {
    const { container } = render(<MppCardShell bodyNoPadding>BODY</MppCardShell>);
    // Outer shell, then body div
    const shell = container.firstChild as HTMLElement;
    const body = shell.querySelector('div');
    expect(body?.className).toBe('');
  });
});

describe('MppHeader', () => {
  it('renders sparkle by default', () => {
    const { container } = render(<MppHeader caption="HELLO" />);
    expect(container.textContent).toContain('✦');
    expect(container.textContent).toContain('HELLO');
  });

  it('omits sparkle when showSparkle={false}', () => {
    const { container } = render(<MppHeader caption="HELLO" showSparkle={false} />);
    expect(container.textContent).not.toContain('✦');
    expect(container.textContent).toContain('HELLO');
  });

  it('renders right-side meta when provided', () => {
    const { container } = render(<MppHeader caption="HELLO" right="$0.04" />);
    expect(container.textContent).toContain('$0.04');
  });
});

describe('MppFooter', () => {
  it('renders meta and tag', () => {
    const { container } = render(
      <MppFooter meta="LEFT META" tag={<MppTag>RIGHT</MppTag>} />,
    );
    expect(container.textContent).toContain('LEFT META');
    expect(container.textContent).toContain('RIGHT');
  });

  it('omits tag when not provided', () => {
    const { container } = render(<MppFooter meta="LEFT" />);
    expect(container.textContent).toBe('LEFT');
  });
});

describe('fmtMppPrice', () => {
  it('formats normal positive numbers as $X.XX', () => {
    expect(fmtMppPrice(0.04)).toBe('$0.04');
    expect(fmtMppPrice(1.23)).toBe('$1.23');
    expect(fmtMppPrice(45)).toBe('$45.00');
    expect(fmtMppPrice(1234.56)).toBe('$1234.56');
  });

  it('parses string inputs (gateway format)', () => {
    expect(fmtMppPrice('0.04')).toBe('$0.04');
    expect(fmtMppPrice('45.00')).toBe('$45.00');
  });

  it('shows < $0.01 for sub-half-cent values (rounding floor)', () => {
    expect(fmtMppPrice(0.001)).toBe('< $0.01');
    expect(fmtMppPrice(0.0046)).toBe('< $0.01');
    expect(fmtMppPrice('0.001')).toBe('< $0.01');
  });

  it('threshold check is exclusive at 0.005 (rounds up to $0.01 at 0.005)', () => {
    expect(fmtMppPrice(0.005)).toBe('$0.01');
    expect(fmtMppPrice(0.0049)).toBe('< $0.01');
  });

  it('returns em-dash for null / undefined', () => {
    expect(fmtMppPrice(null)).toBe('—');
    expect(fmtMppPrice(undefined)).toBe('—');
  });

  it('returns em-dash for non-numeric strings (NaN)', () => {
    expect(fmtMppPrice('not-a-number')).toBe('—');
    expect(fmtMppPrice('abc')).toBe('—');
  });

  it('returns em-dash for Infinity', () => {
    expect(fmtMppPrice(Infinity)).toBe('—');
    expect(fmtMppPrice(-Infinity)).toBe('—');
  });

  it('formats zero as $0.00 (price floor doesn\'t affect zero)', () => {
    expect(fmtMppPrice(0)).toBe('$0.00');
    expect(fmtMppPrice('0')).toBe('$0.00');
  });

  it('formats negative numbers (defensive — should not happen in production)', () => {
    expect(fmtMppPrice(-1)).toBe('$-1.00');
  });
});
