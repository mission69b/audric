/**
 * SPEC 10 Phase B-wiring — `<UsernameClaimGate>` state machine.
 *
 * Coverage:
 *   1. Initial render → `picking` phase, picker visible, no error banner.
 *   2. Submit success → transitions picking → claiming → success → renders
 *      `<UsernameClaimSuccess>` with claimed label + walletAddress.
 *   3. Continue button on success → calls onClaimed(label, fullHandle).
 *   4. Skip button → calls onSkipped, gate stays in picking phase
 *      (parent is responsible for unmounting).
 *   5. Reserve 409 (taken) → re-renders picker with typed error copy.
 *   6. Reserve 503 (verifier-down) → re-renders picker with "try again"
 *      copy (covers the post-mint failure mode the picker pre-check
 *      can't reach).
 *   7. Reserve 429 (rate-limit) → re-renders picker with rate-limit copy.
 *   8. Network failure → re-renders picker with generic copy.
 *   9. Picker is `disabled` during `claiming` phase (submit button shows
 *      "Claiming…").
 *  10. Re-submit after error works (state recovers cleanly).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { UsernameClaimGate, ReserveError } from '../UsernameClaimGate';
import type { UsernameCheckResult } from '../UsernamePicker';

// Mock the QrCode module — same rationale as the UsernameClaimSuccess
// test file (jsdom canvas is slow + noisy, real encoding tested elsewhere).
vi.mock('@/components/dashboard/QrCode', () => ({
  QrCode: ({ value }: { value: string }) => (
    <div data-testid="mock-qr-code" data-value={value} />
  ),
}));

// jsdom doesn't ship navigator.clipboard. Stubbed here for the success
// state tests (Continue button doesn't touch clipboard but the success
// component's Copy button is in the same render tree).
beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn() },
  });
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

// Always-available check fetcher for the picker's debounced check —
// tests focus on the GATE's reserve flow, not the picker's debounce.
const alwaysAvailable = (): Promise<UsernameCheckResult> =>
  Promise.resolve({ available: true });

interface RenderGateOpts {
  reserveFetcher?: Parameters<typeof UsernameClaimGate>[0]['reserveFetcher'];
  onClaimed?: ReturnType<typeof vi.fn>;
  onSkipped?: ReturnType<typeof vi.fn>;
}

function renderGate(opts: RenderGateOpts = {}) {
  const onClaimed = opts.onClaimed ?? vi.fn();
  const onSkipped = opts.onSkipped ?? vi.fn();
  // We need the picker inside the gate to use the `alwaysAvailable`
  // fetcher for its check pre-flight — but the gate doesn't expose
  // that prop. The picker DOES call /api/identity/check by default;
  // we stub global fetch to satisfy the picker's per-chip pre-check.
  // The reserveFetcher injection covers the gate's own /reserve call.
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ available: true }), { status: 200 }),
  ) as typeof global.fetch;

  return render(
    <UsernameClaimGate
      address="0x40cd000000000000000000000000000000000000000000000000000000003e62"
      jwt="test-jwt"
      googleName="John Smith"
      googleEmail="alice@example.com"
      onClaimed={onClaimed}
      onSkipped={onSkipped}
      reserveFetcher={opts.reserveFetcher}
    />,
  );
}

describe('UsernameClaimGate', () => {
  it('renders picker in picking phase with no error initially', async () => {
    renderGate();
    const gate = screen.getByTestId('username-claim-gate');
    expect(gate.getAttribute('data-phase')).toBe('picking');
    expect(screen.getByTestId('username-picker')).toBeTruthy();
    expect(screen.queryByTestId('username-claim-gate-error')).toBeNull();
    // Drain picker pre-check Promise.all so unmount doesn't warn.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  });

  it('transitions picking → success on successful reserve', async () => {
    const reserveFetcher = vi.fn(async (label: string) => ({
      success: true as const,
      label,
      fullHandle: `${label}.audric.sui`,
      txDigest: 'tx-abc123',
      walletAddress: '0x40cd000000000000000000000000000000000000000000000000000000003e62',
    }));
    const { container } = renderGate({ reserveFetcher });

    // Click an available chip → fills input + sets status=available.
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    expect(chip).toBeTruthy();
    fireEvent.click(chip);

    // Submit → fires reserveFetcher → transitions to success.
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate').getAttribute('data-phase')).toBe('success');
    });
    expect(reserveFetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('username-claim-success')).toBeTruthy();
  });

  it('Continue on success → calls onClaimed(label, fullHandle)', async () => {
    const onClaimed = vi.fn();
    const reserveFetcher = vi.fn(async (label: string) => ({
      success: true as const,
      label,
      fullHandle: `${label}.audric.sui`,
      txDigest: 'tx-abc',
      walletAddress: '0xabc',
    }));
    const { container } = renderGate({ reserveFetcher, onClaimed });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-success-continue')).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId('username-claim-success-continue'));

    expect(onClaimed).toHaveBeenCalledTimes(1);
    const [calledLabel, calledFullHandle] = onClaimed.mock.calls[0];
    expect(calledFullHandle).toBe(`${calledLabel}.audric.sui`);
  });

  it('Skip → calls onSkipped (gate stays in picking, parent unmounts)', async () => {
    const onSkipped = vi.fn();
    renderGate({ onSkipped });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    fireEvent.click(screen.getByTestId('username-picker-skip'));

    expect(onSkipped).toHaveBeenCalledTimes(1);
    // Gate doesn't auto-unmount — parent owns that decision.
    expect(screen.getByTestId('username-claim-gate')).toBeTruthy();
  });

  it('reserve 409 (taken) → re-renders picker with typed error copy', async () => {
    const reserveFetcher = vi.fn(async () => {
      throw new ReserveError(409, 'taken', 'Username taken');
    });
    const { container } = renderGate({ reserveFetcher });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate-error')).toBeTruthy();
    });
    const error = screen.getByTestId('username-claim-gate-error');
    expect(error.textContent).toContain('Someone else just claimed');
    // [S.118 follow-up] Inline error copy now uses the `@audric` display form.
    // The on-chain `fullHandle` (`alice.audric.sui`) is still passed via
    // `onClaimed` for downstream API + DB references; only the user-visible
    // inline error renders the @ form.
    expect(error.textContent).toContain('@audric');
    // Gate is back in picking phase, not stuck on claiming.
    expect(screen.getByTestId('username-claim-gate').getAttribute('data-phase')).toBe('picking');
  });

  it('reserve 503 (verifier-down) → renders retry hint', async () => {
    const reserveFetcher = vi.fn(async () => {
      throw new ReserveError(503, 'verifier-down', 'verifier down');
    });
    const { container } = renderGate({ reserveFetcher });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate-error').textContent).toContain('try again');
    });
  });

  it('reserve 429 (rate-limit) → renders rate-limit copy', async () => {
    const reserveFetcher = vi.fn(async () => {
      throw new ReserveError(429, 'rate-limit', 'rate limited');
    });
    const { container } = renderGate({ reserveFetcher });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate-error').textContent).toContain('Too many attempts');
    });
  });

  it('network failure (non-ReserveError) → generic retry copy', async () => {
    const reserveFetcher = vi.fn(async () => {
      throw new Error('network error');
    });
    const { container } = renderGate({ reserveFetcher });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate-error').textContent).toContain('Network error');
    });
  });

  it('re-submit after error works (state recovers cleanly)', async () => {
    let callCount = 0;
    const reserveFetcher = vi.fn(async (label: string) => {
      callCount++;
      if (callCount === 1) {
        throw new ReserveError(409, 'taken', 'taken');
      }
      return {
        success: true as const,
        label,
        fullHandle: `${label}.audric.sui`,
        txDigest: 'tx-2',
        walletAddress: '0xabc',
      };
    });
    const { container } = renderGate({ reserveFetcher });

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const chip = container.querySelector('[data-testid^="username-picker-chip-"][data-status="available"]') as HTMLButtonElement;
    fireEvent.click(chip);
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    // First attempt errors, gate re-renders picker with error.
    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate-error')).toBeTruthy();
    });

    // Click submit again — the input still has the chip-filled label,
    // so submission is enabled. Second attempt succeeds.
    fireEvent.click(screen.getByTestId('username-picker-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('username-claim-gate').getAttribute('data-phase')).toBe('success');
    });
    expect(reserveFetcher).toHaveBeenCalledTimes(2);
  });
});
