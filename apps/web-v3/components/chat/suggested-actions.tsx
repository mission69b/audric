"use client";

import { motion } from "framer-motion";
import { ChevronDownIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type Dispatch, memo, type SetStateAction, useState } from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { type ChipCategory, chipCategories } from "@/lib/constants";
import { cn } from "@/lib/utils";

type SuggestedActionsProps = {
  setInput: Dispatch<SetStateAction<string>>;
};

// Category chips on the empty state: click a category → it expands inline to a
// couple of concrete Simple/Advanced example prompts that showcase what Audric
// can do. Prefill-only — clicking an example injects it into the composer +
// focuses (never auto-sends), so the user can edit before sending.
function PureSuggestedActions({ setInput }: SuggestedActionsProps) {
  const router = useRouter();
  const { status } = useZkLogin();
  const isAuthed = status === "authenticated";
  const [open, setOpen] = useState<string | null>(null);

  const categories = chipCategories.filter((c) => !c.authed || isAuthed);
  const active: ChipCategory | undefined = categories.find(
    (c) => c.label === open
  );

  const focusComposer = () =>
    document
      .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
      ?.focus();

  const choose = (prompt: string) => {
    setInput(prompt);
    setOpen(null);
    focusComposer();
  };

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full max-w-2xl flex-col items-center gap-3"
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
        {isAuthed && (
          <button
            className="flex items-center gap-1.5 rounded-full border border-border/60 px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => router.push("/recipes")}
            type="button"
          >
            <SparklesIcon className="size-3.5" />
            Recipes
          </button>
        )}
      </div>

      {active && (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="flex w-full flex-col gap-1.5"
          initial={{ opacity: 0, y: -4 }}
          key={active.label}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {active.examples.map((ex) => (
            <button
              className="flex items-start gap-2 rounded-xl border border-border/40 bg-card/30 px-3.5 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:border-border/70 hover:bg-card/60 hover:text-foreground"
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
    </motion.div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);
