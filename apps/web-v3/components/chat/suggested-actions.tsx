"use client";

import { motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type Dispatch, memo, type SetStateAction } from "react";
import { suggestions } from "@/lib/constants";
import { Suggestion } from "../ai-elements/suggestion";

type SuggestedActionsProps = {
  setInput: Dispatch<SetStateAction<string>>;
  isAuthed?: boolean;
};

function PureSuggestedActions({ setInput, isAuthed }: SuggestedActionsProps) {
  const suggestedActions = suggestions;
  const router = useRouter();

  return (
    <div className="flex w-full flex-col gap-2">
      <div
        className="flex w-full gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible"
        data-testid="suggested-actions"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          msOverflowStyle: "none",
        }}
      >
        {suggestedActions.map((suggestedAction, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="min-w-[160px] shrink-0 sm:min-w-0 sm:shrink"
            exit={{ opacity: 0, y: 16 }}
            initial={{ opacity: 0, y: 16 }}
            key={suggestedAction}
            transition={{
              delay: 0.06 * index,
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <Suggestion
              className="h-auto w-full whitespace-nowrap rounded-xl border border-border/50 bg-card/30 px-4 py-3 text-left text-[12px] leading-relaxed text-muted-foreground transition-all duration-200 sm:whitespace-normal sm:p-4 sm:text-[13px] hover:-translate-y-0.5 hover:bg-card/60 hover:text-foreground hover:shadow-[var(--shadow-card)]"
              onClick={(suggestion) => {
                // Prefill-only (CHIP_REVIEW_3): inject into the composer + focus
                // so the user adds params before sending. Never auto-send.
                setInput(suggestion);
                document
                  .querySelector<HTMLTextAreaElement>(
                    "[data-testid='multimodal-input']"
                  )
                  ?.focus();
              }}
              suggestion={suggestedAction}
            >
              {suggestedAction}
            </Suggestion>
          </motion.div>
        ))}
      </div>
      {isAuthed && (
        <button
          className="flex items-center justify-center gap-1.5 self-center rounded-full px-3 py-1 text-[12px] text-muted-foreground/70 transition-colors hover:text-foreground"
          onClick={() => router.push("/recipes")}
          type="button"
        >
          <SparklesIcon className="size-3.5" />
          Explore Recipes
        </button>
      )}
    </div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);
