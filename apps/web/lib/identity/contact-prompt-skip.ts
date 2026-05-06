// ───────────────────────────────────────────────────────────────────────────
// B4 polish (Audric UX Polish backlog) — contact-prompt skip flag
//
// Per-address localStorage flag that suppresses the post-send ContactToast
// when the user has already explicitly Skipped saving this same recipient
// before. Without this, paying an exchange / hardware wallet / one-off
// service address re-prompts on every single send forever — high-friction,
// low-utility nag.
//
// Mirrors the `username-skip.ts` shape from S.84 polish v4. Same posture:
// per-address (not per-device) so the user gets a fresh prompt on a new
// device — small re-engagement bonus, and they may want to save the
// contact from this device even if they Skipped on another.
//
// Important: only EXPLICIT Skip clicks set the flag. The 8s auto-dismiss
// timer does NOT — that's "user looked away," not "user said no."
// Distinguishing these is the whole point of the new ContactToast.onSkip
// callback that paired with this module.
// ───────────────────────────────────────────────────────────────────────────

export function contactPromptSkipKey(address: string): string {
  return `audric:contact-prompt-skipped:${address}`;
}

export function isContactPromptSkipped(address: string | null | undefined): boolean {
  if (typeof window === 'undefined' || !address) return false;
  return window.localStorage.getItem(contactPromptSkipKey(address)) === '1';
}

export function setContactPromptSkipped(address: string): void {
  if (typeof window === 'undefined' || !address) return;
  window.localStorage.setItem(contactPromptSkipKey(address), '1');
}

export function clearContactPromptSkip(address: string | null | undefined): void {
  if (typeof window === 'undefined' || !address) return;
  window.localStorage.removeItem(contactPromptSkipKey(address));
}
