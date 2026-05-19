"use client";

/**
 * ChipBar — horizontal pill row sitting below the composer.
 *
 * Tap a chip → composer fills with the canonical prompt + focuses the
 * input. NO drawers, NO sub-actions, NO custom UI. The user reads the
 * sentence, edits if they want, hits Enter — and the agent handles
 * everything from there.
 *
 * See `lib/chip-configs.ts` for the locked 7-chip set + the
 * architectural decision behind injection-only chips (CHIP_REVIEW_3).
 */

import { CHIP_CONFIGS } from "@/lib/chip-configs";

interface ChipBarProps {
  /** Hide the bar entirely when truthy — used to hide it during a
   *  streaming turn so it doesn't compete with the agent's output. */
  hidden?: boolean;
  /** Fired with the canonical prompt when a chip is tapped. */
  onChipClick: (prompt: string) => void;
}

export function ChipBar({ onChipClick, hidden }: ChipBarProps) {
  if (hidden) {
    return null;
  }

  return (
    <div
      aria-label="Quick prompts"
      className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 px-2 pb-3 md:px-4 md:pb-4"
      role="toolbar"
    >
      {CHIP_CONFIGS.map((chip) => (
        <button
          aria-label={`Insert prompt: ${chip.prompt}`}
          className="rounded-full border border-border/60 bg-card px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/80 transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          key={chip.id}
          onClick={() => onChipClick(chip.prompt)}
          type="button"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
