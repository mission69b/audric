# B1 — Mobile Session Auth (design)

> Closes blocker **B1** in `PROD_READINESS.md`: the four Expo Router data routes
> (`chat`, `history`, `messages`, `user`) trust a client-asserted `userId`, and
> `productionGate()` hard-403s them in prod. This wires real `audric_session`
> auth so identity is derived server-side from a signed token — parity with web-v3.
> Approved 2026-07-04. Transport = `Authorization: Bearer`. Verify = local mirror.

## Principle

Reuse web-v3's session **verbatim**. `packages/auth/src/server.ts` mints a stateless
HS256 token over `AUTH_SECRET` (`sub` = Sui address, payload `{ email }`, 7-day cap) —
no server session store. A mobile session token is byte-identical to a web one; the same
`AUTH_SECRET` verifies both. We add **minting to the mobile exchange** and **verification
to the mobile backend** — no new crypto, no new token shape.

## Flow

```
sign-in → web-v3 /api/mobile-auth/exchange
            verifyGoogleJwt + deriveAddress (unchanged)
            + mintSessionToken({ id: address, email }, now+7d)   ← NEW
            → { address, email, aud, audMatch, token, expiresAt }
mobile      store token in SecureStore (StoredSession.token)     ← NEW
            attach `Authorization: Bearer <token>` on every       ← NEW
            call to /api/{chat,history,messages,user}
mobile +api authenticate(request): verify HS256 with AUTH_SECRET  ← NEW
            userId = token.sub   (client-asserted userId dropped)
            replaces productionGate()
```

## Components

**Mint — `apps/web-v3/app/api/mobile-auth/exchange/route.ts`**
After the existing derive + upsert, `mintSessionToken({ id: address, email }, Date.now() +
7d)` and add `token` + `expiresAt` to the JSON. `mintSessionToken` is already re-exported by
`@/lib/audric-auth`. Same 7-day `MAX_SESSION_MS` cap as `/api/auth/session`.

**Verify — `apps/mobile/src/auth/session-token.ts` (new, server-only)**
`verifyMobileSession(token) → { id, email } | null` using `jose` `jwtVerify` (HS256,
`AUTH_SECRET`). A deliberate ~15-line mirror of `packages/auth` `verifySessionToken`: the
mobile backend can't import that module (it drags `server-only` + Enoki + `next/headers`),
but this MUST stay byte-compatible — same alg, secret, claim shape. Imported **only** by
`+api` routes (via `api-guard`), so `AUTH_SECRET` never enters the client bundle.

**Policy — `apps/mobile/src/lib/api-guard.ts` (replaces `productionGate`)**
`authenticate(request, clientAssertedUserId) → { ok, userId, email, viaToken } | { ok:false,
response }`:
- `Authorization: Bearer <t>` present → verify. Valid ⇒ `userId = token.sub` (authoritative).
  **Invalid ⇒ 401** — a bad token is never downgraded to guest, even in dev (attack signal).
- No token, **production** ⇒ 401 (nothing unauthenticated ships).
- No token, **development** ⇒ fall back to the client-asserted id (dev bypass / guest;
  may be null ⇒ guest, no persistence). Same dev/prod split `productionGate` already drew,
  upgraded from "prod = 403 always" to "prod = 401 unless a valid session."

**Store — `apps/mobile/src/auth/session.ts`**
Add `token?: string` + `expiresAt?: number` to `StoredSession`. Add pure client helper
`authHeader(token) → { Authorization } | {}`. Dev-bypass sessions carry no token.

**Client attach**
- `useAuth.tsx signIn`: save `derived.token`/`expiresAt` into the session; add `authHeader`
  to the `/api/user` onboarding POST.
- `store.tsx`: live `tokenRef`; add `headers` to the chat transport's
  `prepareSendMessagesRequest` and to the `history` / `messages` / chat-`DELETE` fetches.

## Config

- Add `jose@^6.2.2` to `apps/mobile` (matches `packages/auth`).
- Add `AUTH_SECRET` to `apps/mobile/.env.local` — **same value as web-v3's** (so tokens
  verify), server-only, never `EXPO_PUBLIC_`, gitignored. Document in `.env.example`
  (name + placeholder only).

## Security invariants

- `AUTH_SECRET` is server-only on the mobile backend; the client stores/sends only the
  opaque token — never the secret, never any crypto in the client bundle.
- Identity is always the signed `sub`; a client-supplied `userId` is authoritative only in
  the dev fallback (non-prod, no token). Prod reads identity **only** from a verified token.
- Token minted only for a Google-verified user (the exchange already enforces
  `aud == web client`).
- Ownership checks (messages, delete) unchanged — now keyed off the verified id.

## Out of scope (B1)

Anonymous/guest mobile chat with a free-tier quota (web-v3 allows anonymous free-model
chat; the mobile chat route still needs rate-limit + quota before that — tracked separately).
Biometric-gated token access (Face ID lands in a later phase). Token refresh/rotation
(7-day expiry → re-sign-in, same as web).

## Verification

Typecheck mobile + web-v3. Manual: dev bypass still enters + persists (dev fallback);
a real signed-in call carries the Bearer and the route derives the same address; a
tampered/absent token in a prod build → 401.
