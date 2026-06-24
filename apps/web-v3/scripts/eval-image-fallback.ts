/**
 * Eval: edit_image cross-turn fallback resolution (the 2026-06-24 paid-customer
 * regression lock). Runs the REAL `scanChatImages` helper the chat route uses
 * against labeled message fixtures and asserts the derived fallback decision.
 *
 * Deterministic (no model / DB / network) — the bug was mechanical (resolution
 * logic), so the lock is mechanical too. Behavioral agent evals (did-it-call /
 * avoid-the-dangerous-tool) ride the real-model + Playwright path and land with
 * the wedge's money-gate (P1) — you can't eval a tool that doesn't exist yet.
 *
 * Run: pnpm --filter web-v3 eval:image   (or: tsx scripts/eval-image-fallback.ts)
 */
import { scanChatImages } from "../lib/ai/scan-chat-images";

type Msg = { role?: string; parts?: unknown };

// Fixtures mirror the AI-SDK-persisted part shapes.
const userPhoto: Msg = {
  role: "user",
  parts: [
    { type: "text", text: "Make this pop" },
    { type: "file", mediaType: "image/png", url: "blob://moon?pathname=moon" },
  ],
};
const editNoId: Msg = {
  // The bug: a messy/weak-model turn that edited but didn't persist output.id.
  role: "assistant",
  parts: [{ type: "tool-edit_image", input: {}, output: {} }],
};
const genWithId = (id: string): Msg => ({
  role: "assistant",
  parts: [{ type: "tool-generate_image", output: { id } }],
});
const editWithId = (id: string): Msg => ({
  role: "assistant",
  parts: [{ type: "tool-edit_image", output: { id } }],
});
const createDocImage = (id: string): Msg => ({
  role: "assistant",
  parts: [{ type: "tool-createDocument", output: { id, kind: "image" } }],
});
const plainChat: Msg = {
  role: "assistant",
  parts: [{ type: "text", text: "hello" }],
};

type Case = {
  name: string;
  messages: Msg[];
  lastImageId: string | undefined;
  chatHasImageSignal: boolean;
  // The route DB-fallbacks (→ user's latest image doc) iff this is true.
  wouldDbFallback: boolean;
};

const CASES: Case[] = [
  {
    name: "BUG REPRO: upload + edit with no output.id → signal, no id → DB fallback",
    messages: [userPhoto, editNoId],
    lastImageId: undefined,
    chatHasImageSignal: true,
    wouldDbFallback: true,
  },
  {
    name: "clean generate → id pinned, no DB fallback needed",
    messages: [
      { role: "user", parts: [{ type: "text", text: "a cat" }] },
      genWithId("img-1"),
    ],
    lastImageId: "img-1",
    chatHasImageSignal: true,
    wouldDbFallback: false,
  },
  {
    name: "fresh chat, NO image → no signal, no cross-chat fallback",
    messages: [
      { role: "user", parts: [{ type: "text", text: "enhance" }] },
      plainChat,
    ],
    lastImageId: undefined,
    chatHasImageSignal: false,
    wouldDbFallback: false,
  },
  {
    name: "createDocument(image) with id → pinned",
    messages: [createDocImage("doc-7")],
    lastImageId: "doc-7",
    chatHasImageSignal: true,
    wouldDbFallback: false,
  },
  {
    name: "upload only (turn 1 mid-edit) → signal true, no id yet",
    messages: [userPhoto],
    lastImageId: undefined,
    chatHasImageSignal: true,
    wouldDbFallback: true,
  },
  {
    name: "latest id wins across turns",
    messages: [genWithId("img-1"), editWithId("img-2")],
    lastImageId: "img-2",
    chatHasImageSignal: true,
    wouldDbFallback: false,
  },
];

let failures = 0;
console.log(`edit_image fallback eval — ${CASES.length} cases\n`);
for (const c of CASES) {
  const got = scanChatImages(c.messages);
  const wouldDbFallback = !got.lastImageId && got.chatHasImageSignal;
  const ok =
    got.lastImageId === c.lastImageId &&
    got.chatHasImageSignal === c.chatHasImageSignal &&
    wouldDbFallback === c.wouldDbFallback;
  if (!ok) {
    failures++;
  }
  console.log(
    `${ok ? "✅" : "❌"} ${c.name}\n    id=${String(got.lastImageId)} signal=${got.chatHasImageSignal} dbFallback=${wouldDbFallback}`
  );
}

console.log(`\n${CASES.length - failures}/${CASES.length} passed`);
console.log(failures === 0 ? "PASS ✅" : "FAIL ❌");
process.exit(failures === 0 ? 0 : 1);
