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
    label: "Create a video prompt",
    starterPrompt:
      "Help me make a video. Suggest one vivid, cinematic scene idea (visuals only — no on-screen text or logos), then generate a short clip of it.",
  },
  {
    label: "Check my balance",
    starterPrompt: "What's in my Passport wallet right now? Show my balances.",
    authed: true,
  },
];

/** Cycling composer placeholder examples (Venice-style) — capabilities first,
 * then concrete one-tap-worthy prompts spanning chat / web / media / crypto /
 * wallet. Visual hints only (rotated in the textarea placeholder). */
export const composerPlaceholders: string[] = [
  "Ask me anything privately",
  "Search the web for current info",
  "Generate images from descriptions",
  "Create flowcharts or diagrams",
  "Analyze documents and PDFs",
  "Generate or animate videos",
  "Edit or upscale your images",
  "What are the trending AI crypto projects?",
  "Make a video of a calm ocean wave at sunset",
  "Research NVDA — fundamentals, ratings and recent news",
  "New tokens on Solana",
  "Top crypto gainers this week",
  "Show me ETH's price over the last 30 days",
  "What's the crypto Fear & Greed index right now?",
  "Send USDC to a friend — free and instant",
  "What's in my Passport wallet?",
];

/** Concrete example prompts for the static login/preview pane. */
export const examplePrompts = [
  "What happened in AI this week?",
  "Generate a logo for a coffee roaster",
  "Draft a launch tweet for a privacy-first AI app, plus 3 variations",
  "Compare the leading open LLMs right now",
];
