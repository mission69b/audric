// The Hub skills feed (SPEC_HUB_V1 §3.1) — grouped by PROJECT (the Monad
// agent-hub pattern): one card per protocol/project, each carrying its
// skills. Every skillUrl is LIVE, served markdown an agent reads and follows.
// Onboarding is one paste:
//   "Read <skillUrl> and follow the instructions."
// Third-party dapps join by PR — the feed is the curation point; only skills
// that have been read + smoke-tested get merged.

export interface SkillEntry {
  description: string;
  name: string;
  /** Live markdown an agent can read + follow. */
  skillUrl: string;
  slug: string;
  tags: string[];
}

export interface ProjectEntry {
  /** Brand accent for the icon tile ring / fallback monogram. */
  accent: string;
  /** Brand mark under public/brand (square, renders in a 40px tile). */
  icon: string;
  id: string;
  /** When the skills were last read + smoke-tested against what the URL
   *  serves (ISO date). Surfaced Portal-style on /skills/[project]. */
  lastVerified: string;
  name: string;
  skills: SkillEntry[];
  tagline: string;
  /** The project's site (shown as a link-out on the card). */
  url: string;
}

/** Look a project up by its /skills/[project] segment. */
export function getProject(id: string): ProjectEntry | undefined {
  return PROJECTS_FEED.find((p) => p.id === id);
}

export const PROJECTS_FEED: ProjectEntry[] = [
  {
    accent: "#0072F5",
    icon: "/brand/pfp-t2-white-field.svg",
    id: "t2000",
    lastVerified: "2026-07-10",
    name: "t2000",
    tagline:
      "The agent wallet + identity stack — gasless USDC, x402 paid APIs, on-chain Agent ID.",
    url: "https://t2000.ai",
    skills: [
      {
        slug: "t2000-setup",
        tags: ["wallet", "identity", "setup"],
        name: "Wallet setup",
        description:
          "Bootstrap the Agent Wallet: local keypair, free on-chain Agent ID, spending limits, MCP wiring. The entry point every other skill assumes.",
        skillUrl: "https://t2000.ai/skills/t2000-setup",
      },
      {
        slug: "t2000-send",
        tags: ["payments", "gasless", "suins"],
        name: "Send stablecoins",
        description:
          "Send USDC / USDsui / SUI to any address, SuiNS name, or @handle — stablecoin sends are gasless.",
        skillUrl: "https://t2000.ai/skills/t2000-send",
      },
      {
        slug: "t2000-receive",
        tags: ["payments", "receive"],
        name: "Request payments",
        description:
          "Share the wallet address, render a QR, or emit a sui:pay URI so humans and agents can pay this wallet.",
        skillUrl: "https://t2000.ai/skills/t2000-receive",
      },
      {
        slug: "t2000-check-balance",
        tags: ["wallet", "reads"],
        name: "Read balances",
        description:
          "Inspect USDC / USDsui / SUI holdings and USD totals before any write.",
        skillUrl: "https://t2000.ai/skills/t2000-check-balance",
      },
      {
        slug: "t2000-services",
        tags: ["x402", "discovery"],
        name: "Discover paid APIs",
        description:
          "Browse the x402 service catalog (AI models, search, data, mail, TTS, code exec) with live prices — free.",
        skillUrl: "https://t2000.ai/skills/t2000-services",
      },
      {
        slug: "t2000-pay",
        tags: ["x402", "payments", "apis"],
        name: "Pay APIs per call",
        description:
          "Pay any x402-protected API in USDC — handles the 402 challenge → pay → retry loop automatically.",
        skillUrl: "https://t2000.ai/skills/t2000-pay",
      },
      {
        slug: "t2000-verify",
        tags: ["confidential", "verify", "receipts"],
        name: "Verify confidential AI",
        description:
          "Trustlessly verify a confidential (GPU-TEE) inference receipt against its on-chain Sui anchor.",
        skillUrl: "https://t2000.ai/skills/t2000-verify",
      },
      {
        slug: "t2000-mcp",
        tags: ["mcp", "setup"],
        name: "Wire up MCP",
        description:
          "Connect the wallet to Claude Desktop, Cursor, Windsurf, or any MCP client — 13 tools + one prompt per skill.",
        skillUrl: "https://t2000.ai/skills/t2000-mcp",
      },
    ],
  },
  {
    accent: "#4de5c8",
    icon: "/brand/cetus.png",
    id: "cetus",
    lastVerified: "2026-07-10",
    name: "Cetus",
    tagline: "Sui's liquidity hub — best-route swaps across 20+ DEXs.",
    url: "https://www.cetus.zone",
    skills: [
      {
        slug: "t2000-swap",
        tags: ["defi", "swap", "cetus"],
        name: "Swap any Sui token",
        description:
          "Best-route swaps through the Cetus Aggregator — quotes, slippage control, and the swap-needs-SUI-for-gas gotcha.",
        skillUrl: "https://t2000.ai/skills/t2000-swap",
      },
    ],
  },
];

/** The one-paste onboarding line for a skill. */
export function skillPrompt(entry: SkillEntry): string {
  return `Read ${entry.skillUrl} and follow the instructions.`;
}
