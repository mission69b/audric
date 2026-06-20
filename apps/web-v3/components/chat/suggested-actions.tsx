"use client";

import { motion } from "framer-motion";
import { ChevronDownIcon } from "lucide-react";
import { type Dispatch, memo, type SetStateAction, useState } from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { chipCategories } from "@/lib/constants";
import { cn } from "@/lib/utils";

type SuggestedActionsProps = {
  setInput: Dispatch<SetStateAction<string>>;
};

// Category chips on the empty state. Clicking a category opens a POPOVER (a
// portaled overlay — it floats over the page and does NOT reflow the composer)
// listing concrete Simple/Advanced example prompts that showcase what Audric can
// do. Prefill-only: clicking an example injects it into the composer + focuses,
// never auto-sends, so the user can edit before sending.
function PureSuggestedActions({ setInput }: SuggestedActionsProps) {
  const { status } = useZkLogin();
  const isAuthed = status === "authenticated";
  const [open, setOpen] = useState<string | null>(null);

  const categories = chipCategories.filter((c) => !c.authed || isAuthed);

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
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="suggested-actions"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.35, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {categories.map((cat) => (
        <Popover
          key={cat.label}
          onOpenChange={(o) => setOpen(o ? cat.label : null)}
          open={open === cat.label}
        >
          <PopoverTrigger asChild>
            <button
              className={cn(
                "flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
                open === cat.label
                  ? "border-foreground/40 bg-accent text-foreground"
                  : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
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
          </PopoverTrigger>
          <PopoverContent align="center" className="w-80 p-1.5" side="top">
            <div className="flex flex-col gap-1">
              {cat.examples.map((ex) => (
                <button
                  className="flex items-start gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
            </div>
          </PopoverContent>
        </Popover>
      ))}
    </motion.div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);
