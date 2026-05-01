// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.4 — RetryInterruptedTurn tests (audit Gap J)
// ───────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { RetryInterruptedTurn } from '../RetryInterruptedTurn';

describe('RetryInterruptedTurn', () => {
  it('renders the retry pill with the default idle label', () => {
    render(
      <RetryInterruptedTurn replayText="show savings" onRetry={() => {}} />,
    );
    expect(screen.getByText(/Response interrupted · retry/i)).toBeTruthy();
  });

  it('invokes `onRetry` with the captured replay text on click', () => {
    const onRetry = vi.fn();
    render(<RetryInterruptedTurn replayText="show savings" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledWith('show savings');
  });

  it('switches to "Retrying…" while the onRetry promise is pending', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => { resolve = r; });
    const onRetry = vi.fn(() => pending);
    render(<RetryInterruptedTurn replayText="x" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText(/Retrying…/i)).toBeTruthy();

    resolve();
    await pending;
  });

  it('disables the button when `disabled` is set', () => {
    const onRetry = vi.fn();
    render(
      <RetryInterruptedTurn
        replayText="x"
        onRetry={onRetry}
        disabled
      />,
    );
    const btn = screen.getByRole('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('ignores rapid double-clicks while a retry is in flight', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => { resolve = r; });
    const onRetry = vi.fn(() => pending);
    render(<RetryInterruptedTurn replayText="x" onRetry={onRetry} />);

    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(onRetry).toHaveBeenCalledTimes(1);
    resolve();
    await pending;
  });
});
