# Emulator test checklist — 2026-07-23

Device: `audric_test` (Android 15 / API 35, 1080x2400), mirrored with scrcpy 4.1 under
WSLg. Build: dev client `ai.audric.app`, Metro on `adb reverse tcp:8081`, API on
`adb reverse tcp:3002`. Signed in as `ngocanh30075@gmail.com`, Sui **testnet**,
free plan. Every ✅/❌ below was driven on the running app, not read from code —
code refs are given only where they explain a result.

Feature-vs-web-v3 comparison lives in `PARITY-WEBV3-2026-07-23.md` (165 matrix rows).
This file is only "what did I actually exercise on the device".

**Status (2026-07-23 fix pass):** all 11 defects D1–D11 have code fixes in the working
tree. §2 now records each fix + how it was verified. Working tree only — **not committed**.
Verification legend: **LIVE** = re-driven on the device this pass; **CODE** = fix confirmed
in the diff but not re-exercised on-device (needs onboarding/attachment UI or a destructive
DB write to reach).

---

## 1. Tested and working ✅

### Chat
- Send a text turn → real streamed reply from the gateway (thinking block + text).
- Reasoning ("Thinking") block renders and grows live.
- Message actions: copy + edit on user rows, copy / 👍 / 👎 on assistant rows.
- **Edit message** — tapping edit loads the row back into the composer for resend.
- **Vote 👍** — teal highlight applied on tap.
- Follow-up suggestion chips render and are tappable (now text prompts — see D9).
- Model picker: free tier + locked tier, ZDR footer; locked model → Plans sheet.
  Premium models 🔒-gated correctly for the Free plan.
- Memory toggle in composer flips.
- Slash-command menu (`/new /clear /model /theme /delete /purge`) opens on `/`.
- `/theme` → full dark mode, clean (now persisted — see D8).
- New chat clears the thread (attachment fake removed — see D3).
- **Open a past thread** from the drawer → rehydrates from `/api/messages` and paints
  the full history (round-trip over the tunnel is ~1–2 s, so wait before reading it).
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
- Send sheet — **keyboard no longer covers the inputs/buttons** (see D2).
- Retry returns to the confirm stage with inputs intact.
- (Real testnet broadcast was proven end-to-end in an earlier session; not repeated
  here to avoid spending the funded balance.)

### Settings
- Passport: handle, "Non-custodial · zkLogin wallet", FREE badge, real address with
  copy, **Network: Sui testnet**, sign-in email, "Session expires Jul 27, 2026".
- Custom instructions: edit → Save → **applied to the next turn** (the model's
  reasoning quoted the instruction verbatim) and **survives a cold app restart**.
- Destructive actions gated by a confirm dialog — dialog opens, **Cancel** closes it
  cleanly (the underlying actions are now wired — see D5; the destructive paths were
  Cancelled, not run, to protect the live account).
- Refer & earn sheet opens and renders honest "coming soon" copy (see D7).
- Plans sheet: Free / Pro $18 / Max $100, billing note, COMING SOON Seal;
  "Get Pro" opens audric.ai in an in-app Custom Tab. Reached both via a locked model
  and via the Billing row.

### App-level
- Session survives a cold restart — no re-login.
- Chat history is real and DB-backed: the drawer listed prior threads grouped
  Today / Last 7 days after a relaunch.

---

## 2. Fixed this pass ✅ (was §2 "broken")

Ordered by original severity. Each entry: the fix + how it was verified.

### D1 — CRITICAL: Stop mid-stream hard-freezes the app → **FIXED (CODE + prior LIVE)**
Root cause: the aborted `expo/fetch` streaming reader spun on the JS thread instead of
settling. Fix: `store.tsx` wraps the transport in a `streamingFetch` that owns the
reader lifecycle so `stop()` settles the reader cleanly instead of looping.
Verified: Stop-clean was driven on-device in the prior session (no CPU pin, UI stays
responsive); fix confirmed present in the current tree.

### D2 — HIGH: Android keyboard covers the composer and the Send sheet → **FIXED (LIVE)**
Fix: dropped the inert `KeyboardAvoidingView` and drive content up from global
`Keyboard` events. `(app)/index.tsx` ChatTab animates an `Animated.Value` `kbLift`
into `paddingBottom` on `keyboardDidShow/Hide`; `components/ui/sheet.tsx` `BottomSheet`
has its own `kbLift` and `translateY = Animated.subtract(slide, kbLift)`, both lifting
by `keyboardHeight − insets.bottom`.
Verified LIVE: composer stays above the keyboard in chat, and the Send sheet's
amount / recipient / buttons stay visible while typing a payment.

### D3 — MEDIUM: paperclip fakes an attachment picker → **FIXED (CODE)**
Fix: removed the fake entirely (per the "remove the fake" decision) — `composer.tsx`
−215 lines, `conversation.tsx` −33 lines; the 📎 no longer injects canned attachments.
Verified: fix confirmed in the diff. Not re-driven on-device (the button is gone, so
there is nothing left to tap).

### D4 — MEDIUM: "Enable Face ID" no-op + iOS-only copy → **FIXED (CODE)**
Biometric infra was already wired; this was a copy fix. `onboarding-screen.tsx` now
labels the step from the device capability: `const label = cap?.label ?? "Biometrics"`
→ "Unlock with {label}" / "Enable {label}" (Face ID / Fingerprint / Biometrics).
Verified: fix confirmed in the diff. Not re-driven — reaching it means replaying the
onboarding deck.

### D5 — MEDIUM (privacy claim): privacy actions did nothing → **FIXED (CODE, LIVE dialog)**
Fix: wired the three actions against the shared Neon DB via new mobile `+api.ts` routes
(the "wire real" decision). `store.tsx` now calls: `deleteAllChats` → `DELETE /api/history`,
`purgeAllData` → `POST /api/account/purge`, `forgetMemory` → `POST /api/account/forget-memory`
(new `app/api/account/` dir + `queries.ts`/`schema.ts` support).
Verified: the Delete-all **confirm dialog opened and Cancelled cleanly** on-device.
The destructive branches themselves are **CODE-verified only** — deliberately not run,
because they irreversibly wipe the live account's real chat history / memory.
Hardening (post-review): `fetch()` doesn't reject on 401/500, so each action now gates
on `res.ok` — an HTTP-level failure restores the list (`loadHistory()`) and surfaces an
`Alert`, instead of leaving the UI wiped while the server still holds the data (a false
"deleted" state on the privacy hub). `deleteChat` got the same `res.ok` gate.

### D6 — MEDIUM: Public visibility never produces a link → **FIXED (CODE)**
Public share isn't built, so per the "relabel coming-soon" decision the Public row in
`visibility-sheet.tsx` is now a non-interactive `<View>` with a "Coming soon" badge and
subtitle "Public read-only share links are coming soon."; only Private is selectable.
Verified: fix confirmed in the diff.

### D7 — MEDIUM: fabricated referral data shown as real → **FIXED (LIVE)**
Fix: `referral-sheet.tsx` (−81 net) replaced the fake link / 3 Referrals / $30 Earned /
#142 Rank with honest "coming soon" copy; `catalog.ts` dropped `REFERRAL_LINK` +
`REFERRAL_STATS` (flagged as fabrications).
Verified LIVE: the sheet renders the coming-soon copy, no fabricated stats.

### D8 — LOW: theme choice not persisted → **FIXED (LIVE — cold-start proven)**
Fix: `prefs.ts` adds `loadThemeOverride()/saveThemeOverride()` (SecureStore);
`theme.tsx` ThemeProvider loads the persisted override on mount and `setOverride`
writes it through.
Verified LIVE: `/theme` → dark, then **force-stop → cold launch** → app returned in
dark. Previously it came back light; the override now survives a true cold start.

### D9 — MEDIUM: follow-up chips route into canned demo output → **FIXED (CODE)**
Fix: `catalog.ts` FOLLOWUPS changed from media prompts (Generate a logo / Make a video /
Draft announcement — which hit `classify()`'s image/video/artifact regexes) to text
prompts: "Explain it more simply", "What are the trade-offs?", "Find recent sources" —
all of which reach a model.
Verified: fix confirmed in the diff. (Empty-state suggestion chips were always
text — balance / privacy / news — and already reached a model.)

### D10 — LOW: onboarding replays on every cold launch → **FIXED (LIVE — cold-start proven)**
Fix: `prefs.ts` adds `loadOnboarded()/saveOnboarded()` (SecureStore); `store.tsx`
loads the flag on mount behind an `onboardReady` gate, `finishOnboarding` writes
`saveOnboarded(true)`, and the shell holds a blank frame until the flag is read so a
returning user never sees an onboarding frame.
Verified LIVE: **force-stop → cold launch** landed straight on the chat empty-state
("Private AI, truly yours"), NOT the onboarding carousel. The persisted flag survives
a true cold start.

### D11 — LOW: image demo tile over-claimed → **FIXED (CODE)**
Fix: `image-fullscreen.tsx` chip is now `"Demo · not generated"`, the Details pane
states plainly it's a demo placeholder with no model run, and the no-op copy/download
buttons were removed.
Verified: fix confirmed in the diff.

---

## 3. Not tested yet ⏳

Highest-value gaps first.

- **Destructive privacy paths** run to completion — Delete-all / Purge / Forget-memory
  actually hitting the DB. Not run on the live account (irreversible); needs a throwaway
  account or explicit opt-in.
- **Real testnet broadcast** — not re-run today (proven in an earlier session; avoided to
  preserve the funded balance).
- **Regenerate** an assistant turn (edit was driven; regenerate was not).
- 👍/👎 **persistence** across reload (the vote highlight renders; persistence unproven).
- Per-thread **⋯ menu** in the drawer (rename / delete a single chat).
- Handle sheet ("Claim a handle") — opened only as far as the row.
- Account menu (avatar row at the drawer bottom) and **Sign out** (view only — not
  signed out, to keep the session).
- Artifact viewer, nudge dialog, context sheet.
- Developer API row / Privacy Policy / Terms external links (`Linking.openURL`).
- **Expired-session launch path** — session valid until Jul 27, so still only
  unit-tested on the predicate.
- Offline / airplane-mode behaviour, and error copy when the API is unreachable.
- Memory toggle **ON** end-to-end (recall injected into a turn).

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
- The "past thread opened empty" scare was a **timing/mis-tap artifact** (only waited
  ~1.3 s; the DB round-trip over the tunnel is slower) — a longer wait showed the thread
  fully hydrated. `store.tsx` `openChat` + `messages+api.ts` are both correct.
