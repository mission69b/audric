"use client";

import type { ReactNode } from "react";

/**
 * CardState — the calm centered notice shared by every read card's
 * feed-down + empty branches.
 *
 * [R6.4 / A6 — 2026-05-30] Built to the phase2 read-failure spec
 * (`t2000-AFI/audric/phase2-read-failures.html` `.down`): a dashed glyph
 * chip, a 13.5px title, a constrained sub, and an optional outline
 * action button. Calm, never alarming — "—" + retry, not red unless
 * truly broken. Goes inside a `CardShell` (which supplies the eyebrow +
 * horizontal padding); the warn affordance lives on the shell's `live`
 * dot / `badge`, not here.
 */
interface CardStateProps {
  action?: { label: string; onClick?: () => void };
  icon?: ReactNode;
  sub?: string;
  title: string;
}

const DEFAULT_ICON = (
  <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16">
    <title>Empty</title>
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export function CardState({ icon, title, sub, action }: CardStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border border-dashed bg-muted text-muted-foreground">
        {icon ?? DEFAULT_ICON}
      </span>
      <span className="font-medium text-[13.5px] text-foreground tracking-[-0.011em]">
        {title}
      </span>
      {sub && (
        <p className="m-0 max-w-[240px] text-[12.5px] text-muted-foreground leading-relaxed tracking-[-0.011em]">
          {sub}
        </p>
      )}
      {action && (
        <button
          className="rounded-md border border-border px-3 py-1.5 font-medium text-[12px] text-foreground transition hover:border-border hover:bg-accent"
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
