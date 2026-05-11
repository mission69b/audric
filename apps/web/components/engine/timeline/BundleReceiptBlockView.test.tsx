// ───────────────────────────────────────────────────────────────────────────
// SPEC 23B-W5 — BundleReceiptBlockView coverage
//
// First render-level test file for this component. Seeded as part of W5 to
// pin the new ⚡ bolt prefix on the `GAS · SPONSORED` footer (mirrors A5's
// PermissionCard treatment so the pre-tap card and post-tap receipt read
// as one visual family).
//
// While this file is being created, also pins the existing branch
// semantics so a future "tidy up the conditional title/footer" refactor
// can't silently drop them:
//
//   1. Success branch: "PAYMENT INTENT" title, ✓ ATOMIC TX, "ALL SUCCEEDED"
//   2. Atomic-revert branch: "PAYMENT INTENT REVERTED" title, ✗ ATOMICALLY
//      FAILED, "ALL FAILED", no Suiscan link, footnote present
//   3. Session-expired branch: "SESSION EXPIRED" title, NOT SUBMITTED
//      footer, "Sign back in" button when handler provided
//
// The ⚡ MUST appear in ALL THREE branches — it describes the intent
// type ("this was a sponsored intent"), not the execution outcome. A
// regression that suppresses it on error / session-expired would break
// the "one visual family" rhyme with PermissionCard.
// ───────────────────────────────────────────────────────────────────────────

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BundleReceiptBlockView } from './BundleReceiptBlockView';
import type { BundleReceiptTimelineBlock } from '@/lib/engine-types';

function makeBlock(overrides: Partial<BundleReceiptTimelineBlock> = {}): BundleReceiptTimelineBlock {
  return {
    type: 'bundle-receipt',
    attemptId: 'att-1',
    txDigest: 'BGhEXJ4d4SiAHx',
    legs: [
      {
        toolName: 'swap_execute',
        toolUseId: 'tc-1',
        description: 'Swap 2 SUI for USDC (1% max slippage)',
        isError: false,
      },
      {
        toolName: 'save_deposit',
        toolUseId: 'tc-2',
        description: 'Save 2.581019 USDC into lending',
        isError: false,
      },
    ],
    startedAt: 1000,
    endedAt: 1000,
    isError: false,
    ...overrides,
  };
}

describe('BundleReceiptBlockView — success branch (W5: ⚡ footer)', () => {
  it('renders the W5 ⚡ bolt prefix before "GAS · SPONSORED"', () => {
    const { container } = render(<BundleReceiptBlockView block={makeBlock()} />);
    // The bolt is `aria-hidden="true"` so the screen-reader text reads as
    // "GAS · SPONSORED" not "lightning bolt GAS · SPONSORED" — assertion
    // pivots on raw textContent which DOES include aria-hidden glyphs.
    const text = container.textContent ?? '';
    const boltIdx = text.indexOf('⚡');
    const gasIdx = text.indexOf('GAS · SPONSORED');
    expect(boltIdx).toBeGreaterThanOrEqual(0);
    expect(gasIdx).toBeGreaterThan(boltIdx);
  });

  it('renders the success-branch title + status copy', () => {
    const { container } = render(<BundleReceiptBlockView block={makeBlock()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('PAYMENT INTENT');
    expect(text).toContain('1 ATOMIC TX · 2 ops');
    expect(text).toContain('ALL SUCCEEDED');
  });

  it('renders both legs with ✓ marks and their description text', () => {
    const { container } = render(<BundleReceiptBlockView block={makeBlock()} />);
    const text = container.textContent ?? '';
    expect(text).toContain('Swap 2 SUI for USDC');
    expect(text).toContain('Save 2.581019 USDC into lending');
    // 2 ✓ in legs + 1 ✓ in title badge = 3 total
    const checkmarks = (text.match(/✓/g) ?? []).length;
    expect(checkmarks).toBeGreaterThanOrEqual(3);
  });
});

describe('BundleReceiptBlockView — atomic-revert branch (W5: ⚡ stays)', () => {
  it('renders ⚡ even when the bundle reverted (intent was sponsored regardless)', () => {
    // Intent framing: even if all legs failed atomically, gas WAS
    // sponsored at the intent layer. The bolt is a property of the
    // intent type, not the execution outcome. Pin it.
    const { container } = render(
      <BundleReceiptBlockView
        block={makeBlock({
          isError: true,
          txDigest: undefined,
          legs: makeBlock().legs.map((l) => ({ ...l, isError: true })),
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('⚡');
    expect(text).toContain('GAS · SPONSORED');
    expect(text).toContain('PAYMENT INTENT REVERTED');
    expect(text).toContain('ATOMICALLY FAILED');
    expect(text).toContain('ALL FAILED');
    // No Suiscan link because nothing reached chain successfully.
    expect(text).toContain('NO ON-CHAIN STATE');
  });
});

describe('BundleReceiptBlockView — session-expired branch (W5: ⚡ stays)', () => {
  it('renders ⚡ even when the session expired before submission', () => {
    // Same framing as atomic-revert: the INTENT was sponsored-eligible.
    // The fact that Enoki refused to actually sponsor (because session
    // expired) doesn't retroactively un-sponsor the intent type. Pin
    // the bolt so the user reads "this is the same kind of intent, it
    // just didn't go through" rather than feeling they're looking at a
    // different visual family entirely.
    const { container } = render(
      <BundleReceiptBlockView
        block={makeBlock({
          sessionExpired: true,
          txDigest: undefined,
          isError: true,
          legs: makeBlock().legs.map((l) => ({ ...l, isError: true })),
        })}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('⚡');
    expect(text).toContain('GAS · SPONSORED');
    expect(text).toContain('SESSION EXPIRED');
    expect(text).toContain('NOT SUBMITTED');
    expect(text).toContain('NEVER REACHED CHAIN');
  });

  it('renders the "Sign back in" button only when onSignBackIn handler is provided', () => {
    const handler = vi.fn();
    const { container, rerender } = render(
      <BundleReceiptBlockView
        block={makeBlock({
          sessionExpired: true,
          txDigest: undefined,
          isError: true,
        })}
        onSignBackIn={handler}
      />,
    );
    expect(container.textContent ?? '').toContain('Sign back in');

    rerender(
      <BundleReceiptBlockView
        block={makeBlock({
          sessionExpired: true,
          txDigest: undefined,
          isError: true,
        })}
      />,
    );
    expect(container.textContent ?? '').not.toContain('Sign back in');
  });
});
