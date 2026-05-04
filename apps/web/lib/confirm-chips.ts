/**
 * Single source of truth for the NEXT_PUBLIC_CONFIRM_CHIPS_V1 flag.
 *
 * [SPEC 15 Phase 2 / 2026-05-04] FRONTEND-RENDER GATE ONLY. The
 * backend (decorator + SSE emission + chip POST handling) shipped
 * unflagged in commit 1 — this flag controls whether
 * `<ConfirmChips />` actually renders below assistant turns whose
 * SSE stream included an `expects_confirm` event.
 *
 * Mirrors `isInteractiveHarnessEnabled()` (`lib/interactive-harness.ts`)
 * — same env-flag-as-string convention so a single value parses
 * identically across both flags.
 */

import { env } from '@/lib/env';

/**
 * Reads the typed `env.NEXT_PUBLIC_CONFIRM_CHIPS_V1` (string |
 * undefined). Returns false on undefined, empty string, or any value
 * other than "1" / "true" (case-insensitive, whitespace-trimmed).
 *
 * Cheap enough to call at render time — no network, no I/O.
 */
export function isConfirmChipsEnabled(): boolean {
  const v = env.NEXT_PUBLIC_CONFIRM_CHIPS_V1;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
