"use client";

import { motion } from "framer-motion";
import { memo } from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { starterChips } from "@/lib/constants";

type SuggestedActionsProps = {
  // Auto-send the chip's starter prompt (Venice-style) — a bare intent triggers
  // the agent's clarifying question, then it proceeds.
  onSend: (text: string) => void;
};

function PureSuggestedActions({ onSend }: SuggestedActionsProps) {
  const { status } = useZkLogin();
  const isAuthed = status === "authenticated";
  const chips = starterChips.filter((c) => !c.authed || isAuthed);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="suggested-actions"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.35, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {chips.map((chip) => (
        <button
          className="rounded-full border border-border/60 px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          key={chip.label}
          onClick={() => onSend(chip.starterPrompt)}
          type="button"
        >
          {chip.label}
        </button>
      ))}
    </motion.div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);
