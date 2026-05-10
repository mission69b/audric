/**
 * Single source of truth for the NEXT_PUBLIC_HARNESS_TRANSITIONS_V1 flag.
 *
 * [SPEC 21.1 / 2026-05-10] FRONTEND-RENDER GATE ONLY. The backend
 * (engine `withStreamState` + audric SSE serialization + audric
 * sponsor-flow state injection) ships unconditionally — this flag
 * controls whether `<TransitionChip>` actually renders the animated
 * routing → quoting → confirming → settling → done choreography on the
 * assistant message.
 *
 * Per SPEC 21 D-3 (b) lock = staged rollout — engine deploys + audric
 * deploys are decoupled; founder enables this flag once both are live
 * and a smoke test confirms the chip rendering works end-to-end.
 *
 * Mirrors `isConfirmChipsEnabled` shape so a single value parses
 * identically across all the v1 rollout flags.
 */

import { env } from '@/lib/env';

/**
 * Reads the typed `env.NEXT_PUBLIC_HARNESS_TRANSITIONS_V1` (string |
 * undefined). Returns false on undefined, empty string, or any value
 * other than "1" / "true" (case-insensitive, whitespace-trimmed).
 *
 * Cheap enough to call at render time — no network, no I/O.
 */
export function isTransitionChipEnabled(): boolean {
  const v = env.NEXT_PUBLIC_HARNESS_TRANSITIONS_V1;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
