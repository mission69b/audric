# Feature parity: `apps/web-v3` (canonical) vs `apps/mobile`

Date: 2026-07-23 · Read-only audit · No source files were modified.

## Method

Read, in this order:

**web-v3**
- Every `route.ts` under `apps/web-v3/app` (40 handlers, excluding the ~20 `app/v1/**` OpenAI-compatible/agent routes) and every page under `app/(chat)`, `app/blog`, `app/checkout`, `app/auth`.
- `app/(chat)/api/chat/route.ts` in full (1222 lines) — the authoritative tool roster is the `activeTools` arrays (`:736`) plus the `tools: {}` object (`:903`–`:1000`), not the file list in `lib/ai/tools/`.
- `lib/ai/models.ts`, `lib/ai/prompts.ts`, `lib/ai/intelligence/router.ts`, `lib/ai/entitlements.ts`.
- `components/chat/*` (70 files) — read in full: `multimodal-input.tsx`, `message-actions.tsx`, `slash-commands.tsx`, `visibility-selector.tsx`, `sidebar-history.tsx`, `artifact.tsx`, `toolbar.tsx`.
- `app/(chat)/settings/page.tsx` (612) and `app/(chat)/settings/billing/page.tsx` (661), section by section.
- `app/(auth)/auth.ts`, `lib/audric-auth.ts`.

**mobile**
- `src/app/api/*+api.ts` (all 6), `src/app/_layout.tsx`, `src/app/gate.tsx`, `src/app/(app)/index.tsx`.
- `src/app-state/store.tsx` (1131) and `src/app-state/catalog.ts` (396) in full — then grepped every catalog constant for real usages, to separate *dead* prototype data from data that is *actually rendered*.
- `src/components/**` (chat, wallet, settings, nav, onboarding, auth, ui) — every screen and sheet.
- `src/lib/ai/{providers,prompts}.ts`, `src/lib/ai/tools/{web-search,balance-check}.ts`, `src/lib/wallet/{send,signer,keys,screen-write}.ts`, `src/lib/wallet-data.ts`, `src/lib/api-guard.ts`, `src/lib/prefs.ts`.

Not run: no servers started, no git mutations, no `.env` values read or printed.

---

## Matrix

**137 rows.** Status key: `PARITY` · `PARTIAL` · `MISSING` · `MOBILE-ONLY` · `STUB/DEMO`.

### Chat

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| Streamed chat turn (AI SDK 7 UI message stream) | Yes, `streamText` → `toUIMessageStream` | Yes, `streamText` → `toUIMessageStreamResponse` | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:903`, `apps/mobile/src/app/api/chat+api.ts:166` |
| Zero-data-retention gateway flag | Yes | Yes | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:890`, `apps/mobile/src/app/api/chat+api.ts:183` |
| Model picker | 5 models + Auto, entitlement-gated | Same 6 rows, no entitlement gate | PARTIAL | `apps/web-v3/lib/ai/models.ts:78-132`, `apps/mobile/src/app-state/catalog.ts:27` |
| Auto model router (classify → pick model/effort/step budget) | Yes | No — `"auto"` hard-maps to Kimi | PARTIAL | `apps/web-v3/lib/ai/intelligence/router.ts`, `apps/web-v3/app/(chat)/api/chat/route.ts:281`, `apps/mobile/src/lib/ai/providers.ts` |
| Premium-model entitlement / metering gate | Yes (credit balance + tier) | No — paid ids bill the gateway key directly | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:17,196`, `apps/mobile/src/lib/ai/providers.ts` (comment: "web-v3's entitlement/metering gate is not ported") |
| Step budget for multi-step tool loops | 5 default / 12 for research / router-driven | Fixed 6 | PARTIAL | `apps/web-v3/app/(chat)/api/chat/route.ts:841`, `apps/mobile/src/app/api/chat+api.ts:178` |
| Reasoning parts on the wire | `sendReasoning` (reasoning models only) | `sendReasoning: true` always | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:1015`, `apps/mobile/src/app/api/chat+api.ts:200` |
| Sources on the wire | `sendSources: true` | `sendSources: true` | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:1016`, `apps/mobile/src/app/api/chat+api.ts:201` |
| Chain-of-thought timeline UI | `components/ai-elements/chain-of-thought.tsx`, `cot-timeline.tsx` | `components/chat/cot-timeline.tsx` for real turns | PARITY | `apps/web-v3/components/chat/cot-timeline.tsx`, `apps/mobile/src/components/chat/cot-timeline.tsx` |
| Token-usage message metadata | Full usage (input/output/total/reasoning/cached) on start+finish | Only `{createdAt, modelId}` on start | PARTIAL | `apps/web-v3/app/(chat)/api/chat/route.ts:1020`, `apps/mobile/src/app/api/chat+api.ts:206-209` |
| Context-usage meter | Live, driven by real usage | Hidden (`ctxShow = false`); sheet exists with static numbers | MISSING | `apps/web-v3/components/ai-elements/context.tsx`, `apps/mobile/src/components/chat/composer.tsx:79` |
| Attachments (image / PDF upload) | Real upload → private blob | Fake 3-tile strip, no picker, no upload | STUB/DEMO | `apps/web-v3/components/chat/multimodal-input.tsx:787,973`, `apps/mobile/src/components/chat/composer.tsx:114,227` |
| Vision-model gating on attachments | Yes | Yes, but gates the fake strip | STUB/DEMO | `apps/web-v3/components/chat/multimodal-input.tsx:238`, `apps/mobile/src/components/chat/composer.tsx:80` |
| Confidential (GPU-TEE) mode toggle + phala model picker | Yes, live | Absent | MISSING | `apps/web-v3/components/chat/multimodal-input.tsx:214,877-892` |
| Slash commands | 7 (`new clear rename model theme delete purge`) | 6 (no `rename`) | PARTIAL | `apps/web-v3/components/chat/slash-commands.tsx:25-61`, `apps/mobile/src/app-state/catalog.ts:134-143` |
| Message action: copy | Yes | Yes | PARITY | `apps/web-v3/components/chat/message-actions.tsx:143`, `apps/mobile/src/components/chat/conversation.tsx:397` |
| Message action: edit user message + resubmit | Yes | Absent | MISSING | `apps/web-v3/components/chat/message-actions.tsx:134` |
| Message action: regenerate | Not wired (`regenerate: _regenerate`, unused) | Absent | PARITY | `apps/web-v3/components/chat/message.tsx:79` |
| Message action: upvote / downvote | Yes, persisted via `/api/vote` | Local `useState` only, never POSTed | PARTIAL | `apps/web-v3/components/chat/message-actions.tsx:176,235`, `apps/mobile/src/components/chat/conversation.tsx:445` |
| Message action: open as document | Yes | Absent | MISSING | `apps/web-v3/components/chat/message-actions.tsx:166` |
| Stop generation | Yes | Yes (also cancels the demo timer) | PARITY | `apps/mobile/src/app-state/store.tsx:691` |
| Chat visibility private/public + share | Real, persisted (`useChatVisibility`) | Sheet exists, local state only, no backend | STUB/DEMO | `apps/web-v3/components/chat/visibility-selector.tsx:20,52`, `apps/mobile/src/components/chat/visibility-sheet.tsx`, `apps/mobile/src/app-state/store.tsx:341` |
| Chat history list | Sidebar, DB-backed, grouped by recency | Drawer, DB-backed, grouped by recency | PARITY | `apps/web-v3/components/chat/sidebar-history.tsx`, `apps/mobile/src/app-state/store.tsx:290,555` |
| Open a past chat | Yes | Yes (`/api/messages`, owner-checked) | PARITY | `apps/mobile/src/app-state/store.tsx:619`, `apps/mobile/src/app/api/messages+api.ts` |
| Delete a single chat | Yes | Yes (`DELETE /api/chat`, owner-checked) | PARITY | `apps/mobile/src/app-state/store.tsx:657`, `apps/mobile/src/app/api/chat+api.ts:246` |
| Rename a chat | Yes | Absent (slash command deliberately removed) | MISSING | `apps/web-v3/components/chat/slash-commands.tsx:37`, `apps/mobile/src/app-state/catalog.ts:136-137` |
| Empty-state suggestion chips | Dynamic | 3 static chips | PARTIAL | `apps/mobile/src/app-state/catalog.ts:113`, `apps/mobile/src/components/chat/empty-state.tsx` |
| Follow-up suggestions after a turn | Model-generated via `/api/followups` | 3 hardcoded chips, all routing into demo paths | STUB/DEMO | `apps/web-v3/app/(chat)/api/followups/route.ts`, `apps/mobile/src/app-state/catalog.ts:120-124`, `apps/mobile/src/components/chat/conversation.tsx:242-247` |
| Artifacts pane (text/code/image/sheet, versions, diff, toolbar) | Full system | Viewer with hardcoded title/status/version, inert toolbar | STUB/DEMO | `apps/web-v3/components/chat/artifact.tsx`, `apps/web-v3/components/chat/toolbar.tsx`, `apps/mobile/src/components/chat/artifact-viewer.tsx:48,111` |
| Image lightbox | Real generated image + metadata | Gradient + hardcoded model/prompt strings | STUB/DEMO | `apps/mobile/src/components/chat/image-fullscreen.tsx:9-10,50` |
| Custom instructions injected into system prompt | Yes (server-stored) | Yes (device-stored, sent per request, fenced) | PARITY | `apps/web-v3/app/(chat)/api/account/custom-instructions/route.ts`, `apps/mobile/src/app/api/chat+api.ts:162-164` |
| Memory toggle in composer | Yes → gates `save_memory` + recall | Toggle renders, value never leaves the device | STUB/DEMO | `apps/web-v3/app/(chat)/api/chat/route.ts:790`, `apps/mobile/src/app-state/store.tsx:348`, `apps/mobile/src/components/chat/composer.tsx:63` |
| Message persistence to Postgres | Yes | Yes (uuid chatId + Sui-address userId + `POSTGRES_URL`) | PARITY | `apps/mobile/src/app/api/chat+api.ts:122-143,212-227` |
| Rate limiting / anon quota / full Zod body validation | Yes (IP rate-limit on anon surface) | No — only size caps | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:304`, `apps/mobile/src/app/api/chat+api.ts:32-41` (self-documented gap) |
| Guest / anonymous try-before-signup | Yes, free-model-only, no persistence | Yes, plus a 3rd-turn sign-in nudge | PARITY | `apps/mobile/src/app-state/store.tsx:702-708`, `apps/mobile/src/components/chat/nudge-dialog.tsx` |
| Non-text turns (image / video / document requests) | Real tool calls | Regex `classify()` → canned reply after a 1.6 s `setTimeout` | STUB/DEMO | `apps/mobile/src/app-state/store.tsx:215-234,236,736` |
| Demo turns excluded from model context | n/a | Yes — transport filters `metadata.demo` | MOBILE-ONLY | `apps/mobile/src/app-state/store.tsx:481` |
| System prompt content | Matches its tool set | Copy of web-v3's, including segments for tools mobile lacks | PARTIAL | `apps/mobile/src/lib/ai/prompts.ts` (artifacts / crypto / stock / wallet-send / image-gen claims) |

### AI Tools

web-v3 exposes **25** tools; mobile exposes **2**.

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| `web_search` (Perplexity direct, Gateway Sonar fallback) | Yes | Yes (verbatim port) | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:910`, `apps/mobile/src/app/api/chat+api.ts:175` |
| `balance_check` (Sui USDC/SUI balance) | Yes, address from session | Yes, address **bound at construction** from verified session | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:986`, `apps/mobile/src/lib/ai/tools/balance-check.ts` |
| `image_search` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:914` |
| `web_scrape` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:917` |
| `crypto_market` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:920` |
| `crypto_history` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:923` |
| `crypto_screener` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:926` |
| `crypto_global` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:929` |
| `onchain_trending` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:932` |
| `perp_market` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:935` |
| `token_research` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:936` |
| `stock_analysis` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:940` |
| `generate_image` | Yes (also for anonymous users) | No — regex demo path instead | STUB/DEMO | `apps/web-v3/app/(chat)/api/chat/route.ts:943`, `apps/mobile/src/app-state/store.tsx:220` |
| `edit_image` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:958` |
| `upscale_image` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:965` |
| `generate_video` (video-intent gated) | Yes | No — regex demo path instead | STUB/DEMO | `apps/web-v3/app/(chat)/api/chat/route.ts:950`, `apps/mobile/src/app-state/store.tsx:222` |
| `transaction_history` | Yes | No (data exists at `/api/transactions`, not exposed as a tool) | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:987`, `apps/mobile/src/app/api/transactions+api.ts` |
| `resolve_suins` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:990` |
| `send_transfer` (client-executed, payment-intent gated) | Yes | No — send exists only as a wallet-tab flow | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:991`, `apps/mobile/src/components/wallet/send-sheet.tsx` |
| `createDocument` | Yes (incl. anon w/ explicit artifact ask) | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:951` |
| `editDocument` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:972` |
| `updateDocument` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:973` |
| `requestSuggestions` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:978` |
| `save_memory` (memory-toggle gated) | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:790,995` |
| `set_preferences` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:1000` |
| Anonymous tool subset (12 tools for signed-out users) | Yes | n/a — mobile guests get the same 2 tools | PARTIAL | `apps/web-v3/app/(chat)/api/chat/route.ts:736-822` |
| `prepareStep` drops doc-mutation tools after a successful artifact | Yes | No equivalent (no artifact tools) | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:849-874` |

### Wallet

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| Dedicated wallet screen | None — wallet lives in chat tools + Settings Passport | Full wallet tab | MOBILE-ONLY | `apps/mobile/src/components/wallet/wallet-screen.tsx` |
| USDC + SUI balance (live) | Via `balance_check` tool + `/api/wallet/balance` | Live via `/api/balance` → `@t2000/sdk queryBalance` | PARITY | `apps/web-v3/app/api/wallet/balance/route.ts`, `apps/mobile/src/app/api/balance+api.ts`, `apps/mobile/src/lib/wallet-data.ts` |
| Transaction history (live) | Via `transaction_history` tool | Live list via `/api/transactions` → `queryHistory` | PARITY | `apps/mobile/src/app/api/transactions+api.ts`, `apps/mobile/src/components/wallet/wallet-screen.tsx:29` |
| Explorer links (Suiscan) | Yes | Yes | PARITY | `apps/mobile/src/components/wallet/wallet-screen.tsx:152` |
| Send USDC | Chat tool, client-signed, gasless, **mainnet** | Real send sheet, client-signed, **testnet-only hard gate** | PARTIAL | `apps/web-v3/lib/ai/tools/send-transfer.ts`, `apps/mobile/src/lib/wallet/send.ts:23,38,62-64` |
| Send: on-chain digest surfaced | Yes | Yes (real digest → Suiscan) | PARITY | `apps/mobile/src/components/wallet/send-sheet.tsx:183-186` |
| Send: double-submit / stale-session defenses | Yes | Yes (`sendGenRef` + `inFlightRef`, address re-check) | PARITY | `apps/mobile/src/app-state/store.tsx:829-876`, `apps/mobile/src/lib/wallet/send.ts:82-111` |
| Receive (address + copy) | Address in Settings Passport | Receive sheet with real `session.address` + copy | MOBILE-ONLY | `apps/mobile/src/components/wallet/receive-sheet.tsx` |
| Receive QR code | n/a | **Fake decorative 21×21 grid**, not a scannable QR | STUB/DEMO | `apps/mobile/src/app-state/catalog.ts:214,243`, `apps/mobile/src/components/wallet/receive-sheet.tsx:49` |
| SuiNS name resolution on send | Yes (`resolve_suins`) | No — raw address only | MISSING | `apps/web-v3/app/(chat)/api/chat/route.ts:990` |
| Network switching / display | Network shown in Settings | Network shown in Settings; send blocked off-testnet | PARITY | `apps/mobile/src/components/wallet/wallet-screen.tsx:27` |
| Fiat on-ramp (buy USDC with card) | Yes (`OnrampFlow` + `/api/onramp`) | No | MISSING | `apps/web-v3/app/api/onramp/route.ts`, `apps/web-v3/app/(chat)/settings/billing/page.tsx` |
| Stablecoin top-up of credit | Yes (`payStablecoinTopup`) | Amount chips render but are inert | STUB/DEMO | `apps/web-v3/lib/wallet/usdc-topup.ts`, `apps/mobile/src/components/settings/settings-screen.tsx:468` |
| Swap | Not in the current web-v3 tool set (SDK-level only) | No | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts:903-1000` (no swap tool) |

### Settings

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| Passport section (address, network, email, session expiry) | Yes | Yes, real session values | PARITY | `apps/web-v3/app/(chat)/settings/page.tsx:216`, `apps/mobile/src/components/settings/settings-screen.tsx:114` |
| Claim / change @handle | Real (`/api/identity/check`, `/api/identity/claim`) | Sheet disabled — "Claim — coming soon"; availability is a length check | STUB/DEMO | `apps/web-v3/app/(chat)/api/identity/claim/route.ts`, `apps/mobile/src/components/settings/handle-sheet.tsx:49,60` |
| Private Memory toggle | Real, gates recall + `save_memory` | Toggle renders, no backend | STUB/DEMO | `apps/web-v3/app/(chat)/settings/page.tsx:282`, `apps/mobile/src/components/settings/settings-screen.tsx:174-186` |
| Forget all memories | Real (`/api/account/forget-memory`, bumps `memoryEpoch`) | Confirm dialog opens; **`doConfirm` has no `forget` branch — nothing happens** | STUB/DEMO | `apps/web-v3/app/(chat)/api/account/forget-memory/route.ts`, `apps/mobile/src/app-state/store.tsx:883-893` |
| Delete all chats | Real server delete | **Clears local message list only; no server call** | STUB/DEMO | `apps/web-v3/app/(chat)/settings/page.tsx:411-422`, `apps/mobile/src/app-state/store.tsx:883-893` |
| Purge all data | Real (`/api/account/purge`) | Same local-only path as above | STUB/DEMO | `apps/web-v3/app/(chat)/api/account/purge/route.ts`, `apps/mobile/src/app-state/store.tsx:883-893` |
| Refer & earn | Real link + real stats (`/api/referral`) | Fabricated link + fabricated stats, real OS share sheet | STUB/DEMO | `apps/web-v3/app/(chat)/api/referral/route.ts`, `apps/mobile/src/app-state/catalog.ts:384-390`, `apps/mobile/src/components/settings/referral-sheet.tsx:18,43,52` |
| Custom instructions editor | Server-persisted | Device-persisted via `expo-secure-store`, sent per request | PARTIAL | `apps/web-v3/app/(chat)/api/account/custom-instructions/route.ts`, `apps/mobile/src/lib/prefs.ts:13,22` |
| Developer API keys | Real in-app section (`/api/keys`) | Link-out to the developers site | PARTIAL | `apps/web-v3/app/(chat)/settings/page.tsx:408`, `apps/mobile/src/components/settings/settings-screen.tsx:224-233` |
| Privacy & storage explainer | Yes | Yes + link to web privacy page | PARITY | `apps/web-v3/app/(chat)/settings/page.tsx:442`, `apps/mobile/src/components/settings/settings-screen.tsx:266` |
| Credit balance | Live from the ledger | Hardcoded `"0.00"` rendered as `$0.00` | STUB/DEMO | `apps/web-v3/app/(chat)/api/credit/balance/route.ts`, `apps/mobile/src/app-state/catalog.ts:255`, `apps/mobile/src/components/settings/settings-screen.tsx:391`, `apps/mobile/src/components/nav/account-menu.tsx:61` |
| Buy credit / checkout | Real Stripe + USDC paths | Inert amount chips, "Manage plan & payment" opens the web app | PARTIAL | `apps/web-v3/app/(chat)/api/credit/checkout/route.ts`, `apps/mobile/src/components/settings/settings-screen.tsx:468` |
| Auto-recharge (threshold + amount) | Real (`/api/credit/auto-recharge`) | State exists in the store but is never rendered | MISSING | `apps/web-v3/app/(chat)/api/credit/auto-recharge/route.ts`, `apps/mobile/src/app-state/store.tsx:369,1005` |
| Stripe payment methods (add/remove) | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/billing/payment-method/route.ts` |
| Subscription / plan change | Yes (`/api/credit/subscribe`, `/api/billing/subscription`) | Plans sheet is display-only; CTA opens the web app | PARTIAL | `apps/web-v3/app/(chat)/api/credit/subscribe/route.ts`, `apps/mobile/src/components/settings/plans-sheet.tsx` |
| Plan/tier catalog | `lib/credit/tiers.ts` (SSOT) | Mirrored constants in `catalog.ts` | PARTIAL | `apps/web-v3/lib/credit/tiers.ts`, `apps/mobile/src/app-state/catalog.ts:309` |
| Theme (dark/light) | Yes | Yes | PARITY | `apps/mobile/src/components/nav/account-menu.tsx` |
| Help / support links | Yes | Yes (real URLs) | PARITY | `apps/mobile/src/app-state/catalog.ts` (`HELP_ITEMS`) |
| Coming-soon disclosure card | Yes | Yes | PARITY | `apps/mobile/src/components/settings/settings-screen.tsx:506` |
| Biometric app-lock | No | Yes | MOBILE-ONLY | `apps/mobile/src/components/settings/settings-screen.tsx:200,352`, `apps/mobile/src/components/auth/lock-screen.tsx` |

### Auth

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| Google sign-in → zkLogin Sui address | Yes | Yes (real, via the web-v3 mobile-auth exchange) | PARITY | `apps/web-v3/app/api/mobile-auth/exchange/route.ts`, `apps/mobile/src/app/gate.tsx` |
| Session credential | httpOnly HS256 cookie | `audric_session` Bearer in `expo-secure-store` | PARITY | `apps/web-v3/lib/audric-auth.ts`, `apps/mobile/src/lib/wallet/keys.ts:18-23` |
| Server-side token verification on every API call | Yes | Yes (`authenticate()`, body `userId` is a dev hint only) | PARITY | `apps/mobile/src/lib/api-guard.ts`, `apps/mobile/src/app/api/chat+api.ts:75-82` |
| Ephemeral key material kept client-side only | Yes | Yes (`Ed25519Keypair` in SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) | PARITY | `apps/mobile/src/lib/wallet/signer.ts:10`, `apps/mobile/src/lib/wallet/keys.ts:19` |
| Anonymous mode | Yes | Yes | PARITY | `apps/web-v3/app/(auth)/auth.ts`, `apps/mobile/src/app-state/store.tsx:702` |
| Sign out | Yes | Yes | PARITY | `apps/mobile/src/components/nav/account-menu.tsx` |
| Route-level auth gating | Middleware + `auth()` | Expo Router `Stack.Protected` | PARITY | `apps/mobile/src/app/_layout.tsx` |
| Additional sign-in methods (email, passkey, wallet-connect) | None | None | PARITY | `apps/web-v3/app/(auth)/auth.ts` |

### Navigation

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| Shell layout | Sidebar + chat area, URL-routed (`/`, `/chat/[id]`, `/settings`, `/settings/billing`) | Single `Shell` with `tab ∈ chat/wallet/settings`, all sheets mounted once | PARTIAL | `apps/web-v3/app/(chat)/layout.tsx`, `apps/mobile/src/app/(app)/index.tsx` |
| Deep-linkable chat URL (`/chat/[id]`) | Yes | No — chat id is in-memory state | MISSING | `apps/web-v3/app/(chat)/chat/[id]/page.tsx`, `apps/mobile/src/app/(app)/index.tsx` |
| Settings as a route | `/settings`, `/settings/billing` | A tab, not a route | PARTIAL | `apps/web-v3/app/(chat)/settings/page.tsx`, `apps/mobile/src/app/(app)/index.tsx` |
| Marketing / legal pages (`/blog`, `/privacy`, `/terms`, `/pricing`) | Yes | Link-out to the web app | PARTIAL | `apps/web-v3/app/blog/page.tsx`, `apps/mobile/src/lib/audric-web.ts` |
| Checkout pages (`/checkout`, `/checkout/return`) | Yes | No | MISSING | `apps/web-v3/app/checkout/page.tsx` |
| Onboarding flow | No | Yes (takeover until `onboarded`) | MOBILE-ONLY | `apps/mobile/src/components/onboarding/onboarding-screen.tsx`, `apps/mobile/src/app/(app)/index.tsx` |
| Guest sign-in nudge dialog | No | Yes (3rd guest turn) | MOBILE-ONLY | `apps/mobile/src/components/chat/nudge-dialog.tsx` |

### API routes

web-v3 ships **40** non-`/v1` handlers (plus ~20 `app/v1/**` OpenAI-compatible + agent routes). Mobile ships **6**.

| Feature | web-v3 | mobile | Status | Evidence |
|---|---|---|---|---|
| `POST /api/chat` | Yes | Yes | PARITY | `apps/web-v3/app/(chat)/api/chat/route.ts`, `apps/mobile/src/app/api/chat+api.ts` |
| `DELETE` chat | Yes | Yes | PARITY | `apps/mobile/src/app/api/chat+api.ts:246` |
| `GET /api/history` | Yes | Yes | PARITY | `apps/web-v3/app/(chat)/api/history/route.ts`, `apps/mobile/src/app/api/history+api.ts` |
| `GET /api/messages` | Yes | Yes (owner-checked) | PARITY | `apps/web-v3/app/(chat)/api/messages/route.ts`, `apps/mobile/src/app/api/messages+api.ts` |
| Wallet balance route | `/api/wallet/balance` | `/api/balance` | PARITY | `apps/web-v3/app/api/wallet/balance/route.ts`, `apps/mobile/src/app/api/balance+api.ts` |
| Transaction history route | tool-only | `/api/transactions` | MOBILE-ONLY | `apps/mobile/src/app/api/transactions+api.ts` |
| User upsert route | inline | `/api/user` | MOBILE-ONLY | `apps/mobile/src/app/api/user+api.ts` |
| `/api/vote` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/vote/route.ts` |
| `/api/followups` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/followups/route.ts` |
| `/api/document` + `/api/suggestions` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/document/route.ts` |
| `/api/files/{upload,upload-token,blob}` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/files/upload/route.ts` |
| `/api/account/{custom-instructions,forget-memory,purge}` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/account/purge/route.ts` |
| `/api/credit/*` (6 routes) | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/credit/balance/route.ts` |
| `/api/billing/*` (4 routes) + `/api/stripe/webhook` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/billing/route.ts`, `apps/web-v3/app/api/stripe/webhook/route.ts` |
| `/api/identity/{check,claim,me}` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/identity/claim/route.ts` |
| `/api/keys` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/keys/route.ts` |
| `/api/referral` | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/referral/route.ts` |
| `/api/models` | Yes (drives the picker + confidential list) | No — static catalog | MISSING | `apps/web-v3/app/(chat)/api/models/route.ts`, `apps/mobile/src/app-state/catalog.ts:27` |
| `/api/onramp` | Yes | No | MISSING | `apps/web-v3/app/api/onramp/route.ts` |
| `/api/chat/[id]/stream` (resumable streams) | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/chat/[id]/stream/route.ts` |
| `/api/verify-receipt` (TEE attestation) | Yes | No | MISSING | `apps/web-v3/app/(chat)/api/verify-receipt/route.ts` |
| `/api/mobile-auth/{bridge,exchange}` | Yes (serves mobile) | consumed, not implemented | PARITY | `apps/web-v3/app/api/mobile-auth/exchange/route.ts` |
| `app/v1/**` OpenAI-compatible + agent API (~20 routes) | Yes | No | MISSING | `apps/web-v3/app/v1/chat/completions/route.ts` |

---

## Notable gaps

Ranked for a QA sweep.

1. **Three of the composer's own follow-up chips lead straight into fake output.** All three `FOLLOWUPS` (`catalog.ts:120-124`) match `classify()`'s image/video/artifact regexes, so tapping any of them produces a canned reply rather than a model turn. *Why it matters:* the app's most prominent suggested actions are guaranteed to produce demo content — a tester following the happy path will hit it immediately.
2. **"Delete all chats" and "Purge all my data" do not delete anything on the server.** `doConfirm` (`store.tsx:883-893`) only clears the local message array and starts a new chat. *Why it matters:* a destructive privacy promise silently fails; the data is still in Postgres and reappears in the drawer after a reload.
3. **"Forget all my memories" has no handler at all.** `askConfirm("forget")` opens the dialog, but `doConfirm` has no `forget` branch, so confirming is a no-op. *Why it matters:* same class of bug as #2, and memory is a headline privacy claim.
4. **The chat route has no rate limit, no guest quota, and no premium entitlement check.** `chat+api.ts:32-41` documents this; `providers.ts` notes paid model ids bill the gateway key. *Why it matters:* an authenticated user can select Opus/GPT-5.5 and spend unmetered; there is nothing between a valid session and the provider key.
5. **23 of web-v3's 25 tools are absent, but the system prompt still advertises them.** `prompts.ts` was copied whole and still describes artifacts, crypto/stock data, image generation and sending money. *Why it matters:* the model will confidently offer capabilities it cannot invoke, producing hallucinated tool behaviour instead of a clean "I can't do that here".
6. **Credit balance renders `$0.00` from a constant in two places** (`settings-screen.tsx:391`, `account-menu.tsx:61`). *Why it matters:* a real-looking financial figure that is never fetched; a funded account still shows zero.
7. **The Receive QR is decorative, not scannable.** `buildQr()` (`catalog.ts:214`) draws finder patterns plus a hash-derived dot pattern. *Why it matters:* someone will point a wallet at it and either get nothing or, worse, assume the address transferred.
8. **Votes are collected and discarded.** `VoteButtons` (`conversation.tsx:445`) is local `useState`; there is no `/api/vote` on mobile. *Why it matters:* feedback data silently lost, and the UI implies it was recorded.
9. **Chat visibility (Private/Public) is local-only with no share backend.** `visibility-sheet.tsx` + `store.tsx:341`. *Why it matters:* selecting "Public" implies a shareable link that does not exist.
10. **Send is testnet-only by hard gate.** `lib/wallet/send.ts:38,62-64` throws on any non-testnet network regardless of the calling surface. Correct and deliberate, but it means the wallet's headline action cannot be QA'd against production behaviour.
11. **No attachments.** The paperclip toggles a fake 3-tile strip (`composer.tsx:227`); there is no image picker, no upload, no blob route. *Why it matters:* vision models are selectable and the UI implies attachment support.
12. **No deep-linkable chat URL and no `/api/chat/[id]/stream`.** Notifications, share links and stream resumption after backgrounding all have no path.

---

## Things that look like placeholders/demos in mobile

Everything below **renders to the user** and is fabricated. `file:line` is the render site.

| What renders | Actually is | Evidence |
|---|---|---|
| Image results in chat (teal→indigo gradient card) | `LinearGradient`, no model call | `apps/mobile/src/components/chat/conversation.tsx:164,171` (built by `buildDemoReply`, `apps/mobile/src/app-state/store.tsx:236`) |
| Video results in chat | Same gradient stand-in | `apps/mobile/src/components/chat/conversation.tsx:190` |
| Artifact/document card in chat | Static, opens the static viewer | `apps/mobile/src/components/chat/conversation.tsx:215-240` |
| Assistant text for any image/video/document request | Canned string emitted after `setTimeout(1600)` | `apps/mobile/src/app-state/store.tsx:236-274,736` |
| Artifact viewer body | `ARTIFACT_LINES` constant; title/status/version hardcoded; toolbar inert except Copy | `apps/mobile/src/app-state/catalog.ts:392`, `apps/mobile/src/components/chat/artifact-viewer.tsx:48,111` |
| Image fullscreen "model" + "prompt" metadata | `FULL_MODEL = "Audric · Image"`, `FULL_PROMPT = "A minimal geometric logo, teal on charcoal"` — always the same regardless of what was asked | `apps/mobile/src/components/chat/image-fullscreen.tsx:9-10,50` |
| Follow-up chips under every assistant turn | 3 hardcoded prompts, all routing into the demo path | `apps/mobile/src/app-state/catalog.ts:120-124`, `apps/mobile/src/components/chat/conversation.tsx:242-247` |
| Attachment preview strip (image / uploading spinner / PDF tile) | Three fixed tiles behind a toggle; no file was ever chosen | `apps/mobile/src/components/chat/composer.tsx:114,227-279` |
| Receive-sheet QR code | Deterministic hash pattern with real-looking finder squares; not encodable | `apps/mobile/src/app-state/catalog.ts:214-243`, `apps/mobile/src/components/wallet/receive-sheet.tsx:49` |
| Credit balance `$0.00` (Settings PLAN card and account menu) | `CREDIT_USD = "0.00"` constant | `apps/mobile/src/app-state/catalog.ts:255`, `apps/mobile/src/components/settings/settings-screen.tsx:391`, `apps/mobile/src/components/nav/account-menu.tsx:61` |
| Top-up amount chips ($5/$10/$25/$50) | `TOPUPS` constant, no press handler wired to a payment path | `apps/mobile/src/app-state/catalog.ts:258`, `apps/mobile/src/components/settings/settings-screen.tsx:468` |
| Referral link `https://audric.ai/r/you-a1b2` | Fabricated; the OS share sheet really shares it | `apps/mobile/src/app-state/catalog.ts:384`, `apps/mobile/src/components/settings/referral-sheet.tsx:18,43` |
| Referral stats (3 referrals / $30 earned / rank #142) | `REFERRAL_STATS` constant | `apps/mobile/src/app-state/catalog.ts:385-390`, `apps/mobile/src/components/settings/referral-sheet.tsx:52` |
| "@handle is available" in the handle sheet | Length check, no availability API call; the Claim button is disabled | `apps/mobile/src/components/settings/handle-sheet.tsx:49,60` |
| Private/Public visibility choice | Local `useState`, never persisted or shared | `apps/mobile/src/app-state/store.tsx:341`, `apps/mobile/src/components/chat/visibility-sheet.tsx` |
| Thumbs up/down on assistant messages | Local `useState`, never POSTed | `apps/mobile/src/components/chat/conversation.tsx:445-468` |
| Private Memory toggle | Never sent to the chat route; no memory backend | `apps/mobile/src/app-state/store.tsx:348`, `apps/mobile/src/app/api/chat+api.ts:175` (no `save_memory`) |
| "Delete all chats" / "Purge all my data" | Clears local state only | `apps/mobile/src/app-state/store.tsx:883-893` |
| "Forget all my memories" | Confirm dialog with no handler branch | `apps/mobile/src/app-state/store.tsx:883-893` |
| Context-usage sheet (6.2%, 12.4K/200K, Input 8.2K / Output 3.9K / Reasoning 0.3K, "Free") | Static `CTX` constant. **Currently unreachable** — the only entry point is the composer ring behind `ctxShow = false`. Flagged because re-enabling the ring immediately exposes fake live numbers. | `apps/mobile/src/app-state/catalog.ts:146-160`, `apps/mobile/src/components/chat/composer.tsx:79,178`, `apps/mobile/src/components/chat/context-sheet.tsx:23-54` |

Correctly labelled (not a bug, listed for completeness): demo assistant turns carry a visible **"Demo · not generated"** badge (`conversation.tsx:117,148`) and are filtered out of real model context by the transport (`store.tsx:481`). Plans/tier copy and "Coming soon" cards are honest.

Dead prototype constants — defined but rendered nowhere, so **not** user-visible fakery: `TRANSACTIONS` (`catalog.ts:205`), `WALLET_ADDRESS` (`:190`), `SEND_DIGEST` (`:192`), `USER_HANDLE` (`:249`), `USER_EMAIL` (`:251`), `SHORT_ADDRESS` (`:253`); and the `autoRecharge` store state (`store.tsx:369,1005`). Worth deleting, not worth QA time.

---

## Uncertain

- **Message-level attachment rendering.** web-v3 persists `attachments: []` per message; mobile always writes `[]` (`chat+api.ts:137,220`). I did not verify whether an existing web-created chat containing attachments renders gracefully or blank when opened on mobile.
- **`maxDuration = 60`** (`chat+api.ts:30`) is a Vercel hint; the actual request timeout on the mobile app's deploy target is unknown — the file itself flags this.
- **Mobile CoT timeline fidelity.** `cot-timeline.tsx` exists on both sides and both receive `reasoning`/`source-*` parts, but I compared them by structure only, not by rendering the same stream through both.
- **Model catalog drift.** `apps/web-v3/lib/ai/models.ts:78-132` lists Kimi K2.5 / Grok 4.3 / Claude Sonnet 5 / Claude Opus 4.8 / GPT-5.5, which does not match the roster in the repo's root `CLAUDE.md`. Mobile mirrors `models.ts`. Which is stale is not determinable from code alone.
- **Whether the two apps share a Postgres instance in any given environment.** Both use the same schema and `POSTGRES_URL` name; cross-app history visibility depends on deploy config I did not read.
- **`app/v1/**` agent/ACI routes** (~20 handlers) were inventoried by path only, not read. They are developer-platform surface with no mobile counterpart, so they do not change any status above.
- **Whether the mobile web-search tool's Perplexity key is configured** in the mobile deployment — the code path falls back to Gateway Sonar, but I did not read any `.env` file.
