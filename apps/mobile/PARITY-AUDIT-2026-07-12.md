# Web ⇄ Mobile Parity Audit — 2026-07-12

> Full-surface comparison: **web-v3 main** (live audric.ai feature set) vs **apps/mobile**
> (this branch, post Phase-0 pass). Built from a file-level sweep of both codebases.
> This is the gap list funkii asked for — work it top-down after B2.
>
> Legend: ✅ parity (real on both) · 🟠 partial / mock on mobile · ❌ missing on mobile
> · ➕ mobile-only · ⬜ not on web either (non-gap, listed to prevent false "gaps")

---

## 0. The one structural finding that explains most rows

**Mobile runs its own parallel BFF instead of web-v3's backend.** The Expo server
routes (`src/app/api/chat+api.ts` etc.) reimplement a thin slice of web-v3's
`/api/chat`: same gateway + ZDR flag + persistence, but **only one tool
(`web_search`)** — no finance/wallet/image/video/document tools, **no credit
metering, no rate limits, no entitlements, no memory, no followups, no votes**.
`SPEC_AUDRIC_MOBILE.md` locked the opposite: *"the mobile app is just another
client of Audric's existing private backend (`apps/web-v3`)."*

The mobile session token already IS web-v3's `audric_session` (B1) — the Bearer
verifies against web-v3's routes as-is. **Recommendation: point the chat
transport (and history/messages/vote/followups) at web-v3's routes and delete
the parallel BFF.** That single change closes most 🟠/❌ rows in §2–§4 at once
and kills the drift class permanently. Decide this BEFORE porting tools
one-by-one into the Expo BFF.

---

## 1. Composer

| Feature (web behavior) | Mobile | Notes |
|---|---|---|
| Text input, send, stop | ✅ | |
| Attachments: picker + drag + paste, JPEG/PNG/WebP/GIF/PDF, 4MB route / >4MB blob | ❌ | Mobile `attachDemo` shows static tiles, nothing uploads |
| Attachment vision gating (non-vision model warning) | ✅ | Real check vs `VISION_MODELS` |
| Model selector: popover, grouped by provider, live `/api/models` (pricing, capabilities, extended catalog), hover detail panel | 🟠 | Bottom sheet is the right mobile idiom, but data is static `catalog.ts` — wire to `/api/models` |
| Premium model lock → upgrade | ✅ | Locked rows open Plans |
| Confidential mode (GPU-TEE): tab, emerald glow, TEE model selector, text-only strip | ❌ | Absent entirely |
| Mode tabs Private / Confidential / Computer(soon) | ❌ | Mobile has no mode tabs |
| Memory toggle (authed + env-gated, opt-in) | 🟠 | Toggle renders; `memoryOn` never reaches the chat route |
| Context/usage indicator (real tokens + turn cost) | 🟠 | Hidden (`ctxShow=false`); static `CTX` data behind it |
| Out-of-credit banner (zero credit + premium model) | ❌ | No credit state on mobile at all |
| Slash: `/new` `/clear` `/model` | ✅ | |
| Slash: `/delete` `/purge` | 🟠 | Mobile clears CURRENT thread only; web wipes for real |
| Slash: `/theme` | 🟠 | Inert on mobile; real on web |
| Slash: `/rename` | ⬜ | Stub toast on web too |
| Suggested starter chips (auto-send; confidential variants; authed wallet chip) | 🟠 | Canned list; balance/send taps route into the mock classifier, not real turns |
| Deep-link prefill `?q=` / `?query=` / `?draft=` | ❌ | N/A-ish for native, but agent-commerce links depend on it — decide |
| Voice input | ⬜ | Not on web either |

## 2. Message rendering

| Feature | Mobile | Notes |
|---|---|---|
| Markdown answer + code blocks | ✅ | |
| CoT timeline (reasoning, searches, parsed files, duration) | ✅ | |
| Web search: results grid + related images above answer | 🟠 | Mobile shows sources in CoT only; no Perplexity-style grid |
| Image search results grid | ❌ | Tool not registered on mobile BFF |
| Finance cards: `balance_check` table, `crypto_market` price card, `crypto_history` chart, `stock_analysis` card | ❌ | Mobile fakes a "wallet card" via keyword classifier + 1.6s timer |
| `send_transfer` tap-to-confirm card (Allow/Deny → client zkLogin sign → Suiscan link) | ❌ | **This is B2's core UI** |
| `save_memory` inline confirmation | ❌ | |
| Inline image gen (+ lightbox, copy/download, limit/sign-in cards) | 🟠 | Mock gradient card + inert fullscreen viewer |
| Inline video gen | 🟠 | Mock static card |
| Documents/artifacts: preview card + split panel (text/code/image/sheet), versions, diff | 🟠 | Mock read-only viewer |
| `requestSuggestions` tool card | ❌ | |
| Follow-up chips from `/api/followups` | 🟠 | Canned `FOLLOWUPS`; taps trigger mock turns |
| Votes → `PATCH /api/vote` | 🟠 | Local `useState` only |
| Copy message | ✅ | |
| Edit message → resubmit/regenerate | 🟠 | Mobile only loads text into composer; no regenerate |
| "Open as document" (≥400 chars → artifact) | ❌ | |
| Auto-routed model badge ("Auto · {model}") | ❌ | Auto works server-side; badge missing |
| Confidential badge + verify-receipt modal | ❌ | With Confidential mode |
| Public/readonly shared view | ❌ | No share at all on mobile |

## 3. Drawer / history (web sidebar)

| Feature | Mobile | Notes |
|---|---|---|
| New chat | ✅ | |
| History list, recency grouping, open thread | ✅ | Real Neon-backed |
| Pagination / infinite scroll (20/page) | 🟠 | Mobile loads in one shot — fine until histories grow |
| Delete single chat | ✅ | Optimistic + `DELETE /api/chat` |
| Delete ALL chats (sidebar + `/purge`) | 🟠 | Current-thread-only on mobile |
| Per-chat visibility Private/Public (share by link) | 🟠 | Menu rows are no-ops; no DB field written |
| Anon "login to save" placeholder | 🟠 | Guest state unreachable (see §6) |
| Invite & earn card → referral modal | 🟠 | Sheet exists, data is catalog mock, Share inert |
| User nav: plan badge, credit, USDC readout | 🟠 | Account menu shows catalog identity (`USER_HANDLE`), not `session` |
| **Account menu Sign out** | 🐛 | `onPress={() => {}}` — dead button (Settings sign-out works) |

## 4. Wallet / Passport

Web has no wallet *tab* — wallet lives in chat tools + Settings/Billing. Mobile
has a dedicated tab (good mobile idiom) that is 100% mock. B2 fills this.

| Feature | Mobile | Notes |
|---|---|---|
| Balance (web: sidebar readout + `balance_check` tool + `/api/wallet/balance`) | 🟠 | Hardcoded 124.50 USDC constants |
| Send USDC/USDsui (confirm card, gasless, client-signed) | 🟠 | Fake 1.4s timer + fake digest. Real path needs the SecureStore ephemeral material (already persisted by the Phase-0 nonce fix) |
| Receive: address display + copy | 🟠 | Catalog `WALLET_ADDRESS`, copy inert — swap to `session.address` |
| Receive: QR | ➕ | Mobile-only surface (web has none) — but the QR is a fake matrix; encode the real address |
| Transaction history (web: tool-only, no card) | 🟠 | Mobile static list; could exceed web here with a real card |
| Onramp: buy USDC with card (Stripe embedded) | ❌ | Web-only |
| Credit top-up with USDC/USDsui from Passport | ❌ | Billing buttons are inert `View`s |
| Handle claim (`@audric` identity APIs) | 🟠 | Sheet fakes availability, no mint |
| SuiNS resolve (agent tool) | ❌ | Comes with backend convergence |

## 5. Settings / account / billing

| Feature | Mobile | Notes |
|---|---|---|
| Passport card: handle, address, email, network, session expiry | 🟠 | ALL from catalog mock — bind to `useAuth().session` (address/email/expiresAt are already in the keychain) |
| Private Memory toggle + forget-all (env-gated on web) | 🟠 | Toggle local; "forget" confirm not even handled in `doConfirm` |
| Custom instructions (2000 chars, per-user, applies every turn) | 🟠 | Local text, Save = close; web has `/api/account/custom-instructions` |
| Refer & earn (real link, stats, rank) | 🟠 | Catalog stats, inert Share |
| Developer API pointer (links out to agents.t2000.ai) | 🟠 | Row has no `onPress` |
| Delete all chats / Purge all data (real wipe routes) | 🟠 | Current-thread only |
| Delete account | ⬜ | Web doesn't have it either (purge only) |
| Privacy Policy / Terms links | 🟠 | Plain text, no `Linking` |
| Billing: credit balance, top-up presets, auto-recharge, invoices, payment methods, subscription status | 🟠 | Display shells; only the "Manage on web" hand-off is real. In-app purchase = Fork A (IAP) — deliberate later phase |
| Upgrade modal / Stripe embedded checkout | 🟠 | PlansSheet display + web hand-off (acceptable pre-Fork-A) |
| Theme (system default, persisted, `/theme`) | 🟠 | Account-menu toggle works but isn't persisted; not in Settings; slash inert |
| Sign out (Settings) | ✅ | |

## 6. Auth, guest, limits

| Feature | Mobile | Notes |
|---|---|---|
| Google zkLogin → same Sui address | ✅ | **Phase 0 passed 2026-07-12** |
| 7-day session, expiry display | 🟠 | Token + expiresAt stored; Settings shows hardcoded "7d" |
| Biometric app-lock | ➕ | Mobile-only, real. (Onboarding "Enable Face ID" step doesn't actually call `setLockEnabled` — 🐛) |
| Anonymous/guest mode (web: free models, 5 msg/hr/IP, no persistence) | 🟠 | Guest UI + nudge exist but `guest=true` is unreachable — enable or delete (delete-first says delete unless anon acquisition matters on mobile) |
| Sign-in nudge (3 anon turns / rate limit) | 🟠 | Wired but dead with guest mode |
| Free-tier limits (20/day) + credit metering + burst guards | ❌ | **Mobile BFF has zero metering/limits — free frontier usage if shipped as-is.** Fixed by backend convergence (§0) |
| Referral capture (`?ref=` cookie) | ❌ | Needs a deep-link equivalent |

## 7. Media generation

| Feature | Mobile | Notes |
|---|---|---|
| Image generate (15/day free) / edit / upscale + limit cards | ❌ | Mock card only |
| Video generate (1/day free, Pro beyond) | ❌ | Mock card only |
| All media tools + gating | ❌ | Come with backend convergence + inline image/video components |

## 8. Privacy surface

| Feature | Mobile | Notes |
|---|---|---|
| ZDR routing (`zeroDataRetention: true`) | ✅ | Mobile BFF sets it too |
| Privacy badges in switcher (Private/ZDR) | ✅ | Static but accurate |
| Confidential inference + receipts + verify | ❌ | §1/§2 |
| Private Memory (Walrus) backend | ❌ | Toggle inert |
| Seal E2E chats / Walrus backup | ⬜ | "Coming soon" on web too |

## 9. Bugs found during audit (fix regardless of parity)

1. **Account menu Sign out is a no-op** (`onPress={() => {}}`) — `drawer.tsx`/`account-menu.tsx`.
2. **Onboarding "Enable Face ID" doesn't enable the lock** — calls `finishOnboarding()` only.
3. **"Forget all memories" confirm falls through** — `doConfirm` handles only `delete`/`purge`.
4. **Onboarding wallet step shows catalog `WALLET_ADDRESS`** — real address exists in session by that point.
5. Guest nudge machinery is dead code until guest mode is decided (§6).

---

## 10. UI/UX parity (visual — verified against live screenshots, 390pt width)

Compared web-v3 at iPhone width (:3002, device emulation) against the simulator
side-by-side on 2026-07-12. Verdict per layer:

### Tokens / theme / typography — ✅ effectively at parity
- Dark palette matches web's `globals.css` almost exactly (`bg #151515` =
  `oklch(.195)`, `card #1c1c1c` = `.225`, `border #262626` = `.27`, `fg
  #ebebeb` = `.94`). One drift: web's `--muted` moved to `.165` (darker than
  bg); mobile's `muted`/`secondary` are still `.26`.
- Geist / Geist Mono on both. Radius/spacing language matches (rounded-2xl
  cards, pill chips).
- **Accent drift:** mobile leans on teal `#0ac7b4` for CTAs (gate button,
  plans CTAs, suggestion bullets). Web reserves teal for the wordmark +
  privacy accents — primary buttons are foreground-on-dark (white). This is
  why the gate screen reads "off-brand". Align mobile CTAs to the web pattern.

### Idiom adaptations — ✅ correct, keep
Popover → bottom sheet, sidebar → drawer, hover panel → inline rows,
settings page → tab. These SHOULD differ on touch; not gaps.

### Drifted surface designs — 🟠 the real UI/UX gaps
| Surface | Web (main, at phone width) | Mobile today |
|---|---|---|
| **Empty-state hero** | lowercase `audric private` wordmark (teal "private") + "What can I help with?" | Audric dots mark + "Private AI, truly yours" + tagline (old prototype copy) |
| **Starter suggestions** | 3 pill CHIPS below composer, media-led (Generate image / Research a topic / Create a video), auto-send real turns | 3 full-width list ROWS above composer, wallet-led (balance / privacy / send) — 2 of 3 route into MOCK demo turns |
| **Composer control row** | attach · sparkle model trigger · **mode tabs: Private (shield) / Confidential (lock·Pro) / Computer (Soon)** · submit; cycling capability placeholder | attach · "Auto ⌄" text chip · Memory toggle · submit; static "Message Audric…" placeholder. No mode tabs at all |
| **Model switcher** | Minimal v0-style popover: "Available" heading, provider logos, lock on premium, check on selected — ALL detail in a side hover panel | Dense sheet: search box + rows carrying price/caps/badge inline (the old pre-redesign web design) |
| **Chat header** | sidebar toggle · visibility pill ("Private ⌄") · privacy shield right | drawer toggle · **"Free plan / Upgrade" pill** · lock visibility · shield · new-chat (plan pill lives in web's sidebar user-nav, not the header) |
| **Message follow-ups** | chips from `/api/followups` | same chip UI, canned data |

**Sequencing note:** don't pixel-polish surfaces that P1 (backend convergence)
or B2 will rebuild anyway — fold the composer/mode-tabs/switcher/empty-state
redesign into those tasks. The token-level fixes (teal CTA → foreground CTA,
`muted` value) are cheap and can land anytime.

## Recommended order (post-B2-start)

1. **P0 — truth + money (B2):** bind `session.address`/email everywhere
   (Settings Passport, drawer tile, receive, onboarding wallet step) · real
   balance read · real receive QR · `send_transfer` confirm card with client
   zkLogin signing (ephemeral material already in SecureStore) · fix bugs §9.
2. **P1 — backend convergence (§0):** chat transport → web-v3 `/api/chat` with
   Bearer; history/messages/vote/followups likewise; model sheet → `/api/models`;
   delete the keyword mock classifier + demo cards. This closes metering/limits
   (the free-frontier hole), tools, memory, votes, followups in one move.
3. **P2 — surfaces:** attachments upload · inline image/video rendering ·
   visibility/share · real delete-all/purge · custom instructions · referral ·
   memory toggle wiring · guest-mode decision.
4. **P3 — later phases:** Confidential mode + verify · artifacts panel ·
   context/usage meter · in-app billing (Fork A IAP) · theme persistence · push.
