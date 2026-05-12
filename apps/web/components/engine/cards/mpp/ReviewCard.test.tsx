/**
 * SPEC 23B-MPP6 — ReviewCard tests.
 *
 * Covers the 4 render states (default / accepted / regenerated / cancelled),
 * the click latch (only one button can fire), the cost footer (sourced from
 * data.price), the no-action-available state (when onSendMessage is
 * undefined), and synthesized message text contracts (the literal strings
 * the LLM will see).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewCard } from './ReviewCard';

describe('ReviewCard primitive', () => {
  it('default state: renders all 3 buttons + Review label + cost footer', () => {
    const { container } = render(
      <ReviewCard price="0.04" onSendMessage={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /accept/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
    expect(container.textContent).toContain('Review');
    expect(container.textContent).toContain('Each regeneration');
    expect(container.textContent).toContain('$0.04');
  });

  it('uses the artifactNoun in the ARIA label and synthesized messages', () => {
    const onSendMessage = vi.fn();
    render(
      <ReviewCard price="0.04" artifactNoun="image" onSendMessage={onSendMessage} />,
    );

    const group = screen.getByRole('group');
    expect(group.getAttribute('aria-label')).toBe('Review the generated image');
    expect(screen.getByRole('button', { name: 'Accept this image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Regenerate this image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' })).toBeTruthy();
  });

  it('falls back to "preview" noun when artifactNoun is omitted', () => {
    const { container } = render(<ReviewCard price="0.04" onSendMessage={vi.fn()} />);
    expect(container.querySelector('[aria-label="Review the generated preview"]')).not.toBeNull();
  });

  it('Accept click: latches state to "Accepted", does NOT fire onSendMessage', () => {
    const onSendMessage = vi.fn();
    const { container } = render(
      <ReviewCard price="0.04" artifactNoun="image" onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Accept this image' }));

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Accepted');
    // All three buttons should be disabled (latched).
    expect(screen.getByRole('button', { name: 'Accept this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);
    // Cost footer hidden post-click (no longer relevant).
    expect(container.textContent).not.toContain('Each regeneration');
  });

  it('Regenerate click: latches to "Regenerating…" and fires the synthesized message', () => {
    const onSendMessage = vi.fn();
    const { container } = render(
      <ReviewCard price="0.04" artifactNoun="image" onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('Regenerate the image');
    expect(container.textContent).toContain('Regenerating…');
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
  });

  it('click latch: a second click on a different button after one click is a no-op', () => {
    const onSendMessage = vi.fn();
    render(
      <ReviewCard price="0.04" artifactNoun="image" onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and discard this image' }));
    fireEvent.click(screen.getByRole('button', { name: 'Accept this image' }));

    // Only the first click (Regenerate) fired.
    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith('Regenerate the image');
  });

  it('uses the elevenlabs artifactNoun ("audio clip") in synthesized messages', () => {
    const onSendMessage = vi.fn();
    render(
      <ReviewCard price="0.02" artifactNoun="audio clip" onSendMessage={onSendMessage} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate this audio clip' }));
    expect(onSendMessage).toHaveBeenCalledWith('Regenerate the audio clip');

    // (Note: this is a fresh render-instance assertion; in production the
    // click latch would prevent a Cancel firing in the same component
    // instance. We're only verifying message text shape per artifactNoun.)
  });

  it('no onSendMessage (unauth / demo session): all buttons render disabled, no action handlers fire', () => {
    const { container } = render(<ReviewCard price="0.04" artifactNoun="image" />);

    expect(screen.getByRole('button', { name: 'Accept this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Regenerate this image' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Cancel and discard this image' }).hasAttribute('disabled')).toBe(true);

    // Cost footer also hidden when no action is possible (no point teasing
    // a regen cost the user can't trigger).
    expect(container.textContent).not.toContain('Each regeneration');
  });

  it('cost footer: hides when price is missing or unparseable (avoids "Each regeneration · —")', () => {
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

  it('Accept post-click: button retains its disabled state and shows the checkmark variant', () => {
    render(<ReviewCard price="0.04" artifactNoun="image" onSendMessage={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Accept this image' }));

    const acceptedBtn = screen.getByRole('button', { name: 'Accept this image' });
    expect(acceptedBtn.textContent).toContain('Accepted');
    expect(acceptedBtn.hasAttribute('disabled')).toBe(true);
  });
});
