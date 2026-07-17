# Design — Real on-device USDC/SUI send (mobile, testnet)

**Date:** 2026-07-14
**Status:** Draft for review
**Scope:** `apps/mobile` (Expo/React Native) + one additive change to the web-v3 mobile-auth **exchange** endpoint.
**Ships to prod?** **No.** Testnet / dev-client only, behind the Phase-0 parity gate. No wallet-touching code ships to production until same-Google→same-Sui-address passes with production keys.

---

## 1. Problem

The wallet **Send** flow is a mock: `store.confirmSend` fakes the transfer with a `setTimeout`, and the success screen shows a hard-coded `SEND_DIGEST` that links nowhere. The standing directive is "no mock anymore" — Send must move real value on testnet: real recipient, real amount, real on-device signing, real digest → real Suiscan link.

The blocker is architectural. To sign a Sui transaction the device needs a **zkLogin signature** = ephemeral-key signature wrapped with a **zkProof**. Today the device has the ephemeral secret (in `pending-auth`) but **no proof**: the exchange server consumes the Google JWT server-side and returns only `{address, email, token}`. So on-device signing is not wired end-to-end.

## 2. Goals / non-goals

**Goals**
- Deliver a device-usable zkProof without weakening the current auth security posture.
- Real testnet transfer: on-device build → zkLogin sign → broadcast → real digest.
- Real recipient input (paste `0x…` / resolve SuiNS) and real amount input.
- Honest UI: real balance guard, real digest, real explorer link; clear errors (no silent failure).

**Non-goals (this spec)**
- Shipping to production (Phase-0 gate stays closed).
- Gasless USDC in the first milestone (upgrade after signing is proven — see §8).
- Any change to how the Sui **address** is derived (parity path is unchanged and already proven).
- Biometric-gated signing (nice-to-have; tracked, not required for testnet).

## 3. Chosen approach (and why)

**Authorization Code + PKCE + exchange, extended to return a server-computed proof ("Path A1").**

Rationale:
- **RFC 8252 (OAuth 2.0 for Native Apps)** mandates auth-code + PKCE for native apps and rejects the implicit flow; **OAuth 2.1** removes implicit entirely. The existing mobile flow is already compliant — keep it.
- **Address parity**: the zkLogin address derives from `(iss, aud, sub, salt)`. `aud` = OAuth client_id. Parity with web requires the **Web** client_id, whose code→token swap needs the client_secret → must stay server-side (the exchange). This is the proven testnet path; do not disturb it.
- **Least exposure**: the exchange already holds the verified JWT. Having it compute the proof (one extra Enoki call) means **the JWT never reaches the device** — strictly less sensitive material on-device than web-v3, which keeps the raw JWT in `localStorage`.
- **Non-custodial**: the ephemeral secret is generated on-device and never transmitted; the server cannot sign. The returned proof is bound (via the nonce) to the device's ephemeral public key, so it is only usable by the holder of the on-device ephemeral secret.

Rejected alternative — **implicit flow (Path B)**: deprecated by RFC 8252 / OAuth 2.1 for native; with the Web client_id it still needs the https bridge and would leak the JWT to the device over a deep link; with a Native client_id `aud` changes → **address parity breaks**. Strictly worse on every axis.

## 4. Architecture — three layers

```
Layer 1  AUTH: proof delivery            (auth/* + exchange endpoint)
Layer 2  WALLET: build / sign / execute  (new src/lib/wallet/*)
Layer 3  UI: real Send flow              (send-sheet.tsx + store.tsx)
```

### Layer 1 — Proof delivery (get signing material on-device)

Today (unchanged): `google.ts` creates an Ed25519 ephemeral keypair + Enoki `createZkLoginNonce({ephemeralPublicKey, additionalEpochs:7})`, stores `{ephemeralSecret, randomness, maxEpoch, expiresAt}` in `pending-auth` (SecureStore), runs Google OAuth (code+PKCE), and posts the code to the exchange.

Changes:
- **Device → exchange (request):** additionally send the **public** nonce inputs `{ephemeralPublicKey, randomness, maxEpoch}` alongside the auth code. (None are secrets; `randomness`/`maxEpoch` are already committed inside the JWT's `nonce`.)
- **Exchange (server):** after the existing code→JWT swap + `aud==web` verification + address derivation, make one additional Enoki call `createZkLoginZkp({ network, jwt, ephemeralPublicKey, randomness, maxEpoch })` → `proof`. Return the existing fields **plus** `{ proof, maxEpoch }`. The JWT is not returned.
- **Device (exchange.ts → useAuth):** on success, write a **new** SecureStore record `wallet-keys`:
  `{ ephemeralSecret, proof, maxEpoch, address, expiresAt }`.
  The `ephemeralSecret` moves from `pending-auth` into `wallet-keys` (then `pending-auth` is cleared). `StoredSession` is unchanged (still holds only the API session token). Sign-out clears `wallet-keys` too.

Security invariants preserved: ephemeral secret on-device-only; JWT server-only; client_secret server-only; `aud==web` parity unchanged; server cannot sign.

### Layer 2 — Wallet send module (new)

`@t2000/sdk` is **not** a mobile client dependency, so reimplement the four functions it provides, using `@mysten/sui` + `@mysten/enoki` (both already installed). New files under `src/lib/wallet/`:

- **`keys.ts`** — `saveWalletKeys` / `loadWalletKeys` / `clearWalletKeys` (SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`); `WalletKeys` type; `isProofExpired(keys)` (compares `maxEpoch` to the current epoch, or `expiresAt` to now).
- **`signer.ts`** — `ZkLoginSigner`: holds `Ed25519Keypair.fromSecretKey(ephemeralSecret)`, `proof`, `maxEpoch`, `address`. `signTransaction(txBytes)` = ephemeral sign → `getZkLoginSignature({ inputs: proof, maxEpoch, userSignature })` from `@mysten/sui/zklogin`.
- **`build.ts`** — transaction builders:
  - **Milestone 1 (SUI, gas-native):** `buildSuiTransferTx({ address, to, amountRaw })` → `tx.setSender`, `const [c] = tx.splitCoins(tx.gas, [amountRaw]); tx.transferObjects([c], to)`.
  - **Milestone 2 (USDC, gasless):** `buildStableSendTx(...)` → `tx.moveCall({ target:"0x2::balance::send_funds", typeArguments:[coinType], arguments:[tx.balance({type:coinType, balance:amountRaw}), tx.pure.address(to)] })`. `amountRaw = BigInt(Math.round(amount * 1e6))` (6 decimals). Built through `SuiGrpcClient` so the resolver zeroes gas.
- **`send.ts`** — `sendTransfer({ to, amount, asset })`: load `wallet-keys` (throw if missing / `isProofExpired`), build the appropriate tx, `executeTx(client, signer, buildTx)` = `tx.build({ client })` → `signer.signTransaction` → `client.core.executeTransaction({ transaction, signatures:[sig], include:{effects:true} })` → `waitForTransaction` → `{ digest }`. Client = `SuiGrpcClient` (testnet base URL from `SUI_NETWORK`).
- **`screen.ts`** — `preflightSend({ to, amount, asset })` (address shape via `SUI_ADDRESS` regex, finite positive amount, min bound) + a 60s in-memory retry-dedup keyed `asset:amount:to` to block accidental double-taps.
- **`suins.ts`** — `resolveRecipient(input)`: if `input` matches `0x[0-9a-f]{64}` return it; else normalize (`name@audric → name.audric.sui`, bare `.sui` passthrough) and resolve via Sui GraphQL (mirror `resolveSuinsViaRpc`). Returns `{ address, resolved }` or throws `InvalidRecipient`.

### Layer 3 — UI (replace the mock)

- **`send-sheet.tsx`**:
  - Recipient row: replace the `alice.audric ↔ 0x…` toggle with a `TextInput` (paste address or SuiNS). On blur/confirm, `resolveRecipient` → show resolved `0x…` (truncated) + a checkmark, or an inline error.
  - Amount: replace the fixed 25-step stepper with a numeric `TextInput` (decimal, asset-aware). Keep +/- as convenience but allow free entry.
  - Insufficient guard: compare against **real** `useBalance().usdc` (M2) / `sui` (M1), not `SPENDABLE_USDC`.
  - Success: show the **real** `digest` (truncated) → `openExternal(suiscanTxUrl(digest))`.
  - New **error** stage: message + Retry/Close.
- **`store.tsx`**:
  - Send state: `recipientInput: string`, `resolvedTo: string | null`, `amount: number`, `stage: "confirm"|"sending"|"success"|"error"`, `digest: string | null`, `sendError: string | null`.
  - `confirmSend` becomes **async**: `preflightSend` → `sendTransfer` → `stage="success"` with `digest`, or `stage="error"` with message. No `setTimeout`.
  - Remove the fake `SEND_DIGEST` usage and the `SPENDABLE_USDC` display coupling (constant already flagged; delete once send-sheet no longer references it).

## 5. Data flow (Milestone 1, SUI)

```
Sign-in (once):
 device: ephemeral keypair + Enoki nonce ──code+{ephPub,randomness,maxEpoch}──► exchange
 exchange: code→JWT, verify aud==web, derive address, Enoki createZkLoginZkp
 exchange ──{address,email,token,proof,maxEpoch}──► device
 device: SecureStore wallet-keys = {ephemeralSecret, proof, maxEpoch, address}

Send:
 user: enter recipient + amount → tap Allow & Send
 device: resolveRecipient → preflightSend → buildSuiTransferTx
 device: SuiGrpcClient.build → ZkLoginSigner.sign → executeTransaction → waitForTransaction
 device: stage=success(digest) → Suiscan link
```

## 6. Error handling (no silent failure)

Every failure surfaces to the user via the `error` stage with a specific message; nothing is swallowed. Cases:
- Not signed in / no `wallet-keys` → "Sign in to send."
- Proof expired (`isProofExpired`) → "Session expired — sign in again." (prompt re-auth)
- Invalid recipient (bad address / SuiNS miss) → inline field error, block send.
- Insufficient balance → existing warn banner, block send.
- Build/sign/broadcast throw → `error` stage with `name: message` (no secrets logged).
- Duplicate within 60s → blocked by dedup with a "already sending" note.

Secrets are never logged (no ephemeral secret / proof / token in console).

## 7. Security notes

- Non-custodial: server never receives the ephemeral secret; cannot sign.
- JWT stays server-side (never on device).
- `wallet-keys` in hardware-backed keystore (`expo-secure-store`), device-only, cleared on sign-out.
- Proof lifetime bounded by `maxEpoch` (~7 additional epochs); expiry forces re-auth.
- Tap-to-confirm is the authorization gate; recipient + amount + asset shown before signing.
- Testnet-only: `SUI_NETWORK` gates the client + explorer network; real digest/link only for real sends.
- **Phase-0 gate remains closed** — none of this ships to production until the production-key address-parity gate passes.

## 8. Milestones

- **M1 — Signing path (SUI, gas-native).** Layer 1 + Layer 2 (`keys/signer/build.buildSuiTransferTx/send/screen`) + Layer 3 UI. Outcome: real testnet SUI transfer, real digest → Suiscan. Proves the hard part end-to-end.
- **M2 — Gasless USDC.** Add `build.buildStableSendTx` (`send_funds` via gRPC) + `suins.ts` resolve + asset switch. **Gated on two spikes** (§9).

## 9. Open risks / de-risk spikes (run before/inside M2)

1. **`SuiGrpcClient` (gRPC-web) under React Native / Hermes.** May lack HTTP/2 semantics. If broken, gasless detection fails. Spike: build+execute a trivial gRPC tx from the dev client on testnet. Fallback: Enoki `createSponsoredTransaction` / `executeSponsoredTransaction` (adds an Enoki-secret +api route) — only if needed.
2. **Testnet gasless-stablecoin availability.** The `0x2::balance::send_funds` allowlist + USDC coin type in the reference are **mainnet**. Testnet may lack the allowlist/coin. Spike: confirm a testnet USDC coin type + allowlist, else M2 is mainnet-only (still behind the Phase-0 gate) and M1 (SUI) remains the testnet-provable path.

## 10. Files

**Modify**
- `src/auth/google.ts` — send `{ephemeralPublicKey, randomness, maxEpoch}` to exchange.
- `src/auth/exchange.ts` — parse `{proof, maxEpoch}` from response; type update.
- `src/auth/useAuth.tsx` — persist `wallet-keys` on sign-in; clear on sign-out.
- `src/auth/pending-auth.ts` — hand ephemeral secret to `wallet-keys` (or keep as source; clear after).
- web-v3 mobile-auth **exchange endpoint** — one additive Enoki `createZkLoginZkp` call + return `{proof, maxEpoch}` (locate exact route during planning; additive/back-compatible).
- `src/components/wallet/send-sheet.tsx` — real recipient + amount inputs, real digest, error stage.
- `src/app-state/store.tsx` — async `confirmSend`, real send state, drop fake digest / SPENDABLE display coupling.

**Create**
- `src/lib/wallet/keys.ts`, `signer.ts`, `build.ts`, `send.ts`, `screen.ts`, `suins.ts`.

## 11. Testing

- **Unit (pure):** `displayToRaw` decimals, `preflightSend` bounds, `resolveRecipient` normalization (`@`→`.sui`, 0x passthrough), `isProofExpired`.
- **Integration (dev client, testnet):** sign in → confirm `wallet-keys` populated → SUI transfer → assert real digest resolves on Suiscan → balance/activity update via existing `useBalance`/`useTransactions`.
- **Negative:** expired proof → re-auth prompt; invalid recipient → blocked; insufficient balance → blocked; duplicate tap → deduped.
- **Typecheck:** `node_modules/.bin/tsc --noEmit -p tsconfig.json` clean for changed files.
