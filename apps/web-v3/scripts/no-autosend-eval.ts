/**
 * wedge/no-autosend regression eval (SPEC_AUDRIC_AGENT_WEDGE §6b).
 *
 * Locks the S.490 invariant: send_transfer is NEVER exposed on a non-payment
 * turn, and IS exposed on a real payment turn. Tests the pure gate helper
 * (`hasPaymentIntent`) the route uses to build the active tool set.
 *
 * Run: pnpm --filter @audric/web-v3 eval:no-autosend
 */
import { hasPaymentIntent } from "../lib/ai/payment-intent";

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

console.log(`\n${passed}/${CASES.length} send cases passed`);
if (passed !== CASES.length) {
  console.log("FAIL ❌ — money-tool gating invariant broken");
  process.exit(1);
}
console.log("PASS ✅ (send_transfer never exposed without user intent)");
