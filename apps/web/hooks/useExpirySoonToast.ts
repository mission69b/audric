'use client';

import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { useZkLogin } from '@/components/auth/useZkLogin';

let toastShown = false;

/**
 * [S.125 Tier 4.2] Proactive expiry warning toast.
 *
 * `useZkLogin` exposes `expiringSoon: boolean` — true when the current
 * zkLogin session expires within ~24h (Sui zkLogin sessions max ~7 days,
 * so this is the natural one-day-notice window).
 *
 * When the flag flips false → true, fire a single toast offering the user
 * a one-tap `Refresh now` action that triggers `useZkLogin.refresh()`
 * (logout + Google OAuth replay).
 *
 * Modeled on `useVersionCheck` — same module-level `toastShown` idempotency,
 * same `richToast` surface, same minimal "give the user the choice, don't
 * surprise them" stance. The fire-once contract is intentional: if the user
 * dismisses the toast, the only way to see it again is a full page reload
 * (matches the no-nag posture used everywhere else in the dashboard).
 *
 * Why this isn't a banner:
 * - The simplification spec (dashboard-content.tsx line 53–54) bans
 *   persistent banners. Toasts are the canonical proactive surface — see
 *   `useReceiveToast` (payment-received) and `useVersionCheck` (new build)
 *   for prior art with the same posture.
 *
 * Why this doesn't try to handle `status === 'expired'`:
 * - `AuthGuard` redirects to `/` immediately on `status === 'expired'`,
 *   so the dashboard never renders in that state. The "Sign back in"
 *   button on bundle receipts (Tier 4.1, S.123) covers the rare race
 *   where expiry happens mid-turn. This hook is purely for the
 *   pre-expiry heads-up window.
 */
export function useExpirySoonToast() {
  const { richToast } = useToast();
  const { expiringSoon, refresh, status } = useZkLogin();

  useEffect(() => {
    if (toastShown) return;
    if (status !== 'authenticated') return;
    if (!expiringSoon) return;

    toastShown = true;
    richToast({
      title: 'Session expiring soon',
      message: "Your sign-in session expires within a day. Refresh now to keep things smooth — your work is saved.",
      variant: 'warning',
      duration: 60_000,
      actions: [
        {
          label: 'Refresh now',
          variant: 'primary',
          onClick: () => {
            void refresh();
          },
        },
      ],
    });
  }, [expiringSoon, status, richToast, refresh]);
}
