export interface Message {
  id: string;
  role: "agent" | "user";
  content: string;
}

export const WELCOME_MESSAGES: Message[] = [
  {
    id: "welcome-1",
    role: "agent",
    content:
      "Hi, I'm Audric — your financial agent on Sui.\n\nI can help you save, pay, send, and borrow. All by conversation, all in USDC.",
  },
  {
    id: "welcome-2",
    role: "agent",
    content:
      "**Here's what I can do:**\n\n• **Save** — Earn 4.86% APY on USDC\n• **Pay** — Access 88+ APIs with micropayments\n• **Send** — Transfer USDC anywhere, instantly\n• **Credit** — Borrow against your savings",
  },
];

export interface Chip {
  label: string;
  prompt: string;
}

export const SUGGESTION_CHIPS: Chip[] = [
  { label: "Save $100", prompt: "Save $100" },
  { label: "Check rates", prompt: "What are the current rates?" },
  { label: "Send USDC", prompt: "Send USDC" },
  { label: "How it works", prompt: "How does Audric work?" },
];

const DEMO_RESPONSES: Record<string, string> = {
  "Save $100":
    "Here's what would happen:\n\nYour **$100 USDC** gets deposited into NAVI Protocol, currently earning **4.86% APY**. That's ~$4.86/year, compounding automatically.\n\nConnect your wallet to start earning.",
  "What are the current rates?":
    "**Today's rates** (via NAVI Protocol):\n\n| | Rate |\n|---|---|\n| USDC Savings | **4.86% APY** |\n| USDC Borrow | **8.12% APR** |\n\nRates update every 30 seconds. Want me to set up a savings position?",
  "Send USDC":
    "I can help you send USDC to anyone with a Sui address.\n\n**How much** would you like to send, and **to whom**? You can paste an address or choose from your contacts.",
  "How does Audric work?":
    "Audric is a financial operating system built on Sui.\n\n**Three steps:**\n1. **Sign in** with Google (no seed phrases)\n2. **Fund** your wallet with USDC\n3. **Talk** — tell me what you need\n\nYour money lives in a non-custodial wallet. I execute transactions, but you approve every one. Built on t2000 infrastructure.",
};

const FALLBACK_RESPONSE =
  "I understand you want to do that. Once I'm fully connected, I'll be able to help.\n\nFor now, try one of the suggestions below — or explore the product pages to learn more.";

export function getDemoResponse(userMessage: string): string {
  const normalized = userMessage.trim();
  if (DEMO_RESPONSES[normalized]) return DEMO_RESPONSES[normalized];

  const lower = normalized.toLowerCase();
  if (lower.includes("save")) return DEMO_RESPONSES["Save $100"];
  if (lower.includes("rate")) return DEMO_RESPONSES["What are the current rates?"];
  if (lower.includes("send") || lower.includes("transfer"))
    return DEMO_RESPONSES["Send USDC"];
  if (lower.includes("how") || lower.includes("what") || lower.includes("work"))
    return DEMO_RESPONSES["How does Audric work?"];

  return FALLBACK_RESPONSE;
}
