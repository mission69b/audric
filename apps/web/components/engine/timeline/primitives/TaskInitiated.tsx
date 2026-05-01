'use client';

// ───────────────────────────────────────────────────────────────────────────
// SPEC 8 v0.5.1 B3.5 — TaskInitiated divider (audit Gap C)
//
// Em-rule both sides + "TASK INITIATED" mono label. Rendered ONCE at
// the top of an assistant message's timeline so the user gets the
// "Audric just started a turn" beat from the v2 demo without a noisy
// avatar reveal. Pure visual primitive — no state, no props beyond a
// custom label override (used for the "RESUMED" beat in the future).
// ───────────────────────────────────────────────────────────────────────────

interface TaskInitiatedProps {
  /** Override the default "TASK INITIATED" label. Spec reserves "RESUMED"
   *  for the post-confirm continuation but we don't emit it yet. */
  label?: string;
}

export function TaskInitiated({ label = 'TASK INITIATED' }: TaskInitiatedProps) {
  return (
    <div
      className="flex items-center gap-3 my-1.5"
      role="separator"
      aria-label={label}
    >
      <div className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
      <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-fg-muted">
        {label}
      </span>
      <div className="flex-1 h-px bg-border-subtle" aria-hidden="true" />
    </div>
  );
}
