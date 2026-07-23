# Device QA — pass 2 (2026-07-23, later session)

Second full drive of the app on the emulator, after the D1–D11 fix pass recorded in
`EMULATOR-TEST-2026-07-23.md`. Same rig: `audric_test` (Android 15 / API 35, 1080×2400),
dev client `ai.audric.app`, Metro + web-v3 reached over `adb reverse tcp:8081` /
`tcp:3002`, signed in as `ngocanh30075@gmail.com`, Sui **testnet**, Free plan.

Everything below was driven on the running app. Code refs are given only where they
explain the result. Defect numbering continues from D11. Cross-check column = what
`apps/web-v3` does for the same behaviour.

Working tree only — **nothing committed**.

**Status legend:** `FIXED ✅` = fix landed in the working tree *and* re-verified on the
device this session. `OPEN` = no code written yet. `NEEDS DECISION` = the fix is a product
call, not just code.

| # | Severity | Status |
|---|---|---|
| D12 classify() hijack | HIGH | **FIXED ✅** |
| D13 prompt/tool mismatch | HIGH | **FIXED ✅** |
| D14 memory toggle inert | HIGH (honesty) | NEEDS DECISION |
| D15 model not persisted | MEDIUM | **FIXED ✅** |
| D16 Plans sheet self-contradiction | MEDIUM | NEEDS DECISION |
| D17 single-chat delete unconfirmed | MEDIUM | OPEN |
| D18 "Get Pro" dead end | MEDIUM | NEEDS DECISION |
| D19–D22 | LOW/MEDIUM | OPEN |
| D23 markdown tables unrendered | MEDIUM | **FIXED ✅** |
| D24 thread never scrolls to a new turn | MEDIUM | **FIXED ✅** |

---

## 1. Defects found this pass

### D12 — HIGH: `classify()` hijacks real prompts into canned demo output — **FIXED ✅**
`src/app-state/store.tsx:221-235`, used at `:801`. A keyword regex
(`write|code|function|script|table|report|draft|generate|art|render|image|video` …)
routes a matching user message into a **canned demo card** — the model is never called,
no request leaves the device.

* Live: a normal "write a …" prompt produced a demo artifact card instead of an answer.
* D9 (pass 1) only changed the follow-up **chips** so they stop hitting these regexes.
  The regexes still fire on anything the user types themselves, which is the bigger hole.
* **web-v3:** no client-side classifier. Every turn goes to `/api/chat`; model choice is a
  *server* concern (`lib/ai/intelligence/router.ts`). Nothing is ever answered locally.
* Fix: delete `classify()` from the send path (or gate it behind an explicit demo flag).
  Demo cards must never be reachable from free-typed input.

**Fix landed:** `classify()` and every local demo producer were removed from the send path
in `store.tsx`; `metadata.demo` now has **no producer at all**. The render branches in
`conversation.tsx` and the two sheets they open (`image-fullscreen.tsx`,
`artifact-viewer.tsx`) were deliberately *kept and commented* as dead scaffolding to
replace when real image/artifact tools land — nothing may feed them again.
**Device-verified:** "write me a table…" (a formerly-hijacked prompt) now reaches the model
and returns a real streamed answer with a Chain-of-Thought row.

### D13 — HIGH: the system prompt advertises ~14 tools; the route binds 2 — **FIXED ✅**
`src/app/api/chat+api.ts:154-175` binds `{ web_search, balance_check }`, but calls
`systemPrompt({ supportsTools: true, isAuthed })`, which (`src/lib/ai/prompts.ts:183`)
concatenates `boundariesPrompt + searchPrompt + cryptoPrompt + stockPrompt +
documentsPrompt + walletPrompt + preferencesPrompt`. That advertises `web_scrape`,
`crypto_market`, `crypto_history`, `crypto_global`, `crypto_screener`, `token_research`,
`onchain_trending`, `perp_market`, `stock_analysis`, `transaction_history`,
`resolve_suins`, `send_transfer`, `set_preferences`, plus image generation
(`boundariesPrompt`) — none of which exist on the device.

Live evidence, captured verbatim on-device: asked to send SUI, the model reasoned
*"I don't see a `send_transfer` tool available in my tool list … The system prompt mentions
I should be able to send transfers"*, burned **55 s**, then told the user to
*"use a wallet interface like Sui Wallet, Suiet"* — while the app's own Send sheet works.

* **web-v3:** the prompt and the bound tool set are kept in step, and the per-turn
  allowlist is narrowed with `experimental_activeTools` (`app/(chat)/api/chat/route.ts`
  ~:790, ~:994) so the model is never told about a tool it cannot call this turn.
* Fix (cheap): pass the bound tool names into `systemPrompt` and compose only those
  sections. Fix (real): land the missing tools. Either way the mismatch must not ship —
  it costs latency and actively misdirects users away from a working feature.

**Fix landed (the cheap one):** `systemPrompt()` takes a new mobile-only
`boundTools?: readonly string[]`. When given, sections describing unbound tools are
dropped, an authoritative `<available_tools>` block is appended, a mobile
`boundariesPrompt` replaces the image-generation one, and the wallet section degrades to a
read-only `mobileWalletReadPrompt()` that explicitly says *there is no send tool here* and
points at **Wallet → Send** (never a third-party wallet). The call site passes
`const boundTools = ["web_search", "balance_check"] as const` and the tool map carries
`satisfies Record<(typeof boundTools)[number], unknown>`, so prompt and tools are locked in
step in **both** directions at compile time — the mobile stand-in for web-v3's
`experimental_activeTools`.
**Device-verified:** the same send request now answers in **6–7 s** (was 55 s) with
*"I can't send funds from chat. Use **Wallet → Send** in this app — it's gasless for USDC
and requires your tap-to-confirm."*

### D14 — HIGH (privacy claim): the Memory toggle is a no-op end to end — **NEEDS DECISION**
`memoryOn` lives in `store.tsx:431` (`useState(false)`), is never put in the request body,
and `chat+api.ts` never passes `memoryOn` / `memoryRecall` to `systemPrompt` — so
`prompts.ts:178` (`isAuthed && memoryOn`) is always false. No recall block, no
`save_memory` tool, no MemWal client on mobile. Nothing is stored and nothing is recalled,
in either toggle position.

Meanwhile Settings says: *"Private Memory — Remembers your preferences across chats so it
doesn't start over — encrypted on Walrus (decentralized storage)"*, and the Privacy &
Storage block asserts *"Memory encrypted on Walrus (decentralized) — yours, never sold."*

* **web-v3:** `memoryOn = Boolean(session?.user && useMemWal && isMemoryConfigured())`
  (`app/(chat)/api/chat/route.ts:596`); recall is injected into the leading system prompt,
  `save_memory` is added to the active tools, and the **toggle is only rendered when
  `models.memoryEnabled` is true** (`app/(chat)/settings/page.tsx:291`,
  `components/chat/multimodal-input.tsx:1358`) — i.e. web-v3 hides the control when the
  backend isn't configured. Mobile shows it unconditionally.
* Fix: hide the toggle behind a capability flag from the server (web-v3's pattern) until
  MemWal lands on mobile, or wire it. Shipping an inert control under that copy is an
  honesty problem, not a cosmetic one.
* Note: **`/api/account/forget-memory` and `/api/account/purge` are real** and correctly
  auth-gated (`incrementMemoryEpoch`, `deleteAllChatsByUserId` + `deleteAllDocumentsByUserId`).
  The gap is only the recall/save half.

### D15 — MEDIUM: the selected model is not persisted — **FIXED ✅**
`store.tsx:421` — `useState("Auto")`. Any Metro/RN reload or cold start silently drops the
user back to Auto (the Memory toggle resets too; off-by-default is intentional there, the
model reset is not).

* Live: a reload mid-session reset the picker from Kimi K2.5 to Auto with no notice.
* **web-v3:** persisted in the `chat-model` cookie (`app/(chat)/actions.ts:20`,
  `hooks/use-active-chat.tsx:246`) and deliberately cleared on sign-out
  (`components/auth/zklogin-provider.tsx:163-166`).
* Fix: persist to SecureStore/AsyncStorage next to the theme + onboarding flags
  (`lib/prefs.ts` already has the pattern from D8/D10), and clear it on sign-out.

**Fix landed:** `lib/prefs.ts` gained `loadChatModel` / `saveChatModel` under
`audric.chat-model.v1`, hydrated on mount and cleared on sign-out — the same lifecycle as
web-v3's `chat-model` cookie.
**Device-verified:** picked **Kimi K2.5**, ran a full dev-menu **Reload**; the composer chip
still reads *Kimi K2.5* after the bundle reloads to the empty state.

### D16 — MEDIUM: Plans sheet contradicts itself, and over-claims — **NEEDS DECISION**
The same sheet lists *"Included in every plan → Decentralized memory — encrypted on
Walrus"* and, a few rows down, *"COMING SOON → Decentralized backup — your memory,
end-to-end on Walrus."* Several other "included" lines aren't implemented on mobile:
gasless USDC/USDsui sends (no `send_transfer`), Skills/live-data recipes, PDF + diagram
output. (Web search **is** live — that line is fine.)

* **web-v3:** both `/pricing` and the billing page derive from one catalog
  (`lib/credit/tiers.ts` `EVERY_PLAN` / `COMING_SOON`), so the two lists cannot disagree.
  CLAUDE.md rule 7 requires exactly this.
* Fix: derive the mobile sheet from a single catalog (ideally shared with `tiers.ts`), and
  demote anything mobile can't do to COMING SOON.

### D17 — MEDIUM: deleting a single chat has no confirmation — **OPEN**
Drawer → per-thread delete shows an **inline Delete / Cancel** in the row; a mis-tap
destroys a thread irreversibly. "Delete all chats" *does* get a proper AlertDialog.

* **web-v3:** single-chat delete goes through an `AlertDialog`
  (`components/chat/sidebar-history.tsx`).
* Fix: use the same confirm dialog the destructive Settings actions already use.

### D18 — MEDIUM: "Get Pro" is a dead end — **NEEDS DECISION**
"Get Pro" (from a locked model and from Billing) opens **audric.ai's billing/top-up page in
a Custom Tab**, not a Pro checkout. The app session does not carry into the browser, so the
page shows credit "—" and an anonymous state. There is no purchase path on mobile at all.

* **web-v3:** the standalone `/pricing` route was removed; upgrade is an **in-app modal**
  (`components/pricing/upgrade-modal.tsx` → `PricingView` → Stripe Elements).
* Fix: either deep-link into an authed checkout (session hand-off) or label the row
  honestly ("Manage plan on audric.ai") until IAP/checkout lands. Note the App Store /
  Play billing-policy angle before choosing.

### D19 — LOW/MEDIUM: drawer wallet row shows a bare "0.00"
The drawer's wallet row renders USDC only, with **no unit label**, while the wallet holds
0.846 SUI — reads as "empty wallet". The Wallet screen itself is correct.

### D20 — LOW: header privacy shield has no accessible label
`components/chat/chat-header.tsx` — the shield is a plain `<View>` (decorative by design,
per pass 1) but carries no `accessibilityLabel` and no press affordance, next to a
*pressable* visibility control. Screen readers get nothing; sighted users try to tap it.

### D21 — LOW: assorted copy/format nits (carried from earlier this session)
* Ellipsis glyph corruption inside inline code in assistant output (`0xcc4e. c0a1`).
* Activity row title renders lowercase `send`.
* USD valuation column implies **SUI = $1.00** (no price feed) — misleading on a wallet
  screen; better to show no USD than a wrong one.
* Send sheet denominates in **SUI** while the wallet card labels **USDC** as "spendable".
* `canSend` only checks that the recipient string is non-empty (fail-closed, but the user
  gets no inline validation until submit).

### D22 — LOW: "Refer & earn" row promises a live program
Row subtitle reads *"Give $10, get $10"* with no qualifier; the sheet behind it is honest
("Coming soon", D7's fix). Move the qualifier onto the row so the list itself doesn't
over-promise.

### D23 — MEDIUM: markdown tables render as raw pipe soup — **FIXED ✅**
Found while *verifying* D12: the un-hijacked "write me a table…" turn finally reached the
model, and the answer came back as literal `| Name | Ticker | … |` / `|---|---|` lines
wrapped as prose. `components/chat/markdown.tsx` had no table block type at all — every
GFM table in an assistant answer was unreadable, and tables are exactly what the model
emits for comparison questions (a very common ask on a crypto app).

* **web-v3:** renders assistant markdown with **Streamdown**, which is GFM-complete —
  tables included. The mobile renderer is a hand-rolled subset, so parity has to be added
  block by block; this was the biggest missing block.
* Fix: added a `{ kind: "table"; head: string[]; rows: string[][] }` block. A table starts
  where a `|`-bearing line is followed by a `---|---` divider (the GFM rule), ragged rows
  are padded/trimmed to the header width, and the table renders inside a horizontally
  scrollable container with per-cell borders. RN has no synchronous text measurement, so
  column widths are **estimated** from character counts (`CELL_MIN_W 64` / `CELL_MAX_W 260`,
  header ×1.07) rather than measured — good enough for the 2–5 column tables models emit,
  and the horizontal scroll absorbs the error.
* **Device-verified:** "compare BTC ETH and SUI in a markdown table — columns: name, ticker,
  consensus, launch year" renders a real bordered grid (Bitcoin/BTC/Proof of Work
  (SHA-256), Ethereum/ETH/Proof of Stake, Sui/SUI/Delegated Proof of Stake + BFT) with the
  4th column reachable by horizontal scroll.

### D24 — MEDIUM: the thread never scrolls to a new turn — **FIXED ✅**
Also found during verification, and it cost me a misdiagnosis first: after sending, the
`ScrollView` stayed exactly where it was. The composer clears, no new bubble is visible,
and the answer streams in **below the fold** — indistinguishable from "the message never
sent". (I recorded exactly that wrong conclusion mid-session before scrolling down and
finding the completed answer.) Every long answer had the same problem.

* **web-v3:** pins to the bottom while a turn streams and releases when the user scrolls up
  to read history.
* Fix: `src/app/(app)/index.tsx` — a `stick` ref defaults to true, `onScroll` clears it once
  the viewport is more than `STICK_SLOP` (80px) off the bottom, `onContentSizeChange`
  calls `scrollToEnd` while it is set, and sending a message re-arms it (the user's own
  message is what they want to see; a streaming assistant turn does not re-arm, so reading
  history is never yanked).
* **Device-verified:** the long BTC/ETH/SUI answer above auto-scrolled to its end — table,
  notes, action row, follow-up chips and composer all in frame with no manual scroll.

---

## 2. Verified working this pass ✅

* **Kimi K2.5 selection + routing** — "Say PONG only." / "Reply with PONG" both answered
  PONG (my earlier "never sent" note was a scroll misread; retracted).
* **Custom instructions end-to-end** — "End every reply with the word BANANA." → next reply
  ended "4 / BANANA". Cleared + saved back to empty afterwards (0/2000) so the live account
  is clean.
* **Follow-up suggestion chips** — text prompts, reach the model (D9 fix holds).
* **Memory toggle UI sync** — composer ↔ Settings stay in step (the *plumbing* is what's
  missing, see D14).
* **Chat visibility sheet** — Private / Public ("Coming soon") renders and closes.
* **Plans sheet** renders; reachable from a locked model and from Billing.
* **New chat + empty state**, **history persistence and grouping** across restarts.
* **Settings / Passport** — real address, `Sui testnet`, sign-in email, session
  "Expires Jul 30, 2026" (7-day cap, correct against today).
* **Destructive dialogs** — "Purge all my data?" and "Forget all your memories?" both open
  with correct, honest copy and a red destructive action; **Cancel** was used in both cases
  (not run, per the standing rule about the live account). "Delete all chats" likewise.
* **Claim a handle** sheet — `yourhandle @audric`, "3–20 characters · letters, numbers,
  hyphens", action disabled and labelled **"Claim — coming soon"**. Honest.
* **Developer API** row → opens `developers.t2000.ai` in a Custom Tab.
* **Refer & earn** sheet → honest "Coming soon" body.
* **balance_check** tool returns the real on-chain 0.846 SUI.

Closes these `EMULATOR-TEST-2026-07-23.md` §3 gaps: handle sheet, Developer API link,
destructive-dialog paths (opened + cancelled). **Sign out was not exercised** — re-auth
needs the account password, which I don't have.

---

## 3. Not defects

* `W ReactNativeJS: Cannot connect to Expo CLI … URL: 10.0.2.2:8081` + the LogBox
  "Open debugger to view warnings" toast — dev-client artifact when the app backgrounds for
  a Custom Tab. Already recorded in pass 1 §4. Not a product defect.
* Blank white frame after typing in Custom instructions — logcat showed
  `ReactHost … Starting React Native reload`, i.e. a Metro reload, not a crash; the app
  recovered on its own. The *side effect* (model + memory reset) is D15.

---

## 4. Suggested order of work

Done this session (working tree only, all re-verified on the device):
**D12** (classify hijack) · **D13** (prompt/tool mismatch) · **D15** (persist model) ·
**D23** (markdown tables) · **D24** (stick-to-bottom).

Remaining:

1. **D14** (memory honesty) — hide behind a server capability flag until MemWal lands.
   *Needs your call: hide the toggle, or wire MemWal on mobile?*
2. **D17** (confirm single delete) — small, reuse the existing `ConfirmDialog`.
3. **D16 / D18** (plan copy + upgrade path) — product call, not just code.
   D16: single-source the sheet from `lib/credit/tiers.ts`. D18: honest label vs. session
   hand-off vs. IAP — App Store / Play billing policy decides this one.
4. D19–D22 — copy and polish.

### Verification caveat
`tsc --noEmit` is clean after every edit. **Biome could not be run in this environment** —
`pnpm exec biome check --write` dies with *"[warn] Linter process terminated abnormally
(possibly out of memory)"* on multi-file, two-file and single-file invocations alike, even
with `NODE_OPTIONS=--max-old-space-size=4096`; `npx biome` from `apps/mobile` fails with
*"npm error could not determine executable to run"*. The touched files need a lint pass on
a machine where Biome runs before this ships.
