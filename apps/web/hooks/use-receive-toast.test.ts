import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReceiveToast } from './useReceiveToast';

// Spy-able toast surface. We mock the whole Toast module so the hook can
// import `useToast()` without dragging the ToastProvider into the test
// renderer (and so we can assert the exact richToast() call shape).
const richToastSpy = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    richToast: richToastSpy,
  }),
}));

beforeEach(() => {
  richToastSpy.mockClear();
});

function makeRef(initial = 0) {
  return { current: initial };
}

describe('useReceiveToast — first-load suppression', () => {
  it('does not toast on the initial undefined → first-value transition', () => {
    const ref = makeRef();
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: undefined as number | undefined } },
    );

    rerender({ usdc: 100 });
    expect(richToastSpy).not.toHaveBeenCalled();
  });

  it('does not toast when usdc stays undefined (balance still loading)', () => {
    const ref = makeRef();
    renderHook(() =>
      useReceiveToast({ usdc: undefined, lastUserActionAtRef: ref }),
    );
    expect(richToastSpy).not.toHaveBeenCalled();
  });
});

describe('useReceiveToast — delta detection', () => {
  it('fires a toast when USDC increases by ≥ 1¢', () => {
    const ref = makeRef();
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 100 as number | undefined } },
    );

    // First poll establishes baseline; second poll detects delta.
    rerender({ usdc: 105 });

    expect(richToastSpy).toHaveBeenCalledTimes(1);
    const call = richToastSpy.mock.calls[0]?.[0] as {
      title?: string;
      message: string;
      variant?: string;
    };
    expect(call.title).toBe('Received');
    expect(call.message).toContain('+5.00 USDC');
    expect(call.variant).toBe('success');
  });

  it('does not toast when USDC decreases (the user spent / sent)', () => {
    const ref = makeRef();
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 100 as number | undefined } },
    );

    rerender({ usdc: 90 });
    expect(richToastSpy).not.toHaveBeenCalled();
  });

  it('does not toast for sub-1¢ noise (rounding flicker between polls)', () => {
    const ref = makeRef();
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 100.001 as number | undefined } },
    );

    rerender({ usdc: 100.005 }); // delta = 0.004 < 0.01 threshold
    expect(richToastSpy).not.toHaveBeenCalled();
  });
});

describe('useReceiveToast — user-action grace window', () => {
  it('suppresses toast when within 60s of a user-initiated tx', () => {
    const ref = makeRef(Date.now()); // user just acted
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 100 as number | undefined } },
    );

    // Withdrew $5 from savings → USDC went up but it was the user's action.
    rerender({ usdc: 105 });
    expect(richToastSpy).not.toHaveBeenCalled();
  });

  it('fires toast when last user action was > 60s ago', () => {
    const ref = makeRef(Date.now() - 90_000); // 90 seconds ago — outside grace
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 100 as number | undefined } },
    );

    rerender({ usdc: 110 });
    expect(richToastSpy).toHaveBeenCalledTimes(1);
  });

  it('fires toast when the user has never acted in this session (ref still 0)', () => {
    const ref = makeRef(0);
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 50 as number | undefined } },
    );

    rerender({ usdc: 75 });
    expect(richToastSpy).toHaveBeenCalledTimes(1);
  });
});

describe('useReceiveToast — multiple sequential receives', () => {
  it('fires once per delta, not once per render', () => {
    const ref = makeRef();
    const { rerender } = renderHook(
      ({ usdc }: { usdc: number | undefined }) =>
        useReceiveToast({ usdc, lastUserActionAtRef: ref }),
      { initialProps: { usdc: 100 as number | undefined } },
    );

    // Repeated identical re-renders shouldn't fire — only state changes do.
    rerender({ usdc: 100 });
    rerender({ usdc: 100 });
    expect(richToastSpy).not.toHaveBeenCalled();

    rerender({ usdc: 110 }); // first receive
    expect(richToastSpy).toHaveBeenCalledTimes(1);

    rerender({ usdc: 110 }); // no-op render
    expect(richToastSpy).toHaveBeenCalledTimes(1);

    rerender({ usdc: 115 }); // second receive
    expect(richToastSpy).toHaveBeenCalledTimes(2);
  });
});
