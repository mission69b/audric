// ───────────────────────────────────────────────────────────────────────────
// S.84 polish v4 — username-skip flag (extracted)
//
// The localStorage flag the dashboard's claim gate checks to suppress
// itself after a "Skip for now" click. Lived inline in `dashboard-content.tsx`
// originally; pulled out here so Settings → Passport can clear it after a
// re-claim from the safety-valve modal (the previous home-of-the-key
// produced the bug where claiming from Settings left the dashboard's
// skip flag dormant — harmless once `userStatus.username` is set, but
// noisy localStorage residue, and impossible to reason about across
// surfaces without a shared module).
//
// Per-address (not per-device) so signing in on a fresh device gives
// the user one more nudge to claim before the gate respects their skip.
// ───────────────────────────────────────────────────────────────────────────

export function usernameSkipStorageKey(address: string): string {
  return `audric:username-skipped:${address}`;
}

export function isUsernameSkipped(address: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !address) return false;
  return window.localStorage.getItem(usernameSkipStorageKey(address)) === '1';
}

export function setUsernameSkipped(address: string): void {
  if (typeof window === 'undefined' || !address) return;
  window.localStorage.setItem(usernameSkipStorageKey(address), '1');
}

export function clearUsernameSkip(address: string | null | undefined): void {
  if (typeof window === 'undefined' || !address) return;
  window.localStorage.removeItem(usernameSkipStorageKey(address));
}
