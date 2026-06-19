"use client";

import { motion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { type Dispatch, memo, type SetStateAction } from "react";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { suggestions } from "@/lib/constants";
import { Suggestion } from "../ai-elements/suggestion";

type SuggestedActionsProps = {
  setInput: Dispatch<SetStateAction<string>>;
};

// Compact ChatGPT-style suggestion pills, rendered BELOW the composer on the
// empty state. Prefill-only (CHIP_REVIEW_3): clicking injects into the composer
// + focuses; never auto-sends.
function PureSuggestedActions({ setInput }: SuggestedActionsProps) {
  const router = useRouter();
  const { status } = useZkLogin();
  const isAuthed = status === "authenticated";

  const focusComposer = () =>
    document
      .querySelector<HTMLTextAreaElement>("[data-testid='multimodal-input']")
      ?.focus();

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-center gap-2"
      data-testid="suggested-actions"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.35, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {suggestions.map((suggestedAction) => (
        <Suggestion
          className="rounded-full border border-border/60 bg-transparent px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          key={suggestedAction}
          onClick={(suggestion) => {
            setInput(suggestion);
            focusComposer();
          }}
          suggestion={suggestedAction}
        >
          {suggestedAction}
        </Suggestion>
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
    </motion.div>
  );
}

export const SuggestedActions = memo(PureSuggestedActions);
