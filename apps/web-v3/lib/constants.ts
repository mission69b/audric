export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// Composer chips — CATEGORY chips that expand to concrete Simple/Advanced
// example prompts (prefill-only: clicking an example injects it into the
// composer, never auto-sends, so the user edits first). Showcases Audric's
// breadth — research, create, image, compare, and (signed-in) the wallet —
// instead of three generic verbs. `authed` categories are wallet/money, shown
// only when signed in.
export type ChipExample = { tier: "Simple" | "Advanced"; prompt: string };
export type ChipCategory = {
  label: string;
  authed?: boolean;
  examples: ChipExample[];
};

export const chipCategories: ChipCategory[] = [
  {
    label: "Research",
    examples: [
      { tier: "Simple", prompt: "What happened in AI this week?" },
      {
        tier: "Advanced",
        prompt:
          "Research the AI code assistant market and recommend a positioning, with sources",
      },
    ],
  },
  {
    label: "Compare",
    examples: [
      { tier: "Simple", prompt: "Compare the leading open LLMs right now" },
      {
        tier: "Advanced",
        prompt:
          "Compare the top open-source vector databases for RAG across performance, scaling, and licensing — with sources",
      },
    ],
  },
  {
    label: "Create",
    examples: [
      { tier: "Simple", prompt: "Write a haiku about the sea" },
      {
        tier: "Advanced",
        prompt:
          "Draft a launch tweet for a privacy-first AI app, plus 3 variations",
      },
    ],
  },
  {
    label: "Image",
    examples: [
      { tier: "Simple", prompt: "Generate a logo for a coffee roaster" },
      {
        tier: "Advanced",
        prompt:
          "Design a minimalist app icon: a shield with a spark, dark theme",
      },
    ],
  },
  {
    label: "Money",
    authed: true,
    examples: [
      { tier: "Simple", prompt: "What's my Passport balance?" },
      { tier: "Advanced", prompt: "Send 5 USDC to a friend" },
    ],
  },
];

/** Flat list of example prompts (for the simple static preview pane). */
export const examplePrompts = chipCategories.flatMap((c) =>
  c.examples.map((e) => e.prompt)
);
