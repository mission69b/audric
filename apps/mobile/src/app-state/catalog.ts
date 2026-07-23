// Static, presentational data for the chat surface — ported verbatim from the
// mobile prototype's `renderVals()` (`Audric Mobile Design Brief/Audric Mobile.dc.html`).
// These mirror web-v3's own catalogs (lib/ai/models.ts, lib/credit/tiers.ts)
// exactly. Interactive suggestions/follow-ups carry the literal text to send;
// the component wires it to the store's `askSuggestion`. (The prototype's
// Skills catalog was removed 2026-07-12 with the Skills tab — web-v3 main
// deleted its /skills surface; skills run as chat-native tools.)

export type ModelCaps = { tools?: boolean; vision?: boolean; reasoning?: boolean };
export type ModelRow = {
  /** display name — also the value stored in `state.model` */
  name: string;
  /** canonical web-v3 model id (lib/ai/models.ts) — the value sent to the API as
   * `selectedChatModel`, so the wire contract matches web-v3 and the Gateway swap
   * needs no client change. */
  id: string;
  best: string;
  /** prototype provider key (logo slug is derived) */
  prov: "audric" | "moonshot" | "xai" | "anthropic" | "openai";
  kind: "auto" | "free" | "paid";
  price?: string;
  caps: ModelCaps;
};

// Catalog mirrors web-v3 lib/ai/models.ts exactly: Auto router + 5 chat models,
// Kimi free default, all privacy tier = "private" (ZDR). Representative $/1M input.
export const MODELS: ModelRow[] = [
  { name: "Auto", id: "auto", best: "Smartest default", prov: "audric", kind: "auto", caps: {} },
  {
    name: "Kimi K2.5",
    id: "moonshotai/kimi-k2.5",
    best: "Fast & free",
    prov: "moonshot",
    kind: "free",
    caps: { tools: true },
  },
  {
    name: "Grok 4.3",
    id: "xai/grok-4.3",
    best: "Fast & capable",
    prov: "xai",
    kind: "paid",
    price: "0.20",
    caps: { tools: true, vision: true },
  },
  {
    name: "Claude Sonnet 5",
    id: "anthropic/claude-sonnet-5",
    best: "Balanced & fast",
    prov: "anthropic",
    kind: "paid",
    price: "3.00",
    caps: { tools: true, vision: true, reasoning: true },
  },
  {
    name: "Claude Opus 4.8",
    id: "anthropic/claude-opus-4.8",
    best: "Code & writing",
    prov: "anthropic",
    kind: "paid",
    price: "5.00",
    caps: { tools: true, vision: true, reasoning: true },
  },
  {
    name: "GPT-5.5",
    id: "openai/gpt-5.5",
    best: "All-round + vision",
    prov: "openai",
    kind: "paid",
    price: "1.25",
    caps: { tools: true, vision: true, reasoning: true },
  },
];

// Map a switcher display name (`state.model`) → the canonical web-v3 model id sent
// to the API. Keeps the wire contract identical to web-v3, so the eventual Gateway
// swap is a server-only change. Unknown name falls back to Auto's id.
const MODEL_ID_BY_NAME: Record<string, string> = Object.fromEntries(
  MODELS.map((m) => [m.name, m.id])
);
export function modelId(name: string): string {
  return MODEL_ID_BY_NAME[name] ?? "auto";
}

// Vision-capable set — only non-vision models (Kimi) reject image attachments;
// Auto and every premium model see them. (PDFs work on any model.)
export const VISION_MODELS = new Set([
  "Auto",
  "Grok 4.3",
  "Claude Sonnet 5",
  "Claude Opus 4.8",
  "GPT-5.5",
]);

// models.dev logo slug per prototype provider key.
const LOGO_SLUG: Record<string, string> = {
  moonshot: "moonshotai",
  xai: "xai",
  anthropic: "anthropic",
  openai: "openai",
};

export function providerLogoUrl(prov: string): string | null {
  if (prov === "audric") return null;
  return `https://models.dev/logos/${LOGO_SLUG[prov] ?? prov}.svg`;
}

// Empty-state suggestion chips — the literal prompt each sends. Every chip must
// map to something the app can ACTUALLY do: "Check my balance" is answered by the
// real `balance_check` tool, the privacy question by the model, and the research
// chip by the live `web_search` tool. The old "Send a payment" chip was dropped —
// there is no send tool, so it only ever produced an apology.
export const SUGGESTIONS: { label: string; text: string }[] = [
  { label: "Check my balance", text: "What's my USDC balance?" },
  { label: "How do you keep my data private?", text: "How do you keep my data private?" },
  { label: "What's new in AI this week?", text: "What's new in AI this week?" },
];

// Follow-up rows under the last assistant turn.
export const FOLLOWUPS: { label: string; text: string }[] = [
  { label: "Generate a logo image", text: "Generate a minimal geometric logo, teal on charcoal" },
  { label: "Make a short video clip", text: "Make a short video clip of a sunrise over the sea" },
  { label: "Draft a launch announcement", text: "Draft a launch announcement document" },
];

// Slash commands — web-v3 slash-commands.tsx (7 commands).
export type SlashKey =
  | "new"
  | "clear"
  | "model"
  | "theme"
  | "delete"
  | "purge";
export const SLASH_COMMANDS: { name: SlashKey; desc: string }[] = [
  { name: "new", desc: "Start a new chat" },
  { name: "clear", desc: "Clear current chat" },
  // "rename" was listed here but had no branch in `runSlash` — it silently did
  // nothing. Dropped until a rename path exists; re-add it WITH the handler.
  { name: "model", desc: "Change the AI model" },
  { name: "theme", desc: "Toggle dark/light mode" },
  { name: "delete", desc: "Delete current chat" },
  { name: "purge", desc: "Delete all chats" },
];

// Context-usage meter — Auto→Kimi is free so every line reads "Free".
export const CTX = {
  frac: 12400 / 200000, // 6.2%
  pct: ((12400 / 200000) * 100).toFixed(1) + "%",
  used: "12.4K",
  total: "200K",
  turnCost: "Free",
  rows: [
    { label: "Input", tok: "8.2K", cost: "Free" },
    { label: "Output", tok: "3.9K", cost: "Free" },
    { label: "Reasoning", tok: "0.3K", cost: "Free" },
  ],
};

// Destructive-confirm copy — web-v3 settings verbatim.
export const CONFIRM_COPY: Record<
  "forget" | "delete" | "purge" | "signout",
  { title: string; body: string; cta: string }
> = {
  forget: {
    title: "Forget all your memories?",
    body: "Audric will stop recalling everything it has remembered about you, and start fresh. The encrypted memories expire from decentralized storage on their own. This can't be undone.",
    cta: "Forget all",
  },
  delete: {
    title: "Delete all chats?",
    body: "This permanently deletes all of your chats and their messages.",
    cta: "Delete all",
  },
  purge: {
    title: "Purge all your data?",
    body: "This permanently deletes all of your chats, messages, and artifacts. Your account, plan, and credit balance are kept. This can't be undone.",
    cta: "Purge everything",
  },
  signout: {
    title: "Sign out?",
    body: "You'll need to sign in with Google again to access your chats, memory, and wallet.",
    cta: "Sign out",
  },
};

// ---------------------------------------------------------------------------
// Wallet (prototype WALLET tab + SEND/RECEIVE sheets). Demo figures, verbatim.

/** Full wallet address (Receive sheet + Passport). */
export const WALLET_ADDRESS = "0x9a3f7c2e…b41dc1d2";
/** Success-stage transaction digest (Send sheet). */
export const SEND_DIGEST = "0x7b2e4a…c19f4a";

export type Tx = {
  id: number;
  /** true = outgoing (up-right arrow), false = incoming (down-left arrow) */
  out: boolean;
  label: string;
  amt: string;
  asset: string;
  time: string;
};

// Recent-activity rows on the wallet home.
export const TRANSACTIONS: Tx[] = [
  { id: 1, out: true, label: "alice.audric", amt: "−25.00", asset: "USDC", time: "2h ago" },
  { id: 2, out: false, label: "0x9a3f…c1d2", amt: "+50.00", asset: "USDC", time: "Yesterday" },
  { id: 3, out: true, label: "Blue Bottle · merchant", amt: "−4.20", asset: "USDC", time: "2 days ago" },
];

// A fake but stable 21×21 QR matrix (prototype buildQr): the three finder
// patterns are real; the payload cells are a deterministic hash so the code
// looks plausible without encoding anything. `true` = a dark module.
export function buildQr(): boolean[] {
  const N = 21;
  const cells: boolean[] = [];
  const finder = (r: number, c: number): boolean | null => {
    for (const [fr, fc] of [
      [0, 0],
      [0, N - 7],
      [N - 7, 0],
    ]) {
      if (r >= fr && r < fr + 7 && c >= fc && c < fc + 7) {
        const ir = r - fr;
        const ic = c - fc;
        const edge = ir === 0 || ir === 6 || ic === 0 || ic === 6;
        const core = ir >= 2 && ir <= 4 && ic >= 2 && ic <= 4;
        return edge || core;
      }
    }
    return null;
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const f = finder(r, c);
      cells.push(f !== null ? f : (r * 7 + c * 13 + (r ^ c) * 5) % 3 === 0);
    }
  }
  return cells;
}

/** Precomputed QR matrix (441 modules, row-major). */
export const QR_CELLS = buildQr();

// ---------------------------------------------------------------------------
// Passport / settings (prototype SETTINGS tab). Demo identity + billing figures.

/** Signed-in handle shown on the Passport card + drawer account row. */
export const USER_HANDLE = "you.audric";
/** Google sign-in email shown on the Passport card. */
export const USER_EMAIL = "you@gmail.com";
/** Truncated address (Passport row + billing top-up bar). */
export const SHORT_ADDRESS = "0x9a3f…c1d2";
/** Audric credit balance (billing). Free persona = $0. */
export const CREDIT_USD = "0.00";

/** Billing top-up presets — web-v3 lib/credit/tiers.ts TOPUP_PRESETS_USD. */
export const TOPUPS = [5, 10, 25, 50];

// "Included in every plan" — web-v3 lib/credit/tiers.ts EVERY_PLAN, verbatim.
export const EVERY_PLAN: string[] = [
  "Uncensored — open models that won't refuse you",
  "Zero data retention — your chats are never training data",
  "Permissionless — no account, no KYC, no seed phrase",
  "Non-custodial wallet — your keys, your money, always",
  "Send USDC + USDsui anywhere — free, instant, gasless",
  "Decentralized memory — encrypted on Walrus",
  "Private chats & files — encrypted at rest, never public",
  "Auto — automatically picks the best model for every task",
  "Skills — built-in live data: crypto, stocks & on-chain (prices, charts, screeners, ratings)",
  "Web search, PDF analysis & diagrams — all built in",
];

// "Coming soon" — web-v3 lib/credit/tiers.ts COMING_SOON, verbatim.
export const COMING_SOON: string[] = [
  "End-to-end encrypted chats — sealed with Seal, readable only by you",
  "Decentralized backup — your memory, end-to-end on Walrus",
];

// ---------------------------------------------------------------------------
// Drawer chat history shapes. The prototype shipped a static `CONVERSATIONS`
// list here; the drawer now renders REAL DB-backed threads (store `history`,
// grouped by recency), so only the row/group types remain. `active` flags the
// open thread; per-row menu state is in the store.

export type Conversation = { id: string; title: string; active: boolean };
export type ConversationGroup = { group: string; items: Conversation[] };

// ---------------------------------------------------------------------------
// Plans (prototype PLANS sheet). Mirrors web-v3 lib/credit/tiers.ts TIERS
// (Free / Pro / Max), verbatim. Persona = Free (current plan).

export type Tier = {
  id: string;
  name: string;
  priceLabel: string;
  per: string;
  hasOriginal: boolean;
  origLabel: string;
  beta: boolean;
  popular: boolean;
  featured: boolean;
  tagline: string;
  cta: string;
  current: boolean;
  feats: string[];
};

export const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "Free",
    per: "",
    hasOriginal: false,
    origLabel: "",
    beta: false,
    popular: false,
    featured: false,
    tagline: "The private AI, on the house",
    cta: "Current plan",
    current: true,
    feats: [
      "20 chats/day on open, uncensored models",
      "10 images/day — generate, edit & upscale",
      "1 video/day",
      "Web search + cited multi-step research",
      "Pay-as-you-go top-up for premium models & more media",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceLabel: "$18",
    per: "/mo",
    hasOriginal: true,
    origLabel: "$36",
    beta: true,
    popular: true,
    featured: true,
    tagline: "All the models, generous",
    cta: "Get Pro",
    current: false,
    feats: [
      "$20/mo credit — more than topping up, never expires",
      "Unlimited chat on open models",
      "Every premium + frontier model (Claude, GPT-5.x, Gemini)",
      "No daily caps — images & video funded by your credit",
      "Video generation — fast, high-quality clips",
      "Full image suite — generate, edit & upscale",
    ],
  },
  {
    id: "max",
    name: "Max",
    priceLabel: "$100",
    per: "/mo",
    hasOriginal: true,
    origLabel: "$200",
    beta: true,
    popular: false,
    featured: false,
    tagline: "Maximum everything",
    cta: "Get Max",
    current: false,
    feats: [
      "$110/mo credit — more than topping up, never expires",
      "Everything in Pro, at the highest usage",
      "Most monthly credit for premium models, video & media",
      "First access to new features",
    ],
  },
];

// Account-menu Help submenu (prototype accountMenu → web-v3 header dropdown).
export const HELP_ITEMS: string[] = [
  "Blog",
  "Privacy Policy",
  "Terms of Service",
  "Report a bug",
];

// Referral sheet demo figures (prototype REFERRAL sheet).
export const REFERRAL_LINK = "https://audric.ai/r/you-a1b2";
export const REFERRAL_STATS: { value: string; label: string; teal?: boolean }[] = [
  { value: "3", label: "Referrals" },
  { value: "$30", label: "Earned", teal: true },
  { value: "#142", label: "Rank" },
];

// Artifact viewer demo body.
export const ARTIFACT_LINES: string[] = [
  "Today we're introducing Audric — a private, decentralized AI that's truly yours.",
  "Sign in with Google and a non-custodial Sui wallet is created in seconds — no seed phrase. Chat with the best open and frontier models, generate images and video, and send USDC gaslessly.",
  "Every chat is zero-retention. Your data is encrypted, decentralized, and deletable — only you hold the keys.",
];
