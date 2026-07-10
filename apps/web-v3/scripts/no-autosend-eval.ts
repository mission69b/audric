/**
 * wedge/no-autosend regression eval (SPEC_AUDRIC_AGENT_WEDGE §6b).
 *
 * Locks the S.490 invariant: send_transfer is NEVER exposed on a non-payment
 * turn, and IS exposed on a real payment turn. Tests the pure gate helper
 * (`hasPaymentIntent`) the route uses to build the active tool set.
 *
 * Also locks the agent_pay gate (SPEC_AGENT_COMMERCE §II.12 C2): the store-buy
 * tool is exposed only on explicit buy/use phrasing OR the offer→agree
 * handshake (short affirmative right after the assistant named a listed
 * service + price) — never on plain chat, and never on a bare "yes" with no
 * prior offer.
 *
 * Run: pnpm --filter @audric/web-v3 eval:no-autosend
 */
import { hasAgentPayIntent, hasPaymentIntent } from "../lib/ai/payment-intent";

type Case = {
  label: string;
  text: string;
  intent?: string;
  isContinuation?: boolean;
  expect: boolean; // expected: is send_transfer exposed?
};

const CASES: Case[] = [
  // --- MUST gate CLOSED (the incident class) ---
  {
    label: "image gen turn (the S.490 incident)",
    text: "generate 5 more images like this style",
    intent: "image",
    expect: false,
  },
  {
    label: "plain chat",
    text: "what's the meaning of life?",
    intent: "chat",
    expect: false,
  },
  {
    label: "crypto price lookup",
    text: "what's the price of SUI right now?",
    intent: "chat",
    expect: false,
  },
  {
    label: "research turn",
    text: "research the AI coding landscape",
    intent: "research",
    expect: false,
  },
  {
    label: "balance question (read, not a send)",
    text: "how much USDC do I have?",
    intent: "chat",
    expect: false,
  },
  // --- MUST gate OPEN (real payment intent) ---
  {
    label: "explicit send (router money intent)",
    text: "send 5 USDC to alice.sui",
    intent: "money",
    expect: true,
  },
  {
    label: "explicit transfer, non-Auto (keyword fallback, no intent)",
    text: "transfer 10 USDsui to bob.sui",
    expect: true,
  },
  {
    label: "pay phrasing (keyword fallback)",
    text: "pay alice 2 usdc",
    expect: true,
  },
  {
    label: "mid-flow confirm continuation",
    text: "(continuation)",
    isContinuation: true,
    expect: true,
  },
];

// ── agent_pay gate cases (§II.12 C2) ────────────────────────────────────────
const OFFER =
  "The Funding Radar agent can sell you a live funding-rate carry report — $0.05, pay-on-delivery, auto-refunds if it fails. Want it?";

type PayCase = {
  label: string;
  text: string;
  lastAssistantText?: string;
  isContinuation?: boolean;
  expect: boolean; // expected: is agent_pay exposed?
};

const PAY_CASES: PayCase[] = [
  // --- MUST gate CLOSED ---
  {
    label: "plain chat (no store shape)",
    text: "what's the meaning of life?",
    expect: false,
  },
  {
    label: "image gen turn",
    text: "generate 5 more images like this style",
    expect: false,
  },
  {
    label: "crypto price lookup (free tool covers it)",
    text: "what's the price of SUI right now?",
    expect: false,
  },
  {
    label: "bare yes with NO prior offer",
    text: "yes",
    lastAssistantText: "The weather in Sydney is sunny today.",
    expect: false,
  },
  {
    label: "bare yes, offer text without a price",
    text: "yes",
    lastAssistantText: "Funding Radar could help with that question.",
    expect: false,
  },
  {
    label: "bare yes after a priced but non-service message",
    text: "yes",
    lastAssistantText: "That laptop costs $999 at most retailers.",
    expect: false,
  },
  // Send intents must NOT open agent_pay (S.611: a hostile listing named like
  // a payment instruction must never compete with send_transfer).
  {
    label: "explicit send stays send-only",
    text: "send 5 USDC to alice.sui",
    expect: false,
  },
  {
    label: "bare pay-a-person stays send-only",
    text: "pay john@audric 1 usdc",
    expect: false,
  },
  {
    label: "transfer stays send-only",
    text: "transfer 10 USDsui to bob.sui",
    expect: false,
  },
  // --- MUST gate OPEN ---
  {
    label: "explicit buy-a-report phrasing",
    text: "buy the funding radar report",
    expect: true,
  },
  {
    label: "pay-the-agent phrasing (service noun present)",
    text: "pay the Funding Radar agent for a report",
    expect: true,
  },
  {
    label: "use-the-agent phrasing",
    text: "use the Card Forge agent to make my card",
    expect: true,
  },
  {
    label: "offer-pending: bare yes after a priced offer",
    text: "yes",
    lastAssistantText: OFFER,
    expect: true,
  },
  {
    label: "offer-pending: the founder's live-smoke phrasing",
    text: "Do the paid Funding Radar",
    lastAssistantText: OFFER,
    expect: true,
  },
  {
    label: "offer-pending: any wording keeps the tool available",
    text: "hmm ok the cross-venue one then",
    lastAssistantText: OFFER,
    expect: true,
  },
  {
    label: "offer-pending: even a decline turn (model just won't call)",
    text: "no thanks, free is fine",
    lastAssistantText: OFFER,
    expect: true,
  },
  {
    label: "mid-flow confirm continuation",
    text: "(continuation)",
    isContinuation: true,
    expect: true,
  },
];

let passed = 0;
console.log(`no-autosend eval — ${CASES.length} send cases\n`);
for (const c of CASES) {
  const got = hasPaymentIntent({
    text: c.text,
    intent: c.intent,
    isContinuation: c.isContinuation,
  });
  const ok = got === c.expect;
  if (ok) {
    passed++;
  }
  console.log(
    `${ok ? "✅" : "❌"} exposed=${got} expect=${c.expect}  ${c.label}`
  );
}

let payPassed = 0;
console.log(`\nagent_pay gate — ${PAY_CASES.length} cases\n`);
for (const c of PAY_CASES) {
  const got = hasAgentPayIntent({
    text: c.text,
    lastAssistantText: c.lastAssistantText,
    isContinuation: c.isContinuation,
  });
  const ok = got === c.expect;
  if (ok) {
    payPassed++;
  }
  console.log(
    `${ok ? "✅" : "❌"} exposed=${got} expect=${c.expect}  ${c.label}`
  );
}

console.log(
  `\n${passed}/${CASES.length} send + ${payPassed}/${PAY_CASES.length} agent_pay passed`
);
if (passed !== CASES.length || payPassed !== PAY_CASES.length) {
  console.log("FAIL ❌ — money-tool gating invariant broken");
  process.exit(1);
}
console.log(
  "PASS ✅ (send_transfer + agent_pay never exposed without user intent)"
);
