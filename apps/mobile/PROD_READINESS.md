# Audric Mobile — Production Readiness

> **What this is:** an honest audit of what stands between the current mobile build
> and a shippable v1, measured against the live web-v3 surface.
> **Scope:** v1 per `docs/active/SPEC_AUDRIC_MOBILE_BUILD.md` §1 —
> auth (zkLogin) · text chat (streaming) · model switcher · Private Memory ·
> Pay (balance / receive / send USDC + USDsui) · push.
> **Method:** source audit of `apps/mobile/src` + web-v3 API routes, 2026-07-04.
> **Working doc (mobile team / Rowan).** Not funkii's canonical spec.

Legend: 🔴 hard blocker (app broken in prod without it) · 🟠 v1 parity gap (mock, not wired) ·
🟡 release/infra · ✅ already real · ⚪ correctly deferred (not v1).

---

## 🔴 Hard blockers

### B1 — Session authentication (unlocks chat + history + user)
The four Expo Router API routes (`chat`, `history`, `messages`, `user` under
`apps/mobile/src/app/api/*+api.ts`) trust a **client-asserted** `userId` in the body /
query string. `apps/mobile/src/lib/api-guard.ts` `productionGate()` therefore **hard-403s
all of them when `NODE_ENV === "production"`.** A prod build has *no working chat or
history at all* until real auth lands.

Compounding it: **nothing mints a session today.** `apps/mobile/src/auth/exchange.ts`
returns only `{ address, email, aud, audMatch }` — no credential. `session.ts` stores just
the address locally. So "wire auth" is two pieces, not one:

1. **Issue** — the exchange server (or a new `/api/mobile-auth/session` route) mints a
   signed, httpOnly `audric_session` bound to the verified Sui address, after the
   code→id_token→derive step. Reuse web-v3's session signing (`@audric/auth`).
2. **Consume** — mobile stores it in `expo-secure-store`, sends it on every data-route
   call; each route derives identity **from the verified cookie, never the client**, then
   `productionGate()` is replaced by that check.

⚠️ Do **not** add an env escape hatch to lift the gate — that ships the trust model without
the auth it presumes (the api-guard comment says exactly this).
**Gate:** auth-touching. **Depends on:** login parity signed off first.

### B2 — Real wallet + zkLogin signing (unlocks Pay — in v1 scope)
Pay is entirely mock today:

- **Send** — `apps/mobile/src/components/wallet/send-sheet.tsx`: *"Mock only — `confirmSend`
  fakes the transfer."* Fabricated digest, no on-chain tx.
- **Balance** — `apps/mobile/src/app-state/store.tsx`: fake balances from the catalog, not
  on-chain. web-v3 already has a real reader at `apps/web-v3/app/api/wallet/balance/route.ts`.
- **Receive** — `apps/mobile/src/components/wallet/receive-sheet.tsx`: fake-but-stable QR
  matrix, Copy inert, address from the mock catalog (not the derived wallet).

Root cause: **no zkLogin signing path exists.** A real Send needs the ephemeral keypair +
ZK proof + salt (Enoki) to build/sign/submit a Sui transfer. `session.ts` still flags the
address as possibly a placeholder.

Sequence within B2 (low → high risk):
1. **Balance (read-only)** — wire mobile to the real balance source. No signing, low risk.
2. **Receive** — render a real QR of the derived address; wire Copy. No signing.
3. **Send (money)** — zkLogin ephemeral key + Enoki proof → build/sign/submit tx. **Highest
   risk; Phase-0 gate; no fake digests ever.**

**Gate:** money-touching. Non-custodial → correctness non-negotiable.

---

## 🟠 v1 parity gaps (mock, not wired)

- **Tool cards** — `apps/mobile/src/lib/types.ts`: web_search sources/citations,
  `balance_check`, `transaction_history`, `save_memory` are **mock UI**, not real tool-call
  parts. Chat demo turns (wallet/image/video/artifact) are fabricated, not model output.
- **Private Memory** — `store.tsx` `memoryOn` is a local `useState(false)` toggle that
  **never reaches `chat+api`** and `save_memory` is mock → no memory persistence. UI is
  correct (OFF-by-default = the privacy promise); the backend is absent.
- **Push notifications** — v1 scope, but **no `expo-notifications` / push-token
  registration anywhere.** Not started.
- **Vote (up/down)** — `conversation.tsx`: local visual state, no backend.

---

## 🟡 Release / infra

- **No `apps/mobile/eas.json`** — need EAS build + dev/prod profiles for cloud builds.
- Prod `EXPO_PUBLIC_*` must point at real `audric.ai` (not the funnel / localhost).
- Exchange + session routes deployed on prod web-v3 (Vercel) with `GOOGLE_CLIENT_SECRET`
  present server-side only.
- App Store / Play Store listings, signing certs, and push certs (APNs / FCM).

---

## ✅ Already real / correct

- Chat streaming (real model call, `chat+api.ts` → `lib/ai/providers`), chat + history
  persistence to Neon.
- Model switcher, CoT timeline component (`cot-timeline.tsx`), onboarding, biometric lock.
- All four tabs built (chat / wallet / settings / skills) — `Placeholder` is only an
  unknown-tab fallback, not a stubbed screen.
- Plans = "COMING SOON" — **matches web-v3** (`lib/credit/tiers.ts` COMING_SOON); parity, not a gap.
- `__DEV__` bypass (stub `0xde…de`) is already `__DEV__`-gated out of prod.

## ⚪ Correctly deferred (not v1)

image/video gen · image edit/upscale · attachment upload + vision · artifacts/documents ·
@handle identity · SSE resume · on-chain USDC top-up on iOS.

---

## Recommended sequence

1. **Login parity** *(in progress)* — funkii registers the redirect URI → same-Google →
   same-Sui-address verified with prod keys → Phase-0 sign-off. Foundation for everything.
2. **B1 session auth** — highest leverage; unlocks chat + history + user in a prod build.
   Issue `audric_session` from the exchange, consume it in the routes, lift `productionGate()`.
3. **B2 wallet** — Balance (read-only) → Receive → **Send** (zkLogin signing, money, gated).
4. **Parity gaps** — real tool cards, Private Memory backend, push.
5. **Release** — `eas.json`, prod env, deploy, store + push certs.

Blockers are ordered by dependency: 1 → 2 → 3. Nothing after login is safe to ship until
session auth exists, and Pay can't be real until zkLogin signing does.
