"use client";

import { useState } from "react";

// Copy-to-clipboard affordance (§II.13.A "prompt-first onboarding") — every
// shape is an ag-btn so buttons stay consistent store-wide. Default is the
// small ghost chip (command blocks); `full` is the block-level prompt
// button; `className` overrides for one-off placements (e.g. 40px rows).
export function CopyButton({
  text,
  label = "Copy",
  full = false,
  className,
}: {
  text: string;
  label?: string;
  full?: boolean;
  className?: string;
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
        className={
          className ?? "ag-btn ag-btn--ghost h-auto w-full whitespace-normal py-2.5"
        }
        onClick={onCopy}
        type="button"
      >
        {copied ? "Copied — paste it into your agent" : label}
      </button>
    );
  }

  return (
    <button
      className={className ?? "ag-btn ag-btn--ghost ag-btn--sm shrink-0"}
      onClick={onCopy}
      type="button"
    >
      {copied ? "Copied" : label}
    </button>
  );
}
