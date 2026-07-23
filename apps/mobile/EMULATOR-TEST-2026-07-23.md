# Emulator test checklist — 2026-07-23

Device: `audric_test` (Android 15 / API 35, 1080x2400), mirrored with scrcpy 4.1 under
WSLg. Build: dev client `ai.audric.app`, Metro on `adb reverse tcp:8081`, API on
`adb reverse tcp:3002`. Signed in as `ngocanh30075@gmail.com`, Sui **testnet**,
free plan. Every ✅/❌ below was driven on the running app, not read from code —
code refs are given only where they explain a result.

Feature-vs-web-v3 comparison lives in `PARITY-WEBV3-2026-07-23.md` (165 matrix rows).
This file is only "what did I actually exercise on the device".

---

## 1. Tested and working ✅

### Chat
- Send a text turn → real streamed reply from the gateway (thinking block + text).
- Reasoning ("Thinking") block renders and grows live.
- Message actions: copy + edit on user rows, copy / 👍 / 👎 on assistant rows.
- Follow-up suggestion chips render and are tappable (**but see ❌ D9**).
- Model picker: free tier + locked tier, ZDR footer; locked model → Plans sheet.
- Memory toggle in composer flips.
- Slash-command menu (`/new /clear /model /theme /delete /purge`) opens on `/`.
- `/theme` → full dark mode, clean (**but see ❌ D8** — not persisted).
- Visibility sheet: Private ↔ Public flips the header lock/globe (**❌ D6**).
- New chat clears the thread (**❌ D3** — attachments survive).
- Privacy shield in the header is decorative by design (a `<View>`, not pressable) —
  not a bug.

### Wallet
- Balance card: real USDC 0.00 / SUI 0.85 read from chain.
- Recent activity: 3 real testnet rows with working Suiscan deep links.
- Receive sheet: real QR, real address, Sui-network warning, Copy puts the full
  address on the clipboard (verified the clipboard contents).
- Send sheet — network gate: on testnet no blocking banner (correct);
  `sendUnavailableReason()` is the single source for both the button and the throw.
- Send sheet — balance refetch on open (showed 0.8460 vs the card's rounded 0.85).
- Send sheet — insufficient funds: `5 SUI` → amber banner "Amount exceeds your
  0.8460 SUI balance." and **Allow & Send disabled**.
- Send sheet — invalid recipient: `0xdeadbeef` + 0.001 → error stage
  "Couldn't resolve 0xdeadbeef.", **nothing broadcast**, Close/Retry offered.
- Retry returns to the confirm stage with inputs intact.
- (Real testnet broadcast was proven end-to-end in an earlier session; not repeated
  here to avoid spending the funded balance.)

### Settings
- Passport: handle, "Non-custodial · zkLogin wallet", FREE badge, real address with
  copy, **Network: Sui testnet**, sign-in email, "Session expires Jul 27, 2026".
- Custom instructions: edit → Save → **applied to the next turn** (the model's
  reasoning quoted the instruction verbatim) and **survives a cold app restart**.
- Destructive actions are gated by a confirm dialog ("Forget all your memories?"
  with Cancel / Forget all) — the dialog itself works (**❌ D5** — the action doesn't).
- Refer & earn sheet opens and renders (**❌ D7** — the data is fabricated).
- Plans sheet: Free / Pro $18 / Max $100, billing note, COMING SOON Seal;
  "Get Pro" opens audric.ai in an in-app Custom Tab.

### App-level
- Session survives a cold restart — no re-login.
- Chat history is real and DB-backed: the drawer listed prior threads grouped
  Today / Last 7 days after a relaunch.

---

## 2. Tested and broken ❌

Ordered by severity.

### D1 — CRITICAL: Stop mid-stream hard-freezes the app
Repro: send any text turn, tap **Stop** while the reasoning is streaming.
Result: the turn never finalizes — "Thinking…" spinner and the Stop button stay
forever, and the **entire UI stops responding** (drawer won't open, New chat does
nothing, no further message can be sent). `top` shows `ai.audric.app` pinned at
**93.5% CPU / 927 MB RES** with a `NativeAlloc` GC every ~4 s → a runaway loop on
the JS thread, not just a stuck flag. Only a force-stop recovers it.
Suspect: `stop()` → `useChat`'s abort against the `expo/fetch` streaming reader
(`store.tsx:456-462`, `525-532`) — the aborted reader appears to spin instead of
settling. Needs an isolated repro against `expo/fetch` before choosing the fix.

### D2 — HIGH: the Android keyboard covers the composer and the Send sheet
`(app)/index.tsx:103-107` passes `behavior={Platform.OS === "ios" ? "padding" : undefined}`,
which makes `KeyboardAvoidingView` inert on Android; SDK 57 forces edge-to-edge, so
`adjustResize` no longer does the job either. Observed: with the keyboard up the
composer input, Send button, model picker and Memory toggle are all off-screen —
text has to be typed blind. The slash-command menu is clipped the same way.
**Worse in the wallet**: the Send sheet's amount, recipient and Deny / Allow & Send
buttons are fully hidden behind the keyboard while typing a payment.
Fix direction: explicit `behavior="height"` or `react-native-keyboard-controller`,
plus keyboard avoidance inside `BottomSheet` (it has none).

### D3 — MEDIUM: the paperclip fakes an attachment picker
Tapping 📎 opens **no picker**. It instantly injects three canned attachments (two
gradient tiles — one with a spinner that never resolves — and a "PDF" chip), none of
them badged as demo. They persist across **New chat**, across tab navigation, and
are **not consumed or cleared when a message is sent**.

### D4 — MEDIUM: "Enable Face ID" is a no-op, and the copy is iOS-only
The onboarding step is titled **"Unlock with Face ID"** on Android. Tapping
**Enable Face ID** produces no biometric prompt and no error, even with no
enrolment on the device.

### D5 — MEDIUM (privacy claim): "Forget all my memories" does nothing
The confirm dialog says "This can't be undone", but `doConfirm` (`store.tsx:883-893`)
only branches on `"delete" | "purge"`; the `"forget"` kind falls through and the
dialog just closes. Nothing local is cleared and no server call is made.
Same file: "Delete all chats" / "Purge all my data" clear **local state only** — no
server call — while the copy promises permanent removal.

### D6 — MEDIUM: Public visibility never produces a link
The sheet promises "Make a single chat public to share a read-only link". Selecting
Public flips the header lock → globe and nothing else: no link, no copy, no share.

### D7 — MEDIUM: fabricated referral data shown as real
Refer & earn shows `https://audric.ai/r/you-a1b2`, **3 Referrals**, **$30 Earned**,
**#142 Rank** — all constants, with a live-looking Share button.

### D8 — LOW: theme choice is not persisted
`/theme` → dark works, but a cold restart comes back light.

### D9 — (from the parity pass, matches what the device shows) all three empty-state
follow-up chips route into canned demo output — `catalog.ts:120-124` prompts all
match `classify()`'s image/video/artifact regexes, so the happy path a new user taps
first never reaches a model.

### D10 — LOW: onboarding replays on every cold launch
Re-confirmed this session: force-stop → relaunch drops back into the onboarding
carousel (resuming mid-deck, at the "Private by default" card) even though the
session is still valid.

### D11 — LOW: image demo tile is over-claimed
In-thread the placeholder is honestly badged "Demo · not generated", but the tile
carries a burned-in **"AI · IMAGE"** watermark and a download button; the download
button opens the fullscreen viewer instead of saving anything, and the viewer's
Details pane shows a hardcoded `Model: Audric · Image` + prompt.

---

## 3. Not tested yet ⏳

- `/clear`, `/delete`, `/purge` end-to-end (the confirm dialog is proven via
  "Forget all my memories", but the delete/purge branches were not driven).
- Message **edit** and **regenerate** paths.
- 👍/👎 persistence (the buttons render; the vote is discarded per the parity pass).
- Opening a **past thread** from the drawer (rehydrate from `/api/messages`).
- Per-thread **⋯ menu** in the drawer (rename / delete a single chat).
- Handle sheet ("Claim a handle") — opened only as far as the row.
- Account menu (avatar row at the drawer bottom) and **Sign out**.
- Artifact viewer, nudge dialog, context sheet.
- Developer API row (external link), Privacy Policy / Terms links.
- Billing & plans row from Settings (the Plans sheet was reached via a locked model).
- **Expired-session launch path** — still only unit-tested on the predicate.
- Offline / airplane-mode behaviour, and error copy when the API is unreachable.
- Real testnet **broadcast** was not re-run today (proven in an earlier session).

---

## 4. Corrections to earlier notes

- Recent activity is **not** mock data — the rows are real testnet transactions read
  through the same `@t2000/sdk` readers web-v3 uses; the first Wallet paint shows
  "No activity yet." for ~1 s before they land.
- Chat persistence **does** work here — the drawer rehydrated real threads after a
  cold restart, so the earlier `POSTGRES_URL` timeout was transient/network, not a
  standing condition.
- The dev-client warning "Cannot connect to Expo CLI … 10.0.2.2:8081" is a dev-client
  artifact when the app backgrounds (e.g. for the Custom Tab). Not a product defect.
