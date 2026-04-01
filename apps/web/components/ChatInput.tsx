"use client";

import { useState, useRef, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import type { Chip } from "@/lib/demo-messages";

interface ChatInputProps {
  chips: Chip[];
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ chips, onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  }

  function handleChipClick(chip: Chip) {
    if (disabled) return;
    onSend(chip.prompt);
    setValue("");
    inputRef.current?.focus();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => handleChipClick(chip)}
            disabled={disabled}
            className={cn(
              "rounded-full border border-n-300 bg-n-100 px-3.5 py-1.5",
              "font-mono text-[11px] tracking-wider text-n-700 uppercase",
              "transition-all hover:border-n-400 hover:bg-n-200 hover:shadow-card",
              "disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask Audric anything..."
          disabled={disabled}
          className={cn(
            "flex-1 rounded-xl border border-n-300 bg-n-100 px-4 py-3",
            "text-sm text-n-800 placeholder:text-n-500",
            "outline-none transition-colors",
            "focus:border-n-500",
            "disabled:opacity-50",
          )}
        />
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className={cn(
            "shrink-0 rounded-xl bg-n-900 px-5 py-3",
            "font-mono text-xs tracking-wider text-n-100 uppercase",
            "transition-opacity hover:opacity-80",
            "disabled:opacity-30 disabled:cursor-not-allowed",
          )}
        >
          Send
        </button>
      </form>
    </div>
  );
}
