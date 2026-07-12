# Phase 0 — zkLogin address-parity gate (runbook)

> **✅ GATE PASSED 2026-07-12** (funkii live test, prod client `h1ch9…`): mobile
> derived the same address as audric.ai for the same Google account — see
> `REVIEW-2026-07-12.md` §1a for evidence. This runbook stays as the re-test
> procedure (re-run after any change to client id, Enoki key, or the auth flow).

**The hard gate.** Same Google account must derive the **same Sui address** on
native as on the live web app. If it doesn't, native is using a different `aud`
(or salt holder) and **funds would fork** → STOP and design a wallet migration
before any further app code. Nothing past the OAuth spike ships until this passes.

Why a server round-trip at all: a Google **Web** OAuth client (the one whose id
is the zkLogin `aud`) requires `client_secret` for the code→token exchange. The
secret must never live on-device, so the app sends the auth `code` to a server
that holds the secret, exchanges it, verifies `aud`, and derives the address via
Enoki. That server is now **web-v3 itself**, under `/api/mobile-auth/*` (it
already holds the canonical Google + Enoki config); the old standalone
`phase0-gate` harness is superseded.

---

## 0. One-time: Google Cloud Console

On the **Web** OAuth client (the one whose id is in `.env.local` /
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`), add to **Authorized redirect URIs**:

- `http://localhost:3002/api/mobile-auth/bridge`  ← native app gate (simulator / emulator)

For a physical device or any Android hardware you'll also add the tunnel URL's
bridge path (see §3c). Google permits `http://localhost` redirect URIs for Web
clients — no https needed for localhost.

---

## 1. Start the exchange server (web-v3)

```bash
pnpm --filter web-v3 dev        # http://localhost:3002
```

web-v3 serves the two native-auth routes on demand:
`GET /api/mobile-auth/bridge` and `POST /api/mobile-auth/exchange`.
`GOOGLE_CLIENT_SECRET` must be set in web-v3's `.env.local` (unset → the exchange
returns 503). Leave dev running.

---

## 2. The web reference address

Sign in to the web app with the account you'll test — either live `audric.ai` or
your local `http://localhost:3002` — and read its **wallet address**. This is the
value native must match. (Web derives its id_token in-browser and posts it to
`/api/auth/session`; native takes the auth-code path to the SAME client id, so
the derived address must be identical.)

---

## 3. Native app gate (the real native flow)

```bash
cd /home/ngocanh/audric-build/audric/apps/mobile
npx expo run:ios       # or: npx expo run:android   (a dev build; Expo Go won't
                       # carry the custom URL scheme reliably)
```

`.env.local` points the app at `http://localhost:3002/api/mobile-auth`. Tap
**Continue with Google** → the system browser opens Google → Google redirects to
`/api/mobile-auth/bridge` → web-v3 302s back to `audric://callback` → the
app POSTs `code` + PKCE verifier to `/api/mobile-auth/exchange` → the screen
shows the derived address and `✓ aud matches`.

Networking, per target:

- **a) iOS simulator** — `http://localhost:3002` reaches the host. Works as-is.
- **b) Android emulator** — map the port first:
  ```bash
  adb reverse tcp:3002 tcp:3002
  ```
  then `http://localhost:3002` resolves to the host. Works as-is.
- **c) Physical device / any Android hardware** — localhost is the phone itself,
  and Google rejects non-localhost http redirects, so expose web-v3 over https
  and point the app at it:
  ```bash
  cloudflared tunnel --url http://localhost:3002   # prints https://XXXX.trycloudflare.com
  scripts/set-tunnel.sh https://XXXX.trycloudflare.com
  ```
  `set-tunnel.sh` (local, gitignored) rewrites `EXPO_PUBLIC_EXCHANGE_BASE_URL` to
  `https://XXXX.trycloudflare.com/api/mobile-auth` and prints the exact bridge URI
  to register. Add `https://XXXX.trycloudflare.com/api/mobile-auth/bridge`
  to the Google Web client redirect URIs, then rebuild so Expo re-inlines the env
  (`EXPO_PUBLIC_*` is baked into the bundle at build time).

---

## 4. The comparison (PASS / FAIL)

- **PASS** — native address (app card) == the web address from §2, and `aud`
  shows ✓. Phase 0 is cleared; app build may proceed.
- **FAIL** — addresses differ, or `aud` shows ✗. **Stop.** Do not build wallet
  features. The cause is almost always a different OAuth client id (`aud`) on one
  side, or a different Enoki salt holder. Reconcile the client id first
  (mobile + web must use the one **Web** client id), then re-run.

---

## Files

- `apps/web-v3/app/api/mobile-auth/bridge/route.ts` — 302s the Google
  `code`+`state` on to the fixed `audric://callback`.
- `apps/web-v3/app/api/mobile-auth/exchange/route.ts` — `POST {code, codeVerifier}`
  → swap code→id_token at Google (uses `GOOGLE_CLIENT_SECRET`) → verify `aud` +
  derive address via Enoki → `{address, email}`.
- `apps/mobile/src/auth/` — `config · pkce · google · exchange · session · useAuth`.
- `apps/mobile/src/app/index.tsx` — the Phase 0 sign-in screen (renders the
  derived address + `aud` check).

## Security

- `GOOGLE_CLIENT_SECRET` lives only in web-v3's server env (never `EXPO_PUBLIC_`,
  never committed) and is never sent to the device.
- The app ships no secret: `EXPO_PUBLIC_*` values are the public client id and the
  exchange base URL only.
