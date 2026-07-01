"use client";

import { AnimatePresence, motion } from "framer-motion";
import { LockIcon } from "lucide-react";
import { useEffect, useState } from "react";

// Minimal, Perplexity-style wordmark hero. Mode-aware: the empty state re-titles
// itself when the composer's Confidential toggle flips (a polished mode switch,
// like Perplexity's "perplexity" → "perplexity computer").
export const Greeting = () => {
  const [confidential, setConfidential] = useState(false);
  useEffect(() => {
    const read = () =>
      setConfidential(
        window.localStorage.getItem("audric-confidential") === "1"
      );
    read();
    window.addEventListener("audric-confidential-change", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("audric-confidential-change", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  return (
    <div
      className="flex h-[92px] flex-col items-center justify-start px-4 text-center"
      key="overview"
    >
      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          initial={{ opacity: 0, y: 8 }}
          key={confidential ? "confidential" : "default"}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {confidential ? (
            <>
              <div className="flex items-center justify-center gap-2 font-semibold text-2xl tracking-tight md:text-3xl">
                <LockIcon className="size-6 text-emerald-500" />
                <span>
                  audric{" "}
                  <span className="font-normal text-emerald-500">
                    confidential
                  </span>
                </span>
              </div>
              <div className="mt-3 text-muted-foreground/80 text-sm">
                Sealed in a GPU-TEE — provably private, verifiable on Sui.
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold text-3xl text-foreground tracking-tight md:text-4xl">
                audric
              </div>
              <div className="mt-3 text-muted-foreground/80 text-sm">
                What can I help with?
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
