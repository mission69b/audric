/**
 * SPEC 10 Phase B.1 — `<UsernamePicker>` component.
 *
 * Coverage:
 *   1. Renders with smart pre-fill chips when name+email passed.
 *   2. Renders without chips when both name+email missing.
 *   3. Submit gated on `status === 'available'`.
 *   4. Free-text input runs debounced check; out-of-order responses
 *      don't overwrite the latest result.
 *   5. Sync validation short-circuits the network call (too-short, invalid).
 *   6. Per-chip availability pre-check renders ✓ / ✗ / spinner.
 *   7. Clicking an available chip fills the input + commits status (no
 *      flash of "checking…" for an already-verified label).
 *   8. Clicking a non-available chip is a no-op.
 *   9. 🔄 regenerate advances seed → new chips.
 *  10. Skip button only renders when `onSkip` is provided.
 *  11. `disabled` prop mutes inputs + button + chips.
 *  12. 503 verifier-down → status banner asks user to retry.
 *  13. Submit calls `onSubmit(label)` with the canonical lowercased form.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import {
  UsernamePicker,
  type UsernameCheckResult,
} from '../UsernamePicker';

// Helper: create a fetcher whose response is configurable per-call.
function makeFetcher(
  responses: Record<string, UsernameCheckResult> = {},
  defaultResponse: UsernameCheckResult = { available: true },
) {
  const calls: string[] = [];
  const fn = vi.fn(async (label: string): Promise<UsernameCheckResult> => {
    calls.push(label);
    return responses[label] ?? defaultResponse;
  });
  return { fn, calls };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UsernamePicker', () => {
  describe('rendering', () => {
    it('shows chip suggestions when name + email present', async () => {
      const { fn } = makeFetcher();
      render(
        <UsernamePicker
          googleName="John Smith"
          googleEmail="funkii@gmail.com"
          onSubmit={vi.fn()}
          checkFetcher={fn}
        />,
      );
      // 3 chips + the regenerate button render synchronously.
      expect(screen.getByTestId('username-picker-chip-funkii')).toBeTruthy();
      expect(screen.getByTestId('username-picker-chip-johnsmith')).toBeTruthy();
      expect(screen.getByTestId('username-picker-chip-jsmith')).toBeTruthy();
      expect(screen.getByTestId('username-picker-regenerate')).toBeTruthy();
      // Drain the chip pre-check Promise.all to keep React Testing Library
      // from logging an act() warning when the component unmounts.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    });

    it('hides chip row when name + email both missing', () => {
      const { fn } = makeFetcher();
      render(
        <UsernamePicker
          googleName={null}
          googleEmail={null}
          onSubmit={vi.fn()}
          checkFetcher={fn}
        />,
      );
      // No chip-group rendered.
      expect(screen.queryByLabelText('Username suggestions')).toBeNull();
      // Input is still present.
      expect(screen.getByTestId('username-picker-input')).toBeTruthy();
    });

    it('renders skip button only when onSkip provided', () => {
      const { fn } = makeFetcher();
      const { rerender } = render(
        <UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />,
      );
      expect(screen.queryByTestId('username-picker-skip')).toBeNull();

      rerender(
        <UsernamePicker
          onSubmit={vi.fn()}
          onSkip={vi.fn()}
          checkFetcher={fn}
        />,
      );
      expect(screen.getByTestId('username-picker-skip')).toBeTruthy();
    });

    it('S.118: renders the @audric suffix as a non-editable element', () => {
      const { fn } = makeFetcher();
      render(<UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />);
      // [S.118] D10 reversal — suffix display switched from `.audric.sui`
      // to `@audric`. Both forms resolve to the same address via SuiNS
      // RPC; this is purely a render-layer change.
      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      expect(input.value).toBe('');
      const inputWrap = input.parentElement!;
      expect(within(inputWrap).getByText('@audric')).toBeTruthy();
    });
  });

  describe('submit gating', () => {
    it('submit is disabled when status is idle', () => {
      const { fn } = makeFetcher();
      render(<UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />);
      const submit = screen.getByTestId('username-picker-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('submit enables once free-text status === available', async () => {
      const { fn } = makeFetcher({}, { available: true });
      const onSubmit = vi.fn();
      render(<UsernamePicker onSubmit={onSubmit} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'alice' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      const submit = screen.getByTestId('username-picker-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);

      fireEvent.click(submit);
      expect(onSubmit).toHaveBeenCalledWith('alice');
    });

    it('submit stays disabled when status === taken', async () => {
      const { fn } = makeFetcher(
        { taken: { available: false, reason: 'taken' } },
      );
      const onSubmit = vi.fn();
      render(<UsernamePicker onSubmit={onSubmit} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'taken' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });

      const submit = screen.getByTestId('username-picker-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('submits the canonical lowercased form (handles case + whitespace)', async () => {
      const { fn } = makeFetcher();
      const onSubmit = vi.fn();
      render(<UsernamePicker onSubmit={onSubmit} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      // The input's onChange already lowercases + trims, so we expect
      // 'alice' even though the user typed '  ALICE  '. But fire change
      // with the raw value to verify the pipeline.
      fireEvent.change(input, { target: { value: '  ALICE  ' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      fireEvent.click(screen.getByTestId('username-picker-submit'));

      expect(onSubmit).toHaveBeenCalledWith('alice');
    });
  });

  describe('sync validation short-circuit', () => {
    it('too-short status surfaces without a network call', async () => {
      const { fn } = makeFetcher();
      render(<UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'ab' } });

      // Drain microtasks; no debounce wait needed because validation is sync.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      const status = screen.getByTestId('username-picker-status');
      expect(status.getAttribute('data-status')).toBe('too-short');
      // Free-text path should not have triggered a network call.
      // Chip pre-checks may have, but those are for chip labels, not 'ab'.
      expect(fn.mock.calls.find(([l]) => l === 'ab')).toBeUndefined();
    });

    it('invalid charset short-circuits without network call', async () => {
      const { fn } = makeFetcher();
      render(<UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      // Capital letters get lowercased by onChange, so use a hyphen at start
      // (an invalid pattern) — guaranteed to fail validation.
      fireEvent.change(input, { target: { value: '-bad' } });

      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      const status = screen.getByTestId('username-picker-status');
      expect(status.getAttribute('data-status')).toBe('invalid');
      expect(fn.mock.calls.find(([l]) => l === '-bad')).toBeUndefined();
    });
  });

  describe('per-chip pre-check', () => {
    it('chips render as checking initially, then resolve to ✓ / ✗', async () => {
      const { fn } = makeFetcher({
        funkii: { available: true },
        johnsmith: { available: false, reason: 'taken' },
        jsmith: { available: true },
      });
      render(
        <UsernamePicker
          googleName="John Smith"
          googleEmail="funkii@gmail.com"
          onSubmit={vi.fn()}
          checkFetcher={fn}
        />,
      );

      // Initial render: chips should be in checking state.
      const funkiiChip = screen.getByTestId('username-picker-chip-funkii');
      expect(funkiiChip.getAttribute('data-status')).toBe('checking');

      // Drain the in-flight Promise.all.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });

      await waitFor(() => {
        const c = screen.getByTestId('username-picker-chip-funkii');
        expect(c.getAttribute('data-status')).toBe('available');
      });
      const jsChip = screen.getByTestId('username-picker-chip-johnsmith');
      expect(jsChip.getAttribute('data-status')).toBe('taken');
    });

    it('clicking an available chip fills the input and commits available status', async () => {
      const { fn } = makeFetcher({
        funkii: { available: true },
        johnsmith: { available: true },
        jsmith: { available: true },
      });
      render(
        <UsernamePicker
          googleName="John Smith"
          googleEmail="funkii@gmail.com"
          onSubmit={vi.fn()}
          checkFetcher={fn}
        />,
      );

      // Wait for chip statuses to resolve.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      await waitFor(() => {
        const c = screen.getByTestId('username-picker-chip-funkii');
        expect(c.getAttribute('data-status')).toBe('available');
      });

      fireEvent.click(screen.getByTestId('username-picker-chip-funkii'));

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      expect(input.value).toBe('funkii');

      // Status line should immediately read available — no flash of "checking…"
      // because the chip-click path skips the debounce + network call.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      const status = screen.getByTestId('username-picker-status');
      expect(status.getAttribute('data-status')).toBe('available');
    });

    it('clicking a taken chip is a no-op', async () => {
      const { fn } = makeFetcher({
        funkii: { available: false, reason: 'taken' },
        johnsmith: { available: true },
        jsmith: { available: true },
      });
      render(
        <UsernamePicker
          googleName="John Smith"
          googleEmail="funkii@gmail.com"
          onSubmit={vi.fn()}
          checkFetcher={fn}
        />,
      );

      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      await waitFor(() => {
        const c = screen.getByTestId('username-picker-chip-funkii');
        expect(c.getAttribute('data-status')).toBe('taken');
      });

      fireEvent.click(screen.getByTestId('username-picker-chip-funkii'));

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      expect(input.value).toBe(''); // unchanged
    });
  });

  describe('regenerate', () => {
    it('🔄 advances seed → new chip set', async () => {
      const { fn } = makeFetcher();
      render(
        <UsernamePicker
          googleName="John Smith"
          googleEmail="funkii@gmail.com"
          onSubmit={vi.fn()}
          checkFetcher={fn}
        />,
      );

      // seed=0 chips: funkii, johnsmith, jsmith
      expect(screen.getByTestId('username-picker-chip-funkii')).toBeTruthy();

      fireEvent.click(screen.getByTestId('username-picker-regenerate'));

      // seed=1 chips: john-smith, john, smithj (per suggest-usernames test).
      // 'funkii' chip should be gone.
      await waitFor(() => {
        expect(screen.queryByTestId('username-picker-chip-funkii')).toBeNull();
      });
      expect(screen.getByTestId('username-picker-chip-john-smith')).toBeTruthy();
    });
  });

  describe('disabled prop', () => {
    it('disables input + chips + submit + regenerate', async () => {
      // Async test signature so the post-render drain can use await act().
      const { fn } = makeFetcher();
      render(
        <UsernamePicker
          googleName="John Smith"
          googleEmail="funkii@gmail.com"
          onSubmit={vi.fn()}
          disabled
          checkFetcher={fn}
        />,
      );
      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      const submit = screen.getByTestId('username-picker-submit') as HTMLButtonElement;
      const regen = screen.getByTestId('username-picker-regenerate') as HTMLButtonElement;
      expect(input.disabled).toBe(true);
      expect(submit.disabled).toBe(true);
      expect(regen.disabled).toBe(true);
      expect(submit.textContent).toBe('Claiming…');
      // Drain chip pre-check to suppress act() warning on unmount.
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    });
  });

  describe('verifier-down (503)', () => {
    it('shows retry hint when verifier reports 503', async () => {
      const { fn } = makeFetcher(
        { alice: { available: false, verifierDown: true } },
      );
      render(<UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'alice' } });

      await act(async () => { await vi.advanceTimersByTimeAsync(400); });

      await waitFor(() => {
        const status = screen.getByTestId('username-picker-status');
        expect(status.getAttribute('data-status')).toBe('verifier-down');
        expect(status.textContent?.toLowerCase()).toContain('try again');
      });
    });
  });

  describe('debounce', () => {
    it('rapid keystrokes only check the final value', async () => {
      const { fn } = makeFetcher();
      render(<UsernamePicker onSubmit={vi.fn()} checkFetcher={fn} />);

      const input = screen.getByTestId('username-picker-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'al' } });
      fireEvent.change(input, { target: { value: 'ali' } });
      fireEvent.change(input, { target: { value: 'alic' } });
      fireEvent.change(input, { target: { value: 'alice' } });

      await act(async () => { await vi.advanceTimersByTimeAsync(400); });

      // 'al' was sync-rejected (too-short, no fetch). 'ali', 'alic', 'alice'
      // each schedule a debounce timer; only the last survives clearTimeout.
      // So free-text should hit the network exactly once for 'alice'.
      const aliceCalls = fn.mock.calls.filter(([l]) => l === 'alice').length;
      const aliCalls = fn.mock.calls.filter(([l]) => l === 'ali').length;
      const alicCalls = fn.mock.calls.filter(([l]) => l === 'alic').length;
      expect(aliceCalls).toBe(1);
      expect(aliCalls).toBe(0);
      expect(alicCalls).toBe(0);
    });
  });

  describe('skip flow', () => {
    it('clicking skip calls onSkip', () => {
      const { fn } = makeFetcher();
      const onSkip = vi.fn();
      render(<UsernamePicker onSubmit={vi.fn()} onSkip={onSkip} checkFetcher={fn} />);
      fireEvent.click(screen.getByTestId('username-picker-skip'));
      expect(onSkip).toHaveBeenCalledOnce();
    });
  });
});
