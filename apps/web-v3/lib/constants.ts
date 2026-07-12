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

/** Confidential-mode starter chips — a pure in-TEE completion (no image/web/
 * video/wallet), so themed for private document + drafting work. */
export const confidentialChips: StarterChip[] = [
  {
    label: "Analyze a PDF",
    starterPrompt:
      "I'll paste a document (PDF or text) — analyze it privately and pull out the key points and anything I should watch for.",
  },
  {
    label: "Review a term sheet",
    starterPrompt:
      "Review a term sheet or contract I'll paste. Summarize it in plain English and flag the important or unusual clauses.",
  },
  {
    label: "Draft an email",
    starterPrompt:
      "Help me draft an email — ask me the key details, then write it.",
  },
  {
    label: "Explain a concept",
    starterPrompt:
      "Explain a concept to me clearly and simply. I'll tell you the topic.",
  },
];

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
    label: "Create a video",
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
  "Draft an email or a document",
  "Explain a complex topic simply",
  "Summarize a long article or paper",
  "Make a video of a calm ocean wave at sunset",
  "Research a company — fundamentals, news, ratings",
  "Send USDC to a friend — free and instant",
  "What's in my Passport wallet?",
];

/** Placeholders shown when Confidential mode is on — a pure in-TEE completion
 * (no web/tools/images), so themed for private document + drafting work. */
export const confidentialPlaceholders: string[] = [
  "Ask me anything — sealed in a GPU-TEE",
  "Review this term sheet",
  "Analyze this PDF privately",
  "Summarize this contract",
  "Draft a reply to this email",
  "Explain this legal clause in plain English",
  "Redline this agreement",
  "Talk through something sensitive, privately",
];

/** Concrete example prompts for the static login/preview pane. */
export const examplePrompts = [
  "What happened in AI this week?",
  "Generate a logo for a coffee roaster",
  "Draft a launch tweet for a privacy-first AI app, plus 3 variations",
  "Compare the leading open LLMs right now",
];
