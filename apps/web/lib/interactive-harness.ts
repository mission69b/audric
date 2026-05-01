// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 — Interactive Harness flag helper (B2.2)
//
// Single source of truth for the NEXT_PUBLIC_INTERACTIVE_HARNESS flag.
// Returns true when the env var is set to "1" or "true" (case-insensitive),
// false otherwise.
//
// Per-session pinning lands in B3 — see SPEC 8 § "(G4) `harnessVersion`
// storage" — at which point this helper accepts a session arg and reads
// from the Upstash session record. For B2 we use a global flag for the
// staged 10% → 50% → 100% rollout.
//
// Default OFF means new code paths are dormant in production until the
// founder explicitly flips the Vercel env var.
// ───────────────────────────────────────────────────────────────────────────

import { env } from './env';

/**
 * True when the new ReasoningTimeline UX is enabled.
 *
 * Reads the typed `env.NEXT_PUBLIC_INTERACTIVE_HARNESS` (string |
 * undefined). Returns false on undefined, empty string, or any value
 * other than "1" / "true".
 */
export function isInteractiveHarnessEnabled(): boolean {
  const v = env.NEXT_PUBLIC_INTERACTIVE_HARNESS;
  if (!v) return false;
  const normalized = v.trim().toLowerCase();
  return normalized === '1' || normalized === 'true';
}
