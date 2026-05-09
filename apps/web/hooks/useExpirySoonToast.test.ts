/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExpirySoonToast } from './useExpirySoonToast';

const richToastSpy = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    richToast: richToastSpy,
  }),
}));

const refreshSpy = vi.fn();
let mockZkLogin = {
  status: 'authenticated' as 'loading' | 'unauthenticated' | 'redirecting' | 'proving' | 'authenticated' | 'expired',
  expiringSoon: false,
  refresh: refreshSpy,
};

vi.mock('@/components/auth/useZkLogin', () => ({
  useZkLogin: () => mockZkLogin,
}));

// Reset module-level toastShown between tests by re-importing fresh.
async function freshHook() {
  vi.resetModules();
  const mod = await import('./useExpirySoonToast');
  return mod.useExpirySoonToast;
}

beforeEach(() => {
  richToastSpy.mockClear();
  refreshSpy.mockClear();
  mockZkLogin = {
    status: 'authenticated',
    expiringSoon: false,
    refresh: refreshSpy,
  };
});

describe('useExpirySoonToast', () => {
  it('does not fire when expiringSoon is false', async () => {
    const hook = await freshHook();
    renderHook(() => hook());
    expect(richToastSpy).not.toHaveBeenCalled();
  });

  it('does not fire when status is not authenticated (e.g. loading)', async () => {
    const hook = await freshHook();
    mockZkLogin = { status: 'loading', expiringSoon: true, refresh: refreshSpy };
    renderHook(() => hook());
    expect(richToastSpy).not.toHaveBeenCalled();
  });

  it('does not fire when status is unauthenticated even with expiringSoon (defensive)', async () => {
    const hook = await freshHook();
    mockZkLogin = { status: 'unauthenticated', expiringSoon: true, refresh: refreshSpy };
    renderHook(() => hook());
    expect(richToastSpy).not.toHaveBeenCalled();
  });

  it('fires once with the warning variant + Refresh now action when expiringSoon is true', async () => {
    const hook = await freshHook();
    mockZkLogin = { status: 'authenticated', expiringSoon: true, refresh: refreshSpy };

    renderHook(() => hook());

    expect(richToastSpy).toHaveBeenCalledTimes(1);
    const call = richToastSpy.mock.calls[0]?.[0] as {
      title?: string;
      message?: string;
      variant?: string;
      duration?: number;
      actions?: Array<{ label: string; variant?: string; onClick: () => void }>;
    };
    expect(call.title).toBe('Session expiring soon');
    expect(call.variant).toBe('warning');
    expect(call.duration).toBe(60_000);
    expect(call.actions).toHaveLength(1);
    expect(call.actions?.[0]?.label).toBe('Refresh now');
    expect(call.actions?.[0]?.variant).toBe('primary');
  });

  it('action button calls useZkLogin.refresh() exactly once when invoked', async () => {
    const hook = await freshHook();
    mockZkLogin = { status: 'authenticated', expiringSoon: true, refresh: refreshSpy };

    renderHook(() => hook());

    const action = (richToastSpy.mock.calls[0]?.[0] as {
      actions?: Array<{ onClick: () => void }>;
    }).actions?.[0];
    expect(action).toBeDefined();

    action?.onClick();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('module-level toastShown idempotency — fires once across multiple mounts in same module instance', async () => {
    const hook = await freshHook();
    mockZkLogin = { status: 'authenticated', expiringSoon: true, refresh: refreshSpy };

    const a = renderHook(() => hook());
    const b = renderHook(() => hook());
    a.unmount();
    b.unmount();

    expect(richToastSpy).toHaveBeenCalledTimes(1);
  });
});
