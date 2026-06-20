export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

// Composer chips — flat ACTION chips (Venice-style). Clicking a chip AUTO-SENDS
// its starter prompt; bare-intent starters ("Research a topic", "Generate an
// image") deliberately trigger ONE clarifying question from the agent, then it
// proceeds. `authed` chips are wallet/money, shown only when signed in.
export type StarterChip = {
  label: string;
  /** The message sent on click. Bare intents trigger a clarifying question;
   *  specific ones run immediately. */
  starterPrompt: string;
  authed?: boolean;
};

export const starterChips: StarterChip[] = [
  {
    label: "Generate image",
    starterPrompt: "I'd like to generate an image.",
  },
  {
    label: "Research a topic",
    starterPrompt:
      "I need you to research a topic for me. Use web search to find current, reliable information. Summarize the key findings clearly, cite your sources, and flag any conflicting information or areas where more research might be needed.",
  },
  {
    label: "Surprise me",
    starterPrompt:
      "Tell me something genuinely fascinating that most people don't know about. Pick a topic that's thought-provoking, weird, or challenges common assumptions. Explain why it matters or what makes it interesting.",
  },
  {
    label: "Check my balance",
    starterPrompt: "What's in my Passport wallet right now? Show my balances.",
    authed: true,
  },
];

/** Concrete example prompts for the static login/preview pane. */
export const examplePrompts = [
  "What happened in AI this week?",
  "Generate a logo for a coffee roaster",
  "Draft a launch tweet for a privacy-first AI app, plus 3 variations",
  "Compare the leading open LLMs right now",
];
