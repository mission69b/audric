/**
 * S.84 — `<UsernameChangeModal>` state machine.
 *
 * Coverage:
 *   1. Closed → renders nothing (no DOM impact when hidden).
 *   2. Open → renders dialog with current handle visible.
 *   3. Empty input → submit button disabled, no validation hint.
 *   4. Invalid input (too-short / charset) → status hint + submit disabled.
 *   5. Reserved label → status hint + submit disabled.
 *   6. Same as current → status hint + submit disabled.
 *   7. Valid input → submit enabled, no hint.
 *   8. Submit success → success card renders, onChanged + onClose fire.
 *   9. Submit 409 (taken) → inline error, button re-enables, input preserved.
 *  10. Submit 503 → "verifier down" copy.
 *  11. Submit 429 → rate-limit copy.
 *  12. Submit network failure → generic copy.
 *  13. Cancel button → onClose fires (when not submitting).
 *  14. Escape key → onClose fires (when not submitting).
 *  15. Backdrop click → onClose fires (when not submitting).
 *  16. Submitting state → close affordances disabled to avoid orphan promise.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { UsernameChangeModal, ChangeError } from '../UsernameChangeModal';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const ADDR = '0x' + 'a'.repeat(64);
const JWT = 'header.payload.signature';
const CURRENT = 'alice';

interface RenderOpts {
  open?: boolean;
  changeFetcher?: Parameters<typeof UsernameChangeModal>[0]['changeFetcher'];
  onChanged?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
  currentLabel?: string;
}

function renderModal(opts: RenderOpts = {}) {
  const onChanged = opts.onChanged ?? vi.fn();
  const onClose = opts.onClose ?? vi.fn();
  const utils = render(
    <UsernameChangeModal
      open={opts.open ?? true}
      address={ADDR}
      jwt={JWT}
      currentLabel={opts.currentLabel ?? CURRENT}
      onClose={onClose}
      onChanged={onChanged}
      changeFetcher={opts.changeFetcher}
    />,
  );
  return { ...utils, onChanged, onClose };
}

describe('<UsernameChangeModal>', () => {
  it('renders nothing when open=false', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('username-change-modal')).toBeNull();
  });

  it('renders dialog with current handle when open', () => {
    renderModal();
    expect(screen.getByTestId('username-change-modal')).not.toBeNull();
    // Current handle appears in both the "Current" pill AND the warning
    // callout — `getAllByText` asserts both render.
    expect(screen.getAllByText('alice.audric.sui').length).toBeGreaterThanOrEqual(2);
  });

  it('disables submit when input is empty', () => {
    renderModal();
    const submit = screen.getByTestId('username-change-modal-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows too-short hint and disables submit for 2-char input', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'ab' } });
    expect(screen.getByText(/at least 3 characters/i)).not.toBeNull();
    const submit = screen.getByTestId('username-change-modal-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows reserved hint for reserved labels', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'admin' } });
    expect(screen.getByText(/reserved/i)).not.toBeNull();
    const submit = screen.getByTestId('username-change-modal-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('shows unchanged hint when input matches currentLabel', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'alice' } });
    expect(screen.getByText(/that's your current handle/i)).not.toBeNull();
    const submit = screen.getByTestId('username-change-modal-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('enables submit for valid distinct input', () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    const submit = screen.getByTestId('username-change-modal-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('on success: shows success card, fires onChanged, then onClose after timer', async () => {
    const onChanged = vi.fn();
    const onClose = vi.fn();
    const fetcher = vi.fn().mockResolvedValue({
      success: true,
      oldLabel: 'alice',
      newLabel: 'bob',
      fullHandle: 'bob.audric.sui',
      txDigest: '0xCHANGED',
      walletAddress: ADDR,
    });
    renderModal({ changeFetcher: fetcher, onChanged, onClose });

    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('username-change-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('username-change-modal-success')).not.toBeNull();
    });
    expect(onChanged).toHaveBeenCalledWith('bob', 'bob.audric.sui');
    expect(fetcher).toHaveBeenCalledWith('bob');

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('on 409 taken: shows error copy, preserves input, re-enables submit', async () => {
    const fetcher = vi.fn().mockRejectedValue(
      new ChangeError(409, 'taken', 'Username already claimed'),
    );
    renderModal({ changeFetcher: fetcher });

    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('username-change-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText(/already claimed/i)).not.toBeNull();
    });
    expect((screen.getByLabelText(/new handle/i) as HTMLInputElement).value).toBe('bob');
    const submit = screen.getByTestId('username-change-modal-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it('on 503 verifier-down: shows retry copy', async () => {
    const fetcher = vi.fn().mockRejectedValue(
      new ChangeError(503, 'verifier-down', 'SuiNS verification temporarily unavailable'),
    );
    renderModal({ changeFetcher: fetcher });

    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('username-change-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText(/please try again in a moment/i)).not.toBeNull();
    });
  });

  it('on 429 rate-limit: shows rate-limit copy', async () => {
    const fetcher = vi.fn().mockRejectedValue(
      new ChangeError(429, 'rate-limit', 'Too many attempts'),
    );
    renderModal({ changeFetcher: fetcher });

    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('username-change-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText(/too many change attempts/i)).not.toBeNull();
    });
  });

  it('on network failure: shows generic copy', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('Network failure'));
    renderModal({ changeFetcher: fetcher });

    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    await act(async () => {
      fireEvent.click(screen.getByTestId('username-change-modal-submit'));
    });

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).not.toBeNull();
    });
  });

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('Escape key calls onClose', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByTestId('username-change-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT close on Escape during submitting phase', async () => {
    let resolveFetch!: (b: unknown) => void;
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onClose = vi.fn();
    renderModal({ changeFetcher: fetcher, onClose });

    fireEvent.change(screen.getByLabelText(/new handle/i), { target: { value: 'bob' } });
    fireEvent.click(screen.getByTestId('username-change-modal-submit'));

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      resolveFetch({
        success: true,
        oldLabel: 'alice',
        newLabel: 'bob',
        fullHandle: 'bob.audric.sui',
        txDigest: '0x',
        walletAddress: ADDR,
      });
    });
  });
});
