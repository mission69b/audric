# Audric Mobile — HANDOFF

> **Snapshot date:** 2026-07-05 · **Branch:** `feat/mobile-app` · **All committed + pushed** at `b553f315` (see [Commit state](#8-commit-state)).
> Read this top-to-bottom before touching anything. It is the single most current picture of the mobile app. Companion docs are indexed at the bottom.

---

## 0. TL;DR — where we are right now

- The app is **built and runnable**: all 4 tabs (Chat / Wallet / Settings / Skills) exist, real chat streams + persists, Google sign-in flow is wired end-to-end.
- **B1 (session auth) just landed** — the data routes now authenticate a real `audric_session` token instead of trusting a client-asserted `userId`. Mobile typechecks clean.
- **funkii handed over the real credential set** (Google client id + matching secret + Enoki key + gateway key). It is now applied to **local** `.env.local` in both apps. Vercel/prod is **unconfirmed**.
- **The one thing blocking a real end-to-end sign-in:** the redirect URI must be registered on the **new** Google client, and we need to pick a test target (localhost vs funnel). That decision was left open — see [What's blocked](#2-whats-blocked--decide-this-first).
- **The hard gate still stands:** no wallet-touching code ships to prod until *same Google account → same Sui address* is verified against production keys ([Phase 0](#phase-0-hard-gate)).

---

## 1. What this app is

Native iOS/Android port of **audric.ai** (the `apps/web-v3` product) — private, decentralized, multi-model AI on a non-custodial Sui zkLogin wallet. The mobile app **reuses web-v3's backend contracts** (same auth token, same chat wire shape, same DB) rather than reinventing them. UI is a 1:1 port of the prototype design brief, in mobile layout.

**Standing product rule (from the owner, verbatim):** *"Make sure everything the same as webapp — icons, features"* and *"everything must be wired"* — no dead buttons, no stubs shipped as if real.

### Stack (verified from `package.json`)
| | |
|---|---|
| Runtime | Expo **~57.0.1**, expo-router **~57.0.2**, React Native **0.86.0**, React **19.2.3** |
| AI | `ai@^7.0.11` (AI SDK v7), `@ai-sdk/react@^4.0.12` |
| Auth crypto | `jose@^6.2.2` (HS256 session verify — matches `packages/auth`) |
| Monorepo | pnpm workspace. Path alias `@/*` → `src/*` |

> ⚠️ **`apps/mobile/AGENTS.md` is STALE** — it says "Expo v56" and links the v56 docs. The app is on **Expo 57**. `AGENTS.md`/`CLAUDE.md` are funkii's canonical docs — **flag the staleness, do not edit them.** Use the v57 docs: https://docs.expo.dev/versions/v57.0.0/

### Repo map (mobile)
```
apps/mobile/
├── src/
│   ├── app/
│   │   ├── (app)/            # authed shell — _layout.tsx + index.tsx (the whole app is one state machine)
│   │   └── api/              # Expo Router server routes (+api.ts) — the mobile BFF, run SERVER-SIDE
│   │       ├── chat+api.ts       # chat stream (streamText) + persistence + web_search tool
│   │       ├── history+api.ts    # drawer chat list
│   │       ├── messages+api.ts   # open a past thread (ownership-checked)
│   │       └── user+api.ts       # onboarding upsert (create User row)
│   ├── app-state/store.tsx  # the single big state machine + useChat transport (ports the prototype 1:1)
│   ├── auth/
│   │   ├── config.ts         # PUBLIC OAuth config (client id, exchange base, redirect uri) — lazy-read env
│   │   ├── google.ts         # builds the Google authorize URL, opens system browser
│   │   ├── pkce.ts           # PKCE verifier/challenge
│   │   ├── exchange.ts       # POSTs {code, verifier} to the exchange server, gets {address, token, ...}
│   │   ├── session.ts        # StoredSession (SecureStore) + authHeader() helper
│   │   ├── session-token.ts  # SERVER-ONLY: verifyMobileSession (jose HS256 mirror of packages/auth)
│   │   ├── biometrics.ts     # Face ID app-lock
│   │   └── useAuth.tsx        # AuthProvider: signIn / signOut / devBypass / lock
│   ├── lib/
│   │   ├── api-guard.ts       # authenticate() — the route auth gate (B1)
│   │   ├── api-url.ts         # generateAPIUrl (dev-server URL vs prod base)
│   │   ├── ai/{providers,prompts,tools}  # ported from web-v3 (gateway, systemPrompt, web_search)
│   │   └── db/{client,queries,schema}    # Drizzle → Neon (same schema as web-v3)
│   ├── components/{chat,wallet,settings,skills,nav,onboarding,auth,ui}
│   └── theme/
├── .env.local        # secrets + public config (GITIGNORED). See §Environment.
├── .env.example      # documented template (safe, no real values)
├── AGENTS.md/CLAUDE.md   # funkii canonical (STALE re: v56) — do not edit
├── PHASE0_RUNBOOK.md      # the address-parity gate procedure
├── PROD_READINESS.md      # full prod-readiness audit (blockers B1/B2, parity gaps)
├── SESSION_AUTH_DESIGN.md # B1 design record
└── HANDOFF.md            # ← you are here
```

### How the pieces talk
```
Mobile UI (store.tsx) ──useChat──▶ /api/chat+api.ts (Expo server route, Node)
                                        │ streamText → Vercel AI Gateway (ZDR)
                                        │ persists → Neon (Drizzle)
Sign-in: useAuth ▶ google.ts (authorize) ▶ system browser ▶ Google
   ▶ redirect to web-v3 /auth/bridge ▶ 302 audric://callback (code)
   ▶ exchange.ts POST /api/mobile-auth/exchange (web-v3, holds client_secret)
       ▶ swap code→id_token ▶ verify aud ▶ Enoki deriveAddress ▶ mint audric_session
   ▶ StoredSession {address, token} in SecureStore
Authenticated data-route calls carry  Authorization: Bearer <token>  (B1);
   guest + dev-bypass calls send none.
```

---

## 2. What's BLOCKED — decide this first

**A real Google sign-in cannot complete until the redirect URI is registered on the NEW client, and it depends on a test-target choice that is still OPEN.**

Background: the OAuth `redirect_uri` must **byte-match** (scheme + host + port + path) a URI registered on the Google **Web** client, or Google returns `Error 400: redirect_uri_mismatch`. Registrations are **per-client** — we moved to funkii's client `396016292233-…`, so any earlier client's registration does **not** carry over.

**Open decision (pick one, then tell funkii which URI to register on `396016292233-…`):**

| Target | Redirect URI funkii must register | Local config to set | Notes |
|---|---|---|---|
| **Localhost** (simulator/emulator) | `http://localhost:3002/auth/bridge` | already set (`EXPO_PUBLIC_BRIDGE_URL` + `MOBILE_AUTH_BRIDGE_PATH=/auth/bridge`) | Google exempts `localhost` from the https rule. Fastest loop. Android emulator also needs `adb reverse tcp:3002 tcp:3002`. |
| **Funnel** (physical device) | `https://desktop-do80pp9.tail46791a.ts.net/auth/bridge` | set `EXPO_PUBLIC_EXCHANGE_BASE_URL` + `EXPO_PUBLIC_BRIDGE_URL` to the funnel host; keep `MOBILE_AUTH_BRIDGE_PATH` aligned | Closest to prod. Needs the web-v3 container + Tailscale funnel up during the test. |

Also required if the Google **consent screen is in "Testing"**: funkii must add the tester's Google account (e.g. `ngocanh30075@gmail.com`) under **Test users**, or sign-in is blocked with "app is being tested."

> Whichever target: `EXPO_PUBLIC_BRIDGE_URL` (mobile, the URI in the authorize request) and web-v3's rebuilt `redirect_uri` (`{origin}${MOBILE_AUTH_BRIDGE_PATH}`) **must be identical** — the exchange sends the same `redirect_uri` to Google that the app used, or the code swap fails.

---

## 3. What's DONE

### ✅ Credentials aligned to funkii's set (local only)
funkii delivered the canonical set (in `/home/ngocanh/audric-build/latest chat from funkki`, **outside the repo**). Applied to **local** `.env.local`:
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_CLIENT_ID` = `396016292233-evvduh1khkcimo9p8h0ocd9p4vlrjem8.apps.googleusercontent.com` (**identical across both apps** — verified; a mismatch forks the wallet).
- `GOOGLE_CLIENT_SECRET` (web-v3 only) = the secret matching the new client (a new client id **requires** its own secret or the exchange returns `invalid_client`).
- `NEXT_PUBLIC_ENOKI_API_KEY` (web-v3) + `AI_GATEWAY_API_KEY` (both) updated.
- Backups of the pre-change `.env.local` files are in the session scratchpad (`web-v3.env.local.bak`, `mobile.env.local.bak`).

**Must restart to load:** web-v3 dev server (reads env at boot); mobile must be **rebuilt** (Expo inlines `EXPO_PUBLIC_*` at build — hot reload won't pick up the new client id).

### ✅ B1 — session auth on the data routes (this session)
Replaced the blunt `productionGate` (which 403'd every route in prod) with real auth. **Design record: `SESSION_AUTH_DESIGN.md`.**

- **Mint** (`web-v3 app/api/mobile-auth/exchange/route.ts`): after deriving the address, mints the *same* stateless HS256 `audric_session` token web-v3's `/api/auth/session` issues (`mintSessionToken`, 7-day cap), returns `{ token, expiresAt }`.
- **Carry** (mobile): `exchange.ts` captures the token; `session.ts` stores it + exposes `authHeader()`; `useAuth.tsx` saves it at sign-in and sends `Bearer` on the onboarding POST; `store.tsx` sends `Bearer` on the chat transport + history/messages/delete fetches (a guest sends none).
- **Verify** (`mobile src/auth/session-token.ts`, SERVER-ONLY): `verifyMobileSession` — a ~15-line jose HS256 **mirror** of `packages/auth`'s `verifySessionToken`. Must stay byte-compatible (same alg, same `AUTH_SECRET`, same claim shape) so a token minted on web-v3 verifies on mobile.
- **Enforce** (`mobile src/lib/api-guard.ts`): `authenticate(request, clientAssertedUserId)` — the gate all 4 routes now call.

**Auth policy (the table that matters):**
| Caller | Dev | Prod |
|---|---|---|
| Valid `Bearer` | token `sub` (authoritative; body id ignored) | token `sub` ✓ |
| **Invalid** (nonempty) `Bearer` | **401** | **401** |
| No token, signed-in | client-asserted id (dev bypass) | **401** |
| Guest (no token, no id) | no-persist path | **401** *(anon quota = out of scope)* |

`AUTH_SECRET` was copied into mobile `.env.local` (same value as web-v3 — required for tokens to verify). Server-only, gitignored.

### ✅ Already working before this session
- **Chat**: real streaming via AI SDK v7 + Vercel AI Gateway (ZDR), CoT reasoning/sources parts, `web_search` tool, persistence to Neon (chats + messages), history drawer, open/delete past threads.
- **All 4 tabs built** and navigable; onboarding + dev "Skip to app" bypass; biometric app-lock.
- **Sign-in plumbing**: Google auth-code + PKCE → exchange → Enoki derive → session. (End-to-end blocked only by the redirect-URI registration above.)
- Plans/pricing show "COMING SOON" — matches web-v3.

---

## 4. What's NEXT (ranked)

### 🔴 N1 — Finish the login / address-parity test *(immediate)*
1. Decide test target (§2), tell funkii the exact redirect URI to register on `396016292233-…` + add the tester email if consent is in Testing.
2. Restart web-v3 dev server; rebuild the mobile app.
3. Run the sign-in. Follow **`PHASE0_RUNBOOK.md`** — it is the gate procedure.
4. **Verify parity:** sign into audric.ai (web) and the mobile app with the *same* Google account → assert the **same Sui address**. This is the [Phase 0](#phase-0-hard-gate) gate. If they differ, STOP — the `aud`/Enoki set diverges; do not build wallet code on a forked address.
5. **Confirm with funkii that Vercel/prod uses this identical set** (client id + Enoki key). Local parity is necessary but not sufficient — the deployed exchange must derive the same address the app will see in prod.

### 🔴 N2 — B2: real wallet + zkLogin signing *(the second hard blocker; PROD_READINESS §B2)*
Currently the wallet tab is **mock** — send fakes a transfer, balance is fake, receive shows a fake QR, nothing signs. Sequence it safely:
1. **Read-only balance** (real Sui RPC) — no signing, low risk.
2. **Receive** (real address + QR) — display only.
3. **Send** with **client-side zkLogin signing** — money write. Per web-v3's rule, money writes are **client-executed** (browser/device signs; server never holds keys). This must stay behind [Phase 0](#phase-0-hard-gate) until parity passes.

### 🟠 N3 — Parity gaps (PROD_READINESS §🟠)
- Tool cards (image/video/artifact) are mock UI — wire to real tools or hide.
- **Private Memory toggle is inert** — `memoryOn` never reaches `chat+api`; wire it through like web-v3 (memory OFF by default, opt-in).
- Vote is local-only — wire to the vote route.

### 🟡 N4 — Release engineering (PROD_READINESS §🟡)
- No `eas.json` yet → add EAS build profiles.
- Production env on the build target (server-only vars must **not** be `EXPO_PUBLIC_`).
- Push notifications not wired.
- App store certs/identifiers.

---

## 5. How to do it right (conventions + gotchas)

### Commands
```bash
# from repo root
pnpm install                                   # after any dep change

# mobile typecheck  (should be CLEAN — keep it that way)
cd apps/mobile && ./node_modules/.bin/tsc --noEmit -p tsconfig.json

# web-v3 typecheck
cd apps/web-v3 && /home/ngocanh/audric-build/audric/node_modules/.bin/tsc --noEmit -p tsconfig.json

# web-v3 dev (the exchange server + audric.ai)  — port 3002
pnpm --filter web-v3 dev

# web-v3 lint = Biome/ultracite (NOT eslint)
cd apps/web-v3 && pnpm exec biome check --write <files>
```

> **web-v3 typecheck currently reports ~267 errors — ALL pre-existing**, rooted in `lib/db/queries.ts` (Drizzle-ORM overload resolution on this checkout). Verified identical count with our changes stashed. They are **not** ours; do not try to "fix" them as part of mobile work. Mobile's own typecheck is clean and must stay clean.

### Conventions
- **web-v3 env rule (CLAUDE.md #5):** never `process.env.X` directly in web-v3 — go through the typed `env` proxy (`lib/env.ts`); add new vars to the Zod schema + `runtimeEnv` first. **Mobile Expo routes are different** — they *do* read `process.env` (Expo convention). Don't cross the wires.
- **Single source of truth (CLAUDE.md #7):** derive model lists / plan features from their catalogs, never hardcode.
- **Honesty (CLAUDE.md #6):** never present a "coming soon" feature as live. Say what's mock.
- **Commits:** `emoji type(scope): subject` — ✨feat 🐛fix 🔒(security) ♻️refactor 🔧chore 📝docs. Lowercase subject, **always an emoji, and NO "Generated with Claude"/Co-Authored-By trailer** (project CLAUDE.md overrides the default). Scopes: `web`, `api`, `auth`, `ai`, `ui`. **The owner controls commits — do not commit unprompted.**
- **Do not edit funkii's canonical docs** unilaterally: `audric/CLAUDE.md`, `apps/mobile/AGENTS.md`/`CLAUDE.md`, web-v3 docs, the prototype `.dc.html`. Flag staleness instead. *Our* editable working docs: `PHASE0_RUNBOOK.md`, `.env.example`, `PROD_READINESS.md`, `SESSION_AUTH_DESIGN.md`, `HANDOFF.md`, `set-tunnel.sh`.

### Gotchas that will bite you
- **Expo inlines `EXPO_PUBLIC_*` at build time.** Change a client-visible env var → **rebuild**, not hot-reload.
- **Bash cwd resets between tool calls** — use absolute paths.
- **`session-token.ts` must not be imported from any UI/component/hook** — it pulls `AUTH_SECRET`. Server-only (through `api-guard`).
- The mobile session mirror **must track `packages/auth`** — if web-v3 changes how it mints tokens (alg, claims, secret), update `session-token.ts` in lockstep or every token 401s.
- Android emulator can't see `localhost:3002` without `adb reverse tcp:3002 tcp:3002`.

---

## 6. Security constraints (hard rules — do not relax)

- **`GOOGLE_CLIENT_SECRET`**: exchange-server env only (web-v3 `.env.local`). NEVER committed, NEVER `EXPO_PUBLIC_`, NEVER on-device, NEVER echoed.
- **`AUTH_SECRET`**: server-only, gitignored. Mobile's copy must equal web-v3's (else tokens don't verify). When reading `.env` files, check key **names/presence only** — never print secret **values**.
- **Provider / gateway / Enoki-secret / `POSTGRES_URL`**: server-only, never bundled into the client, never `EXPO_PUBLIC_`. (Client id and the Enoki **public** key are public — safe to show/compare.)
- **The handoff file** `/home/ngocanh/audric-build/latest chat from funkki` holds a live client secret + gateway key. It is outside the repo — keep it there; delete once the env is settled. Don't move it into the tree.
- **Non-custodial = money correctness is non-negotiable.** Money writes are client-executed; the server never holds keys.

### Phase 0 hard gate
**No wallet-touching app code SHIPPED TO PROD until same-Google → same-Sui-address is verified with production keys + parity check.** The exchange server is wallet-touching; local/branch development + testing is authorized (reversible), shipping is not. See `PHASE0_RUNBOOK.md`.

---

## 7. Open questions for funkii

1. **Which redirect URI** did you register on client `396016292233-…`? (Drives §2.) Localhost, funnel, or both?
2. Is the OAuth **consent screen** in Testing or Production? If Testing, add the tester Google account under Test users.
3. **Does the deployed audric.ai (Vercel) use this exact set** — client id `396016292233-…` **and** Enoki key `enoki_public_6f06…`? If prod runs a different client / Enoki app, the same user forks between web and mobile wallets. (This is the parity/money question — needs an explicit yes.)
4. Confirm the funnel host `https://desktop-do80pp9.tail46791a.ts.net` is still live for device testing.

---

## 8. Commit state

**All work is committed + pushed to `origin/feat/mobile-app` (mission69b/audric). Working tree is clean.** Pushed 2026-07-05:

| commit | scope |
|---|---|
| `a08ccc0` | 🔒 feat(auth): mint + verify audric_session for mobile data routes — the B1 set (exchange mint, `session-token.ts` verify mirror, `api-guard` `authenticate()`, all 4 `+api` routes, client token carry in `exchange`/`session`/`useAuth`/`store`, jose dep + lock, `.env.example` docs) |
| `85d0c6e` | 🔧 chore(auth): local bridge alias + dockerized exchange for native sign-in test — `app/auth/bridge/route.ts`, `env.ts` `MOBILE_AUTH_BRIDGE_PATH`, `config.ts` `EXPO_PUBLIC_BRIDGE_URL` override, `Dockerfile.dev` + `docker-compose.yml` + `.dockerignore` |
| `eb9348e` | 📝 docs(mobile): handoff, prod-readiness, session-auth design |

**Not in git (correctly):** `apps/mobile/.env.local` + `apps/web-v3/.env.local` hold funkii's credential set — both gitignored, local-only. A fresh clone must recreate them from `.env.example` + funkii's values.

**Caveats carried by these commits:**
- B1 is committed but **runtime-unverified** — the mint/verify path can't run until the redirect URI is registered (§2). Sound WIP, not proven working.
- The `chore` commit is **removable scaffolding** — delete the bridge alias + `MOBILE_AUTH_BRIDGE_PATH`/`EXPO_PUBLIC_BRIDGE_URL` overrides once the canonical `/api/mobile-auth/bridge` URI is registered on the client.
- web-v3's ~267 pre-existing `lib/db/queries.ts` typecheck errors are untouched (not introduced here).

---

## 9. Reference docs
- `PHASE0_RUNBOOK.md` — the address-parity gate procedure (run this for N1).
- `PROD_READINESS.md` — full prod-readiness audit (blockers B1/B2, parity gaps, release TODOs).
- `SESSION_AUTH_DESIGN.md` — B1 design + invariants + out-of-scope.
- `README.md` — app run instructions.
- Root `CLAUDE.md` — web-v3 architecture + critical rules. `packages/auth/src/server.ts` — the auth source of truth the mobile mirror tracks.
