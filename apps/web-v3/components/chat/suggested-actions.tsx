"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { type Dispatch, memo, type SetStateAction, useState } from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { chipCategories } from "@/lib/constants";
import { cn } from "@/lib/utils";

type SuggestedActionsProps = {
  setInput: Dispatch<SetStateAction<string>>;
};

// Category chips on the empty state. Clicking a category reveals its concrete
// Simple/Advanced example prompts INLINE, in a panel right below the chip row.
// The panel is ABSOLUTELY positioned (out of layout flow), so expanding it never
// reflows the composer above it (the chips row keeps a constant height). Below
// the chips is empty space in the empty state, so the panel overlays nothing.
// Prefill-only: clicking an example injects it into the composer + focuses.
function PureSuggestedActions({ setInput }: SuggestedActionsProps) {
  const { status } = useZkLogin();
  const isAuthed = status === "authenticated";
  const [open, setOpen] = useState<string | null>(null);

  const categories = chipCategories.filter((c) => !c.authed || isAuthed);
  const active = categories.find((c) => c.label === open);

  const choose = (prompt: string) => {
    setInput(prompt);
    setOpen(null);
    document
      .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
      ?.focus();
  };

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="relative flex items-center justify-center"
      data-testid="suggested-actions"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.35, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex flex-wrap items-center justify-center gap-2">
        {categories.map((cat) => (
          <button
            className={cn(
              "flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
              open === cat.label
                ? "border-foreground/40 bg-accent text-foreground"
                : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            key={cat.label}
            onClick={() => setOpen(open === cat.label ? null : cat.label)}
            type="button"
          >
            {cat.label}
            <ChevronDownIcon
              className={cn(
                "size-3 transition-transform",
                open === cat.label && "rotate-180"
              )}
            />
          </button>
        ))}
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="-translate-x-1/2 absolute top-full left-1/2 z-10 mt-2 flex w-[min(92vw,640px)] flex-col gap-1.5"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
            key={active.label}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {active.examples.map((ex) => (
              <button
                className="flex items-start gap-2 rounded-xl border border-border/40 bg-card/60 px-3.5 py-2.5 text-left text-[13px] text-muted-foreground shadow-[var(--shadow-card)] backdrop-blur-sm transition-colors hover:border-border/70 hover:bg-card hover:text-foreground"
                key={ex.prompt}
                onClick={() => choose(ex.prompt)}
                type="button"
              >
                <span className="mt-0.5 shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 font-medium text-[10px] text-foreground/60 uppercase tracking-wide">
                  {ex.tier}
                </span>
                <span className="leading-relaxed">{ex.prompt}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);
