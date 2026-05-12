/**
 * SPEC 23B-MPP6 — ReviewCard tests (v2 — B-MPP6-fastpath / 2026-05-12).
 *
 * v2 shape changes vs original (B-MPP6 v1):
 *   - Accept button REMOVED. Tests for "Accept click latches state" and
 *     related Accept-specific assertions deleted (auto-executed cards
 *     already cleared on-chain — there's nothing to "accept").
 *   - Regenerate now optionally accepts an async `onRegenerate` callback
 *     (fastpath path). When provided, the card awaits it; on reject, the
 *     latch resets + an inline error chip appears.
 *   - When `onRegenerate` is not provided, falls back to the legacy
 *     Option C path (synthesized "Regenerate the {noun}" via onSendMessage).
 *
 * Coverage:
 *   - Render states (default / regenerating / cancelled / error)
 *   - Click latch (Regenerate disables Cancel and vice versa)
 *   - Cost footer (sourced from data.price; sub-cent floor)
 *   - No-action-available state (no callbacks → buttons disabled)
 *   - Synthesized Cancel message text contract
 *   - FASTPATH: onRegenerate is awaited, success keeps latch, failure resets + shows error chip
 *   - LEGACY FALLBACK: onSendMessage gets the synthesized "Regenerate the {noun}" message
 *   - Error chip: dismissable, re-arms buttons, exposes full message via title
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewCard } from './ReviewCard';

describe('ReviewCard primitive (v2)', () => {
  it('default state: renders Regenerate + Cancel + Review label + cost footer (no Accept)', () => {
    const { container } = render(
      <ReviewCard price="0.04" onSendMessage={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /accept/i })).toBeNull();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(container.textContent).toContain('Review');
    expect(container.textContent).toContain('Each regeneration');
    expect(container.textContent).toContain('$0.04');
  });

  it('uses the artifactNoun in the ARIA label and synthesized Cancel message', () => {
    const onSendMessage = vi.fn();
    render(
      <ReviewCard price="0.04" artifactNoun="image" onSendMessage={onSendMessage} />,
    );

    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('Review the generated image');
    expect(screen.getByRole('button', { name: 'Regenerate this image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' })).toBeTruthy();
  });

  it('falls back to "preview" noun when artifactNoun is omitted', () => {
    const { container } = render(<ReviewCard price="0.04" onSendMessage={vi.fn()} />);
    expect(container.querySelector('[aria-label="Review the generated preview"]')).not.toBeNull();
  });

  it('Cancel click: latches to "Cancelled" and fires the synthesized message', () => {
    const onSendMessage = vi.fn();
    const { container } = render(
      <ReviewCard price="0.04" artifactNoun="image" onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and discard this image' }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith(
      "Cancel — discard this image, I don't want to use it.",
    );
    expect(container.textContent).toContain('Cancelled');
    // Regenerate is disabled after Cancel latches.
    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);
  });

  it('click latch: clicking Cancel after Regenerate is a no-op', () => {
    const onSendMessage = vi.fn();
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and discard this image' }));

    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it('all callbacks undefined (unauth / demo session): both buttons render disabled', () => {
    const { container } = render(<ReviewCard price="0.04" artifactNoun="image" />);

    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);

    expect(container.textContent).not.toContain('Each regeneration');
  });

  it('cost footer: hides when price is missing or unparseable', () => {
    const { container } = render(<ReviewCard price={undefined} onSendMessage={vi.fn()} />);
    expect(container.textContent).not.toContain('Each regeneration');
    expect(container.textContent).not.toContain('—');
  });

  it('cost footer: handles the sub-cent floor via fmtMppPrice', () => {
    const { container } = render(<ReviewCard price="0.001" onSendMessage={vi.fn()} />);
    expect(container.textContent).toContain('Each regeneration');
    expect(container.textContent).toContain('< $0.01');
  });

  it('cost footer: handles numeric prices (not just stringified)', () => {
    const { container } = render(<ReviewCard price={1.5} onSendMessage={vi.fn()} />);
    expect(container.textContent).toContain('$1.50');
  });

  it('uses the elevenlabs artifactNoun ("audio clip") in synthesized Cancel message', () => {
    const onSendMessage = vi.fn();
    render(
      <ReviewCard price="0.02" artifactNoun="audio clip" onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and discard this audio clip' }));
    expect(onSendMessage).toHaveBeenCalledWith(
      "Cancel — discard this audio clip, I don't want to use it.",
    );
  });
});

describe('ReviewCard primitive (v2) — fastpath path (onRegenerate)', () => {
  it('FASTPATH: when onRegenerate is provided, Regenerate awaits it (does NOT call onSendMessage)', async () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    const onSendMessage = vi.fn();
    const { container } = render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    // While in-flight, label shows "Regenerating…"
    expect(container.textContent).toContain('Regenerating…');

    // onRegenerate fired, onSendMessage did NOT
    expect(onRegenerate).toHaveBeenCalledTimes(1);
    expect(onSendMessage).not.toHaveBeenCalled();

    // Wait for the promise to resolve
    await waitFor(() => {
      // Latch stays latched on success — the new tool block appears
      // in the timeline above; this card is now historic.
      expect(container.textContent).toContain('Regenerating…');
    });
  });

  it('FASTPATH: Regenerate latches buttons during in-flight (Cancel disabled too)', async () => {
    let resolveFn: (() => void) | undefined;
    const onRegenerate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFn = resolve;
        }),
    );
    render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);

    // Resolve to clean up the pending promise
    resolveFn?.();
  });

  it('FASTPATH: onRegenerate REJECT resets latch and shows inline error chip', async () => {
    const onRegenerate = vi.fn().mockRejectedValue(new Error('Gateway timeout'));
    const onSendMessage = vi.fn();
    const { container } = render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    await waitFor(() => {
      expect(container.textContent).toContain('Regen failed');
    });

    // Latch reset — buttons re-armed
    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(false);

    // Error chip visible with truncated message
    expect(container.textContent).toContain('Gateway timeout');
    expect(container.textContent).toContain('Try again');

    // Cost footer hidden during error state
    expect(container.textContent).not.toContain('Each regeneration');
  });

  it('FASTPATH: error chip dismissal re-arms buttons + restores cost footer', async () => {
    const onRegenerate = vi.fn().mockRejectedValue(new Error('Network error'));
    const { container } = render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));
    await waitFor(() => expect(container.textContent).toContain('Regen failed'));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss regen error and try again' }));

    expect(container.textContent).not.toContain('Regen failed');
    expect(container.textContent).toContain('Review');
    expect(container.textContent).toContain('Each regeneration');
  });

  it('FASTPATH: error chip exposes the full error message via title attribute (long messages)', async () => {
    const longMsg = 'A very long error message from the gateway that exceeds forty characters';
    const onRegenerate = vi.fn().mockRejectedValue(new Error(longMsg));
    const { container } = render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));
    await waitFor(() => expect(container.textContent).toContain('Regen failed'));

    const chip = container.querySelector('[aria-label="Dismiss regen error and try again"]');
    expect(chip).not.toBeNull();
    // Truncated visible text ends with ellipsis
    expect(chip?.textContent).toContain('…');
    // Full message preserved in title for hover access
    expect(chip?.getAttribute('title')).toBe(longMsg);
  });

  it('FASTPATH: retry after error fires onRegenerate again (proper re-arm)', async () => {
    const onRegenerate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Flaky 500'))
      .mockResolvedValueOnce(undefined);
    const { container } = render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
        onSendMessage={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));
    await waitFor(() => expect(container.textContent).toContain('Regen failed'));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss regen error and try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    await waitFor(() => {
      expect(onRegenerate).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ReviewCard primitive (v2) — legacy fallback (no onRegenerate)', () => {
  it('LEGACY: when onRegenerate is undefined, Regenerate fires onSendMessage with synthesized text', () => {
    const onSendMessage = vi.fn();
    const { container } = render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('Regenerate the image');
    expect(container.textContent).toContain('Regenerating…');
  });

  it('LEGACY: latch stays latched after fallback Regenerate (no error path observable)', () => {
    const onSendMessage = vi.fn();
    render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onSendMessage={onSendMessage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);
  });

  it('LEGACY: when ONLY onRegenerate is provided (no onSendMessage), Regenerate works but Cancel is disabled', () => {
    const onRegenerate = vi.fn().mockResolvedValue(undefined);
    render(
      <ReviewCard
        price="0.04"
        artifactNoun="image"
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);
  });
});
