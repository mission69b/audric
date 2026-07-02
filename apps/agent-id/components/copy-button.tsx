"use client";

import { useState } from "react";

// Minimal copy-to-clipboard affordance (§II.13.A "prompt-first onboarding").
// Two shapes: the small inline chip for command blocks, and a full-width
// variant for the copy-prompt block.
export function CopyButton({
  text,
  label = "Copy",
  full = false,
}: {
  text: string;
  label?: string;
  full?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions/http) — leave the button as-is;
      // the text is selectable either way.
    }
  };

  if (full) {
    return (
      <button
        className="w-full rounded-xl border border-border/60 bg-secondary px-4 py-2.5 font-medium text-secondary-foreground text-sm transition-colors hover:bg-secondary/80"
        onClick={onCopy}
        type="button"
      >
        {copied ? "Copied — paste it into your agent" : label}
      </button>
    );
  }

  return (
    <button
      className="shrink-0 rounded-lg border border-border/60 px-2 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-secondary hover:text-secondary-foreground"
      onClick={onCopy}
      type="button"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
