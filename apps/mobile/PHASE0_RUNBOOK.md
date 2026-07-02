# Phase 0 — zkLogin address-parity gate (runbook)

**The hard gate.** Same Google account must derive the **same Sui address** on
native as on the live web app. If it doesn't, native is using a different `aud`
(or salt holder) and **funds would fork** → STOP and design a wallet migration
before any further app code. Nothing past the OAuth spike ships until this passes.

Why a server round-trip at all: a Google **Web** OAuth client (the one whose id
is the zkLogin `aud`) requires `client_secret` for the code→token exchange. The
secret must never live on-device, so the app sends the auth `code` to a server
that holds the secret, exchanges it, verifies `aud`, and derives the address via
Enoki. In Phase 0 that server is the `phase0-gate` harness (it boots with only
the **public** Enoki key).

---

## 0. One-time: Google Cloud Console

On the **Web** OAuth client (the one whose id is in `.env.local` /
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`), add to **Authorized redirect URIs**:

- `http://localhost:3002/auth/callback`  ← browser gate
- `http://localhost:3002/auth/bridge`    ← app gate

(Google permits `http://localhost` redirect URIs for Web clients — no https
needed for localhost. A physical device needs an https tunnel; see §3c.)

---

## 1. Start the exchange server (harness)

```bash
cd /home/ngocanh/audric-build/phase0-gate
npm install        # first time only
npm run gate
```

It prints the browser sign-in URL and the app endpoints. Leave it running.

---

## 2. Path A — browser gate (no app needed)

Open the printed `accounts.google.com/...` URL, sign in, read the **ADDRESS** on
the result page and in the terminal. Sign in again with the same account → it
prints `PARITY ✓`. This proves the *server* path; do it first.

---

## 3. Path B — app gate (the real native flow)

```bash
cd /home/ngocanh/audric-build/audric/apps/mobile
npx expo run:ios       # or: npx expo run:android   (a dev build; Expo Go won't
                       # carry the custom URL scheme reliably)
```

`.env.local` already points the app at `http://localhost:3002`. Tap **Continue
with Google** → the system browser opens Google → Google redirects to the
harness `/auth/bridge` → the harness 302s back to `audric://callback` → the app
POSTs `code` + PKCE verifier to `/exchange` → the screen shows the derived
address and `✓ aud matches`.

Networking, per target:

- **a) iOS simulator** — `http://localhost:3002` reaches the host. Works as-is.
- **b) Android emulator** — map the port first:
  ```bash
  adb reverse tcp:3002 tcp:3002
  ```
  then `http://localhost:3002` resolves to the host. Works as-is.
- **c) Physical device** — localhost is the phone itself. Expose the harness over
  https with a tunnel and point the app at it:
  ```bash
  cloudflared tunnel --url http://localhost:3002      # prints https://XXXX.trycloudflare.com
  ```
  - set `EXPO_PUBLIC_EXCHANGE_BASE_URL=https://XXXX.trycloudflare.com` in `.env.local`
  - add `https://XXXX.trycloudflare.com/auth/bridge` to the Google Web client redirect URIs
  - restart Expo so the new env inlines, rebuild.

---

## 4. The comparison (PASS / FAIL)

Sign in to the **live web app** (`audric.ai`) with the **same Google account**
and read its wallet address.

- **PASS** — native address (terminal `ADDRESS` + app card) == web address, and
  `aud` shows ✓ on every path. Phase 0 is cleared; app build may proceed.
- **FAIL** — addresses differ, or `aud` shows ✗. **Stop.** Do not build wallet
  features. The cause is almost always a different OAuth client id (`aud`) on one
  side, or a different Enoki salt holder. Reconcile the client id first
  (mobile/web/harness must all use the one **Web** client id), then re-run.

---

## Files

- `phase0-gate/gate.mjs` — exchange server: `/auth/callback` (browser),
  `/auth/bridge` (302 → app scheme), `POST /exchange` (JSON, native).
- `apps/mobile/src/auth/` — `config · pkce · google · exchange · session · useAuth`.
- `apps/mobile/src/app/index.tsx` — the Phase 0 screen (the only screen yet).

## Security

- The `client_secret` lives only in `phase0-gate/.env` (outside any git repo) and
  is never sent to the device. **Delete the raw downloaded
  `client_secret_*.json`** once `.env` is set — it should not linger in plaintext.
- The app ships no secret: `EXPO_PUBLIC_*` values are the public client id and the
  exchange URL only.
