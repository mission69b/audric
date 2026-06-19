"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

// Rotating, privacy/product-forward greetings on the empty state. Fixed height
// avoids layout shift as lines swap.
const GREETINGS: { title: string; subtitle: string }[] = [
  {
    title: "What can I help with?",
    subtitle: "Ask a question, write code, or explore ideas.",
  },
  {
    title: "Private by default.",
    subtitle: "Your prompts aren't training data — yours stay yours.",
  },
  {
    title: "Truly yours.",
    subtitle: "Your wallet, your data, your memory — you own them.",
  },
  {
    title: "Permissionless AI.",
    subtitle: "No seed phrase, no bank, no one who can freeze it.",
  },
];

const ROTATE_MS = 4500;

export const Greeting = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setIndex((prev) => (prev + 1) % GREETINGS.length),
      ROTATE_MS
    );
    return () => clearInterval(id);
  }, []);

  const greeting = GREETINGS[index];

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
          key={index}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="font-semibold text-2xl text-foreground tracking-tight md:text-3xl">
            {greeting.title}
          </div>
          <div className="mt-3 text-muted-foreground/80 text-sm">
            {greeting.subtitle}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
