# Mobile Real Send (M1: testnet SUI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the wallet Send flow move real value on testnet — real recipient, real amount, on-device zkLogin signing, real digest → real Suiscan link — via a gas-native SUI transfer.

**Architecture:** Extend the web-v3 mobile-auth exchange to return a server-computed zkProof (JWT stays server-side) so the device can sign. Add a mobile `src/lib/wallet/*` module that reimplements the four `@t2000/sdk` send primitives with `@mysten/sui`, using a JSON-RPC `SuiClient` (no gRPC in M1). Replace the mock Send UI with real inputs.

**Tech Stack:** Expo ~57 / React Native 0.86, `@mysten/sui ^2.17`, `@mysten/enoki ^1.1`, `expo-secure-store`, `jest-expo` (new). Server change: Next.js route in `apps/web-v3` + `packages/auth`.

## Global Constraints

- **Testnet / dev-client only. Phase-0 gate stays CLOSED** — no wallet-touching code ships to production until same-Google→same-Sui-address passes with production keys.
- **Non-custodial:** ephemeral secret is generated on-device and NEVER transmitted; the server never holds signing material.
- **JWT never leaves the server;** `GOOGLE_CLIENT_SECRET` server-only.
- **SUI has 9 decimals;** USDC/USDsui have 6. M1 is SUI only.
- **Transport = gRPC (`SuiGrpcClient` from `@mysten/sui/grpc`), on-device.** In `@mysten/sui@2.17` the old `SuiClient`/`getFullnodeUrl` from `@mysten/sui/client` DO NOT EXIST — the codebase client is `SuiGrpcClient`, and JSON-RPC fullnodes sunset 2026-07-31 (per web-v3 `lib/identity/custody.ts:51`). Mirror web-v3 `lib/wallet/send.ts` exactly. Task 8 is the gRPC-under-React-Native de-risk gate. Documented fallback if gRPC can't run under Hermes: server-relayed build/broadcast via new `+api.ts` routes (device still signs; server sees only bytes+signature). Do NOT introduce the fallback pre-emptively.
- Enoki proof network MUST equal the nonce network: mobile `EXPO_PUBLIC_SUI_NETWORK` == web-v3 `NEXT_PUBLIC_SUI_NETWORK`.
- web-v3 rule 5: never `process.env.X` in web-v3 app code — use the typed `env` proxy. (`packages/auth` reads `process.env` by its own convention; mobile Expo code uses `process.env.EXPO_PUBLIC_*` — both OK.)
- Mobile typecheck: `node_modules/.bin/tsc --noEmit -p tsconfig.json`. Lint: `expo lint`.
- Commit convention: `emoji type(scope): subject` — lowercase subject, always emoji, no "Generated with Claude"/Co-Authored-By. Scopes: `auth`, `ui`, `api`. Do NOT commit unless the user asks; steps below stage + show the message for when they do.
- Secrets never logged (no ephemeral secret / proof / token / JWT in console).

---

## File Structure

**Create (mobile)**
- `src/lib/wallet/amount.ts` — decimal ↔ raw base-unit conversion (pure).
- `src/lib/wallet/screen.ts` — `preflightSend` validation + 60s double-send dedup (pure).
- `src/lib/wallet/recipient.ts` — SuiNS normalize + resolve (pure normalize + network resolve).
- `src/lib/wallet/keys.ts` — `WalletKeys` type + SecureStore save/load/clear + `isProofExpired`.
- `src/lib/wallet/signer.ts` — `ZkLoginSigner` (ephemeral sign + `getZkLoginSignature`).
- `src/lib/wallet/build.ts` — `buildSuiTransferTx` (gas-native SUI PTB).
- `src/lib/wallet/send.ts` — `sendSui` (load keys → build → sign → execute → digest).
- `src/lib/wallet/*.test.ts` — unit tests for the pure files.
- `jest.config.js` — jest-expo preset.

**Modify (mobile)**
- `package.json` — add `jest`, `jest-expo`, `@types/jest`; add `"test": "jest"`.
- `src/auth/exchange.ts` — send `{ephemeralPublicKey, randomness, maxEpoch}`; parse `{proof, maxEpoch}`.
- `src/auth/useAuth.tsx` — persist `wallet-keys` on sign-in; clear on sign-out.
- `src/components/wallet/send-sheet.tsx` — real recipient + amount inputs, real digest, error stage.
- `src/app-state/store.tsx` — real send state + async `confirmSend`; drop fake `SEND_DIGEST` / `SPENDABLE_USDC` display coupling.

**Modify (server)**
- `packages/auth/src/server.ts` — add `createZkProof`.
- `packages/auth/src/index.ts` — export `createZkProof` (if it has a barrel; else import path stays `@/…`).
- `apps/web-v3/app/api/mobile-auth/exchange/route.ts` — accept nonce inputs, call `createZkProof`, return `{proof, maxEpoch}` (additive, back-compatible).

---

### Task 1: Test infra + amount conversion

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`, `src/lib/wallet/amount.ts`, `src/lib/wallet/amount.test.ts`

**Interfaces:**
- Produces: `toRawUnits(amount: number, decimals: number): bigint`, `SUI_DECIMALS = 9`, `USDC_DECIMALS = 6`.

- [ ] **Step 1: Install test deps**

Run:
```bash
cd /home/ngocanh/audric-build/audric/apps/mobile
pnpm add -D jest jest-expo @types/jest
```

- [ ] **Step 2: Add the jest config**

Create `jest.config.js`:
```js
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@mysten/.*))",
  ],
};
```

- [ ] **Step 3: Add the test script**

In `package.json` `"scripts"`, add:
```json
"test": "jest"
```

- [ ] **Step 4: Write the failing test**

Create `src/lib/wallet/amount.test.ts`:
```ts
import { SUI_DECIMALS, toRawUnits, USDC_DECIMALS } from "./amount";

describe("toRawUnits", () => {
  it("converts whole SUI to 9-decimal base units", () => {
    expect(toRawUnits(1, SUI_DECIMALS)).toBe(1_000_000_000n);
  });
  it("converts fractional SUI without float drift", () => {
    expect(toRawUnits(0.25, SUI_DECIMALS)).toBe(250_000_000n);
  });
  it("converts USDC at 6 decimals", () => {
    expect(toRawUnits(2.5, USDC_DECIMALS)).toBe(2_500_000n);
  });
  it("rounds to the nearest base unit", () => {
    expect(toRawUnits(0.0000000004, SUI_DECIMALS)).toBe(0n);
    expect(toRawUnits(0.0000000006, SUI_DECIMALS)).toBe(1n);
  });
});
```

- [ ] **Step 5: Run it, verify it fails**

Run: `pnpm test -- amount`
Expected: FAIL — cannot find module `./amount`.

- [ ] **Step 6: Implement**

Create `src/lib/wallet/amount.ts`:
```ts
// Base-unit conversion for on-chain amounts. SUI = 9 decimals, USDC/USDsui = 6.
// Uses Math.round on the scaled value to avoid binary-float drift on typical
// human inputs, then BigInt for the exact base-unit integer.
export const SUI_DECIMALS = 9;
export const USDC_DECIMALS = 6;

export function toRawUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("amount must be a finite, non-negative number");
  }
  return BigInt(Math.round(amount * 10 ** decimals));
}
```

- [ ] **Step 7: Run it, verify it passes**

Run: `pnpm test -- amount`
Expected: PASS (4 tests).

- [ ] **Step 8: Stage + commit message (do not commit unless asked)**

```bash
git add apps/mobile/package.json apps/mobile/jest.config.js apps/mobile/src/lib/wallet/amount.ts apps/mobile/src/lib/wallet/amount.test.ts apps/mobile/pnpm-lock.yaml
# ✨ feat(ui): add mobile test harness + on-chain amount conversion
```

---

### Task 2: Preflight validation + recipient normalization

**Files:**
- Create: `src/lib/wallet/screen.ts`, `src/lib/wallet/screen.test.ts`
- Create: `src/lib/wallet/recipient.ts`, `src/lib/wallet/recipient.test.ts`

**Interfaces:**
- Produces:
  - `SUI_ADDRESS = /^0x[0-9a-f]{64}$/`
  - `preflightSend(input: { to: string; amount: number; asset: "SUI"|"USDC" }): { ok: true } | { ok: false; reason: string }`
  - `markSendDispatched(key: string): void`, `isDuplicateSend(key: string, nowMs?: number): boolean`, `sendDedupKey(input): string`
  - `normalizeSuins(raw: string): string`, `isSuiAddress(v: string): boolean`

- [ ] **Step 1: Write the failing screen test**

Create `src/lib/wallet/screen.test.ts`:
```ts
import { isDuplicateSend, markSendDispatched, preflightSend, sendDedupKey } from "./screen";

const ADDR = `0x${"a".repeat(64)}`;

describe("preflightSend", () => {
  it("accepts a well-formed send", () => {
    expect(preflightSend({ to: ADDR, amount: 1, asset: "SUI" })).toEqual({ ok: true });
  });
  it("rejects a malformed address", () => {
    const r = preflightSend({ to: "0x123", amount: 1, asset: "SUI" });
    expect(r.ok).toBe(false);
  });
  it("rejects a non-positive amount", () => {
    expect(preflightSend({ to: ADDR, amount: 0, asset: "SUI" }).ok).toBe(false);
    expect(preflightSend({ to: ADDR, amount: -1, asset: "SUI" }).ok).toBe(false);
  });
});

describe("dedup", () => {
  it("flags a repeat within the window", () => {
    const key = sendDedupKey({ to: ADDR, amount: 1, asset: "SUI" });
    markSendDispatched(key, 1000);
    expect(isDuplicateSend(key, 5000)).toBe(true);   // 4s later
    expect(isDuplicateSend(key, 62_000)).toBe(false); // >60s later
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test -- screen`
Expected: FAIL — cannot find module `./screen`.

- [ ] **Step 3: Implement screen.ts**

Create `src/lib/wallet/screen.ts`:
```ts
// Pre-dispatch checks. NOT the authorization gate (the tap-to-confirm is) — these
// catch fat-finger errors and accidental double-taps before we build a tx.
export const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const DEDUP_WINDOW_MS = 60_000;
const MIN_AMOUNT = 0.000000001; // one base unit of SUI

type SendInput = { to: string; amount: number; asset: "SUI" | "USDC" };

export function preflightSend(input: SendInput): { ok: true } | { ok: false; reason: string } {
  if (!SUI_ADDRESS.test(input.to)) {
    return { ok: false, reason: "Enter a valid Sui address." };
  }
  if (!Number.isFinite(input.amount) || input.amount < MIN_AMOUNT) {
    return { ok: false, reason: "Enter an amount greater than zero." };
  }
  return { ok: true };
}

export function sendDedupKey(input: SendInput): string {
  return `${input.asset}:${input.amount}:${input.to}`;
}

const lastDispatch = new Map<string, number>();

export function markSendDispatched(key: string, nowMs: number = Date.now()): void {
  lastDispatch.set(key, nowMs);
}

export function isDuplicateSend(key: string, nowMs: number = Date.now()): boolean {
  const at = lastDispatch.get(key);
  return at != null && nowMs - at < DEDUP_WINDOW_MS;
}
```

- [ ] **Step 4: Write the failing recipient test**

Create `src/lib/wallet/recipient.test.ts`:
```ts
import { isSuiAddress, normalizeSuins } from "./recipient";

describe("normalizeSuins", () => {
  it("maps @audric handles to .sui names", () => {
    expect(normalizeSuins("alice@audric")).toBe("alice.audric.sui");
  });
  it("passes through .sui names", () => {
    expect(normalizeSuins("bob.sui")).toBe("bob.sui");
  });
  it("lowercases + trims", () => {
    expect(normalizeSuins("  Bob.Sui  ")).toBe("bob.sui");
  });
});

describe("isSuiAddress", () => {
  it("accepts 0x + 64 hex", () => {
    expect(isSuiAddress(`0x${"a".repeat(64)}`)).toBe(true);
  });
  it("rejects short strings", () => {
    expect(isSuiAddress("0xabc")).toBe(false);
  });
});
```

- [ ] **Step 5: Run it, verify it fails**

Run: `pnpm test -- recipient`
Expected: FAIL — cannot find module `./recipient`.

- [ ] **Step 6: Implement recipient.ts**

Create `src/lib/wallet/recipient.ts`:
```ts
import { SUI_ADDRESS } from "./screen";
import { SUI_NETWORK } from "@/lib/audric-web";

const SUINS_GRAPHQL = SUI_NETWORK === "mainnet"
  ? "https://sui-mainnet.mystenlabs.com/graphql"
  : "https://sui-testnet.mystenlabs.com/graphql";

export function isSuiAddress(v: string): boolean {
  return SUI_ADDRESS.test(v.trim().toLowerCase());
}

// alice@audric → alice.audric.sui ; bob.sui passes through ; trims + lowercases.
export function normalizeSuins(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (name.includes("@")) {
    const [label, domain] = name.split("@");
    return `${label}.${domain}.sui`;
  }
  return name;
}

// Resolve a recipient string to a 0x address. 0x input passes straight through;
// otherwise resolve the SuiNS name via the Sui GraphQL endpoint. Throws on miss.
export async function resolveRecipient(
  raw: string
): Promise<{ address: string; resolved: string | null }> {
  const input = raw.trim().toLowerCase();
  if (isSuiAddress(input)) {
    return { address: input, resolved: null };
  }
  const name = normalizeSuins(input);
  const res = await fetch(SUINS_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($n: String!) { address: resolveSuinsAddress(domain: $n) { address } }`,
      variables: { n: name },
    }),
  });
  const json = (await res.json()) as { data?: { address?: { address?: string } | null } };
  const address = json.data?.address?.address;
  if (!address) {
    throw new Error(`Couldn't resolve ${name}.`);
  }
  return { address, resolved: name };
}
```

> Note: the GraphQL `resolveSuinsAddress` query shape is verified against the Sui GraphQL schema during the Task 8 integration checkpoint; if the field name differs on the pinned endpoint, adjust the query there (the normalize/isSuiAddress units stay valid).

- [ ] **Step 7: Run both, verify pass**

Run: `pnpm test -- screen recipient`
Expected: PASS.

- [ ] **Step 8: Stage + commit message**

```bash
git add apps/mobile/src/lib/wallet/screen.ts apps/mobile/src/lib/wallet/screen.test.ts apps/mobile/src/lib/wallet/recipient.ts apps/mobile/src/lib/wallet/recipient.test.ts
# ✨ feat(ui): add send preflight, dedup, and recipient resolution
```

---

### Task 3: Wallet-keys store + proof expiry

**Files:**
- Create: `src/lib/wallet/keys.ts`, `src/lib/wallet/keys.test.ts`

**Interfaces:**
- Consumes: `expo-secure-store`.
- Produces:
  - `type ZkProof` (structural, = the proof the exchange returns)
  - `type WalletKeys = { ephemeralSecret: string; proof: ZkProof; maxEpoch: number; address: string; expiresAt: number }`
  - `saveWalletKeys(k: WalletKeys): Promise<void>`, `loadWalletKeys(): Promise<WalletKeys | null>`, `clearWalletKeys(): Promise<void>`
  - `isProofExpired(k: { expiresAt: number }, nowMs?: number): boolean`

- [ ] **Step 1: Write the failing test (pure expiry)**

Create `src/lib/wallet/keys.test.ts`:
```ts
import { isProofExpired } from "./keys";

describe("isProofExpired", () => {
  it("is false before expiry", () => {
    expect(isProofExpired({ expiresAt: 10_000 }, 5_000)).toBe(false);
  });
  it("is true at/after expiry", () => {
    expect(isProofExpired({ expiresAt: 10_000 }, 10_000)).toBe(true);
    expect(isProofExpired({ expiresAt: 10_000 }, 20_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test -- keys`
Expected: FAIL — cannot find module `./keys`.

- [ ] **Step 3: Implement keys.ts**

Create `src/lib/wallet/keys.ts`:
```ts
import * as SecureStore from "expo-secure-store";
import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";

// The zkProof the exchange computes and returns. It feeds getZkLoginSignature's
// `inputs`. Bound (via the sign-in nonce) to the device's ephemeral public key —
// unusable without the on-device ephemeral secret.
export type ZkProof = ZkLoginSignatureInputs;

export type WalletKeys = {
  ephemeralSecret: string; // bech32 — generated on-device, NEVER transmitted
  proof: ZkProof;
  maxEpoch: number;
  address: string;
  expiresAt: number; // unix ms (Enoki estimatedExpiration)
};

const KEY = "audric-wallet-keys";
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function saveWalletKeys(k: WalletKeys): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(k), OPTS);
}

export async function loadWalletKeys(): Promise<WalletKeys | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, OPTS);
    return raw ? (JSON.parse(raw) as WalletKeys) : null;
  } catch {
    return null;
  }
}

export async function clearWalletKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY, OPTS);
}

export function isProofExpired(k: { expiresAt: number }, nowMs: number = Date.now()): boolean {
  return nowMs >= k.expiresAt;
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm test -- keys`
Expected: PASS.

> `saveWalletKeys`/`loadWalletKeys`/`clearWalletKeys` touch the native keystore — exercised in the Task 8 integration checkpoint, not unit-tested (mocking SecureStore would assert only the mock).

- [ ] **Step 5: Typecheck + stage + commit message**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: no new errors in `src/lib/wallet/keys.ts`.
```bash
git add apps/mobile/src/lib/wallet/keys.ts apps/mobile/src/lib/wallet/keys.test.ts
# ✨ feat(auth): persist zkLogin signing keys in the device keystore
```

---

### Task 4: ZkLoginSigner + SUI transfer builder

**Files:**
- Create: `src/lib/wallet/signer.ts`, `src/lib/wallet/build.ts`

**Interfaces:**
- Consumes: `WalletKeys`/`ZkProof` (Task 3), `toRawUnits`/`SUI_DECIMALS` (Task 1).
- Produces:
  - `class ZkLoginSigner { constructor(keypair, proof, address, maxEpoch); getAddress(): string; signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> }`
  - `buildSuiTransferTx(input: { sender: string; to: string; amountRaw: bigint }): Transaction`

- [ ] **Step 1: Implement signer.ts**

Create `src/lib/wallet/signer.ts`:
```ts
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getZkLoginSignature } from "@mysten/sui/zklogin";
import type { ZkProof } from "./keys";

// Mirrors @t2000/sdk's ZkLoginSigner: the ephemeral key signs the tx bytes, then
// getZkLoginSignature wraps that with the zkProof (which carries the addressSeed)
// into the final zkLogin signature Sui verifies.
export class ZkLoginSigner {
  constructor(
    private readonly keypair: Ed25519Keypair,
    private readonly proof: ZkProof,
    private readonly address: string,
    private readonly maxEpoch: number
  ) {}

  getAddress(): string {
    return this.address;
  }

  async signTransaction(txBytes: Uint8Array): Promise<{ signature: string }> {
    const { signature: userSignature } = await this.keypair.signTransaction(txBytes);
    const signature = getZkLoginSignature({
      inputs: this.proof,
      maxEpoch: this.maxEpoch,
      userSignature,
    });
    return { signature };
  }
}
```

- [ ] **Step 2: Implement build.ts**

Create `src/lib/wallet/build.ts`:
```ts
import { Transaction } from "@mysten/sui/transactions";

// Gas-native SUI transfer (M1). Splits the requested amount off the gas coin and
// transfers it — no gasless allowlist (that's the USDC `balance::send_funds` path
// in M2). Pure PTB construction; the client is supplied later at tx.build time.
export function buildSuiTransferTx(input: {
  sender: string;
  to: string;
  amountRaw: bigint;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(input.sender);
  const [coin] = tx.splitCoins(tx.gas, [input.amountRaw]);
  tx.transferObjects([coin], input.to);
  return tx;
}
```

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: no new errors. (If `ZkLoginSignatureInputs` isn't exported from `@mysten/sui/zklogin` in 2.17, fall back to `type ZkProof = Parameters<typeof getZkLoginSignature>[0]["inputs"]` in `keys.ts` and re-run.)

- [ ] **Step 4: Stage + commit message**

```bash
git add apps/mobile/src/lib/wallet/signer.ts apps/mobile/src/lib/wallet/build.ts
# ✨ feat(auth): add on-device zkLogin signer + SUI transfer builder
```

---

### Task 5: Send executor

**Files:**
- Create: `src/lib/wallet/send.ts`

**Interfaces:**
- Consumes: `loadWalletKeys`/`isProofExpired` (Task 3), `ZkLoginSigner` (Task 4), `buildSuiTransferTx` (Task 4), `toRawUnits`/`SUI_DECIMALS` (Task 1), `preflightSend`/`sendDedupKey`/`markSendDispatched`/`isDuplicateSend` (Task 2).
- Produces: `sendSui(input: { to: string; amount: number }): Promise<{ digest: string }>`

- [ ] **Step 1: Implement send.ts**

Create `src/lib/wallet/send.ts`. This mirrors web-v3 `lib/wallet/send.ts` + `lib/identity/custody.ts` (the verified v2.17 pattern — `SuiGrpcClient` + `client.core.executeTransaction` + the `result.$kind` unwrap), swapping the gasless-USDC build for the gas-native SUI build:
```ts
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SUI_NETWORK } from "@/lib/audric-web";
import { SUI_DECIMALS, toRawUnits } from "./amount";
import { buildSuiTransferTx } from "./build";
import { isProofExpired, loadWalletKeys } from "./keys";
import { isDuplicateSend, markSendDispatched, preflightSend, sendDedupKey } from "./screen";
import { ZkLoginSigner } from "./signer";

// gRPC is the migrated transport (JSON-RPC fullnodes sunset 2026-07-31); the same
// SuiGrpcClient builds the tx and broadcasts via the unified `core.*` API — exactly
// as web-v3's send path does in the browser. Here it runs on-device (Hermes).
function grpcClient(): SuiGrpcClient {
  const baseUrl =
    SUI_NETWORK === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network: SUI_NETWORK });
}

// Build → sign (zkLogin) → broadcast a gas-native SUI transfer on the configured
// network. Every failure throws with a user-facing message; the caller surfaces it.
export async function sendSui(input: { to: string; amount: number }): Promise<{ digest: string }> {
  const screen = preflightSend({ to: input.to, amount: input.amount, asset: "SUI" });
  if (!screen.ok) {
    throw new Error(screen.reason);
  }
  const key = sendDedupKey({ to: input.to, amount: input.amount, asset: "SUI" });
  if (isDuplicateSend(key)) {
    throw new Error("This transfer was just sent — wait a moment before retrying.");
  }

  const keys = await loadWalletKeys();
  if (!keys) {
    throw new Error("Sign in to send.");
  }
  if (isProofExpired(keys)) {
    throw new Error("Your session expired — sign in again.");
  }

  const client = grpcClient();
  const signer = new ZkLoginSigner(
    Ed25519Keypair.fromSecretKey(keys.ephemeralSecret),
    keys.proof,
    keys.address,
    keys.maxEpoch
  );

  const tx = buildSuiTransferTx({
    sender: keys.address,
    to: input.to,
    amountRaw: toRawUnits(input.amount, SUI_DECIMALS),
  });
  const bytes = await tx.build({ client });
  const { signature } = await signer.signTransaction(bytes);

  markSendDispatched(key);
  const result = await client.core.executeTransaction({
    transaction: bytes,
    signatures: [signature],
    include: { effects: true },
  });
  const txn =
    result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
  await client.core.waitForTransaction({ digest: txn.digest });
  if (!txn.effects?.status?.success) {
    throw new Error(`Transfer failed: ${txn.effects?.status?.error ?? "unknown error"}`);
  }
  return { digest: txn.digest };
}
```

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: no new errors. (`SuiGrpcClient` accepts `{ baseUrl, network }`; `SUI_NETWORK` is `"testnet"|"mainnet"` — assignable. The `result.$kind` / `txn.effects?.status?.success` shape is copied verbatim from web-v3 `lib/identity/custody.ts:78-88`.)

- [ ] **Step 3: Stage + commit message**

```bash
git add apps/mobile/src/lib/wallet/send.ts
# ✨ feat(auth): add on-device SUI send executor
```

---

### Task 6: Exchange returns the zkProof (server)

**Files:**
- Modify: `packages/auth/src/server.ts`
- Modify: `apps/web-v3/app/api/mobile-auth/exchange/route.ts:107-212`

**Interfaces:**
- Produces (server.ts): `createZkProof(input: { jwt: string; ephemeralPublicKey: string; randomness: string; maxEpoch: number; network: "mainnet"|"testnet"|"devnet" }): Promise<ZkLoginSignatureInputs>`
- Produces (route): response gains `{ proof, maxEpoch }` when the caller sends the nonce inputs.

- [ ] **Step 1: Add `createZkProof` to packages/auth/src/server.ts**

After `deriveAddress` (line 91), add:
```ts
import { Ed25519PublicKey } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import type { ZkLoginSignatureInputs } from "@mysten/sui/zklogin";

/**
 * Compute the zkLogin ZK proof from a verified JWT + the device's nonce inputs.
 * Runs server-side (same Enoki key as deriveAddress) so the JWT never leaves the
 * server; the proof is bound to the device's ephemeral public key via the nonce,
 * so it's unusable without the on-device ephemeral secret. Native-send only.
 */
export async function createZkProof(input: {
  jwt: string;
  ephemeralPublicKey: string; // base64 of the device's Ed25519 public key
  randomness: string;
  maxEpoch: number;
  network: "mainnet" | "testnet" | "devnet";
}): Promise<ZkLoginSignatureInputs> {
  const client = new EnokiClient({ apiKey: process.env.NEXT_PUBLIC_ENOKI_API_KEY ?? "" });
  const proof = await client.createZkLoginZkp({
    network: input.network,
    jwt: input.jwt,
    ephemeralPublicKey: new Ed25519PublicKey(fromBase64(input.ephemeralPublicKey)),
    randomness: input.randomness,
    maxEpoch: input.maxEpoch,
  });
  return proof as ZkLoginSignatureInputs;
}
```

- [ ] **Step 2: Parse the nonce inputs in the route**

In `route.ts`, extend the body parse block (currently lines 107-123) to also read the three optional fields:
```ts
  let code: unknown;
  let codeVerifier: unknown;
  let ephemeralPublicKey: unknown;
  let randomness: unknown;
  let maxEpoch: unknown;
  try {
    const body = JSON.parse(raw);
    code = body.code;
    codeVerifier = body.codeVerifier;
    ephemeralPublicKey = body.ephemeralPublicKey;
    randomness = body.randomness;
    maxEpoch = body.maxEpoch;
  } catch {
    return fail(400, "Bad request");
  }
```
(Leave the existing `code`/`codeVerifier` presence check unchanged — the three new fields are optional for back-compat.)

- [ ] **Step 3: Compute + return the proof**

Replace the final return (lines 203-212) with a proof-augmented version. Import `createZkProof` at the top (`import { createZkProof, deriveAddress, ... } from "@/lib/audric-auth"` or the package path the route already uses). After `mintSessionToken` (line 201):
```ts
  // Native send: if the device supplied its nonce inputs, compute the zkProof
  // (server-side, JWT never leaves here) so it can sign transactions on-device.
  let proof: unknown;
  let proofMaxEpoch: number | undefined;
  if (
    typeof ephemeralPublicKey === "string" &&
    typeof randomness === "string" &&
    typeof maxEpoch === "number"
  ) {
    try {
      const network = (env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
        | "mainnet" | "testnet" | "devnet";
      proof = await createZkProof({ jwt: idToken, ephemeralPublicKey, randomness, maxEpoch, network });
      proofMaxEpoch = maxEpoch;
    } catch {
      // Non-fatal: identity still returns; the app falls back to a read-only
      // wallet if the proof can't be minted.
      proof = undefined;
    }
  }

  return NextResponse.json({
    address,
    email,
    aud: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    audMatch: true,
    token,
    expiresAt,
    proof,
    maxEpoch: proofMaxEpoch,
  });
```
Also update the file-header comment line 19 ("Nothing wallet-signing happens here") to note the optional proof step.

- [ ] **Step 4: Typecheck web-v3**

Run:
```bash
cd /home/ngocanh/audric-build/audric/apps/web-v3
/home/ngocanh/audric-build/audric/node_modules/.bin/tsc --noEmit -p tsconfig.json
```
Expected: no new errors from `route.ts` / `server.ts`. (Confirm `env.NEXT_PUBLIC_SUI_NETWORK` is in the Zod schema — CLAUDE.md lists it required; if the barrel `@/lib/audric-auth` doesn't re-export `createZkProof`, add the export there.)

- [ ] **Step 5: Stage + commit message**

```bash
git add packages/auth/src/server.ts apps/web-v3/app/api/mobile-auth/exchange/route.ts apps/web-v3/lib/audric-auth.ts
# ✨ feat(auth): return device zkProof from the mobile-auth exchange
```

---

### Task 7: Mobile auth wiring (send inputs, persist keys)

**Files:**
- Modify: `src/auth/exchange.ts`
- Modify: `src/auth/useAuth.tsx`

**Interfaces:**
- Consumes: `saveWalletKeys`/`clearWalletKeys` (Task 3), `loadPendingAuth` (existing `@/auth/pending-auth`).
- Produces: `exchangeForAddress` result gains `proof?: ZkProof` and `maxEpoch?: number`; sign-in persists `wallet-keys`; sign-out clears them.

- [ ] **Step 1: Send the nonce inputs from exchange.ts**

In `src/auth/exchange.ts`, before the POST, derive the public key from the pending ephemeral secret and add the three fields to the request body. Add imports:
```ts
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { loadPendingAuth } from "@/auth/pending-auth";
```
Compute + include:
```ts
  const pending = await loadPendingAuth();
  const ephemeralPublicKey = pending
    ? Ed25519Keypair.fromSecretKey(pending.ephemeralSecret).getPublicKey().toBase64()
    : undefined;
  // ...in the fetch body JSON.stringify({ code, codeVerifier, ...(pending ? {
  //   ephemeralPublicKey, randomness: pending.randomness, maxEpoch: pending.maxEpoch,
  // } : {}) })
```
Extend the parsed response type + return to include `proof?: unknown` and `maxEpoch?: number`.

- [ ] **Step 2: Persist wallet-keys in useAuth.tsx**

In `src/auth/useAuth.tsx` `signIn`, after `saveSession(...)` and using the `pending` values (still available before `clearPendingAuth`), persist the signing keys when a proof came back:
```ts
import { saveWalletKeys, clearWalletKeys } from "@/lib/wallet/keys";
// ...
  const pending = await loadPendingAuth();
  const result = await exchangeForAddress({ code, codeVerifier });
  // existing: saveSession({ address, email, savedAt, token, expiresAt })
  if (result.proof && result.maxEpoch != null && pending) {
    await saveWalletKeys({
      ephemeralSecret: pending.ephemeralSecret,
      proof: result.proof as ZkProof,
      maxEpoch: result.maxEpoch,
      address: result.address,
      expiresAt: pending.expiresAt,
    });
  }
```
Ensure `clearPendingAuth()` still runs after. In `signOut`, add `await clearWalletKeys();` alongside `clearSession()`.

- [ ] **Step 3: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 4: Stage + commit message**

```bash
git add apps/mobile/src/auth/exchange.ts apps/mobile/src/auth/useAuth.tsx
# ✨ feat(auth): persist device signing keys on mobile sign-in
```

---

### Task 8: Integration checkpoint (dev-client testnet) — DE-RISK GATE

No production code ships. This proves TWO things before the UI is built on top: (1) on-device zkLogin signature assembly works under Hermes, and (2) **`SuiGrpcClient` (gRPC) can build + broadcast from React Native** — the single biggest unknown, since the codebase's proven gRPC use is server-side only. If Step 2 fails specifically on transport (gRPC connect/stream errors, not a signing or funds error), that is the trigger to fall back to the documented server-relay build/broadcast (Global Constraints) — escalate to the human with the exact error before switching. If any step fails, stop and diagnose here.

**Setup:**
- Ensure `EXPO_PUBLIC_SUI_NETWORK=testnet` (mobile) and web-v3 `NEXT_PUBLIC_SUI_NETWORK=testnet` — they MUST match.
- Run web-v3 locally + cloudflared tunnel; point the app's `exchangeBase()` at the tunnel (the proven 2026-07-10 setup).
- The signed-in test address needs testnet SUI — fund it at the Sui testnet faucet.

- [ ] **Step 1: Sign in on the dev client**

Verify: sign-in completes; add a temporary `console.log("[send] wallet-keys present:", !!(await loadWalletKeys()))` in a dev-only spot (remove after) — expect `true`. Confirm no JWT/secret is logged anywhere.

- [ ] **Step 2: Fire a hardcoded transfer**

From a temporary dev button or the RN debugger console:
```ts
import { sendSui } from "@/lib/wallet/send";
const { digest } = await sendSui({ to: "<a second testnet 0x address>", amount: 0.01 });
console.log("digest:", digest);
```
Expected: resolves with a real digest (no throw).

- [ ] **Step 3: Verify on-chain**

Open `https://suiscan.xyz/testnet/tx/<digest>` — the transfer shows as succeeded, 0.01 SUI moved to the recipient.

- [ ] **Step 4: Verify the app reflects it**

Reopen the wallet — `useBalance`/`useTransactions` show the reduced balance + the new outgoing row (already-wired live reads). Remove the temporary logs/button.

- [ ] **Step 5: Checkpoint note**

If Steps 1-4 pass, the signing path AND on-device gRPC are proven; proceed to the UI. If not, the failure is isolated to auth/keys/signer/send (no UI involved) — diagnose before Task 9. A gRPC-transport failure specifically → escalate + switch to server-relay per Global Constraints; a signing/funds/address failure → fix in place.

---

### Task 9: Real Send UI + store wiring

**Files:**
- Modify: `src/app-state/store.tsx:356-360,790-795,877-901,988-991`
- Modify: `src/components/wallet/send-sheet.tsx`

**Interfaces:**
- Consumes: `sendSui` (Task 5), `resolveRecipient`/`isSuiAddress` (Task 2), `useBalance` (existing).
- Produces: store exposes `recipientInput`, `setRecipientInput`, `resolvedTo`, `amount`, `setAmount`, `stage` (`"confirm"|"sending"|"success"|"error"`), `digest`, `sendError`, async `confirmSend`.

- [ ] **Step 1: Replace the store send state**

In `store.tsx`, swap the mock send state (lines 358-360) for real state:
```ts
  const [stage, setStage] = useState<SendStage>("confirm");
  const [recipientInput, setRecipientInput] = useState("");
  const [resolvedTo, setResolvedTo] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [digest, setDigest] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
```
Update `SendStage` (line 36) to `"confirm" | "sending" | "success" | "error"`.

- [ ] **Step 2: Rewrite confirmSend (async, real)**

Replace `confirmSend` (lines 790-795):
```ts
  const confirmSend = useCallback(async () => {
    setSendError(null);
    try {
      let to = resolvedTo;
      if (!to) {
        const r = await resolveRecipient(recipientInput);
        to = r.address;
        setResolvedTo(r.address);
      }
      setStage("sending");
      const { digest: d } = await sendSui({ to, amount });
      setDigest(d);
      setStage("success");
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Send failed.");
      setStage("error");
    }
  }, [recipientInput, resolvedTo, amount]);
```
Add imports: `import { resolveRecipient } from "@/lib/wallet/recipient"; import { sendSui } from "@/lib/wallet/send";`.

- [ ] **Step 3: Update openSend + the exposed value**

In `openSend` (lines 880-886) reset the real state:
```ts
      openSend: () => {
        setSendSheet(true);
        setStage("confirm");
        setRecipientInput("");
        setResolvedTo(null);
        setAmount(0);
        setDigest(null);
        setSendError(null);
      },
```
In the `value` object (lines 894-901 / 988-991) expose `recipientInput`, `setRecipientInput`, `resolvedTo`, `amount`, `setAmount`, `stage`, `digest`, `sendError`, `confirmSend`. Remove `incAmount`, `decAmount`, `recipient`, `toggleRecipient` and update the `Store` type (lines 140-146). Delete the now-unused `SPENDABLE_USDC` import usage in send-sheet (next step) — then remove the constant from `store.tsx:48` and the `sendTimer` ref if unused.

- [ ] **Step 4: Rewrite send-sheet.tsx**

Replace the recipient toggle + stepper with real inputs and add the error stage. Key changes (keep existing styles; add `TextInput` from `react-native`):
```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { openExternal, suiscanTxUrl } from "@/lib/audric-web";
import { useBalance } from "@/lib/wallet-data";
// ...
  const { usdc, sui } = useBalance();
  const {
    sendSheet, closeSend, stage, amount, setAmount,
    recipientInput, setRecipientInput, resolvedTo,
    digest, sendError, confirmSend,
  } = useAppState();

  const insufficient = sui != null && amount > sui;          // M1 = SUI, gas-native
  const canSend = recipientInput.trim().length > 0 && amount > 0 && !insufficient;
```
- Recipient row: a `TextInput` bound to `recipientInput` (`placeholder="0x… or name.sui"`, `autoCapitalize="none"`, `onChangeText={setRecipientInput}`); show `resolvedTo` truncated with a check when set.
- Amount: a numeric `TextInput` (`keyboardType="decimal-pad"`, `value={amount ? String(amount) : ""}`, `onChangeText={(t) => setAmount(Number(t) || 0)}`); unit label `SUI`.
- Insufficient banner: gate on the new `insufficient` (message references `sui` balance).
- `Allow & Send`: `onPress={confirmSend}`, disabled unless `canSend`.
- `sending` stage: unchanged spinner (show `${amount} SUI → ${resolvedTo ?? recipientInput}`).
- `success` stage: show the **real** `digest` (truncate) wrapped in a Pressable → `openExternal(suiscanTxUrl(digest!))`.
- New `error` stage: red icon + `sendError` + `Retry` (back to `confirm`) / `Close`.
- Remove `import { SEND_DIGEST } from "@/app-state/catalog"` and `import { SPENDABLE_USDC } ...`.

- [ ] **Step 5: Typecheck + lint**

Run:
```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json
npx expo lint
```
Expected: no new errors.

- [ ] **Step 6: Stage + commit message**

```bash
git add apps/mobile/src/app-state/store.tsx apps/mobile/src/components/wallet/send-sheet.tsx
# ✨ feat(ui): wire the wallet Send flow to real on-device transfers
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Full unit suite**

Run: `pnpm test`
Expected: all pure-helper tests pass.

- [ ] **Step 2: Typecheck**

Run: `node_modules/.bin/tsc --noEmit -p tsconfig.json`
Expected: only the pre-existing `@t2000/sdk` module-resolution errors in the server `+api` balance/transactions routes (unrelated to this work); nothing new from `src/lib/wallet`, `src/auth`, `src/app-state`, `src/components/wallet`.

- [ ] **Step 3: Dev-client happy path (testnet)**

Wallet → Send → paste a testnet address → enter `0.01` → Allow & Send → success shows a real digest → tap it → Suiscan opens the succeeded tx. Balance + activity update.

- [ ] **Step 4: Dev-client negative paths**

- Enter a malformed address → blocked with "Enter a valid Sui address."
- Enter an amount above the SUI balance → insufficient banner, send disabled.
- Tap Allow & Send twice fast → second is deduped.
- Sign out then attempt send → "Sign in to send." (or the send entry is gated).
- (If feasible) let the proof expire / clear `wallet-keys` → "Your session expired — sign in again."

- [ ] **Step 5: Final commit message (squash or keep per-task, user's call)**

```bash
# ✨ feat(ui): real testnet SUI send (M1) — on-device zkLogin signing end-to-end
```

---

## Self-Review

**Spec coverage:** Layer 1 (proof delivery) → Tasks 6-7; Layer 2 (send module) → Tasks 1-5; Layer 3 (UI) → Task 9. Error handling (§6 of spec) → `send.ts` throws + Task 9 error stage + Task 10 negatives. Security (§7) → keystore (Task 3), server-only proof + JWT (Task 6), non-custodial ephemeral key (Tasks 3/7), tap-to-confirm (Task 9), testnet gating (global constraints). Testing (§11) → Tasks 1-3 units + Task 8/10 integration. Milestone M2 (gasless USDC) is intentionally out of scope → follow-up plan.

**Type consistency:** `WalletKeys.proof: ZkProof` (Task 3) flows to `ZkLoginSigner` (Task 4) and `sendSui` (Task 5); `ZkProof = ZkLoginSignatureInputs` with the documented `Parameters<...>` fallback. `preflightSend`/`sendDedupKey`/`markSendDispatched`/`isDuplicateSend` names match across Tasks 2 and 5. Exchange `{proof, maxEpoch}` (Task 6) matches `exchangeForAddress` parse + `saveWalletKeys` (Task 7). `SendStage` extended once (Task 9) and used in send-sheet.

**Placeholder scan:** No TBD/TODO; the two flagged uncertainties (SuiNS GraphQL field name; `ZkLoginSignatureInputs` export path) have explicit concrete fallbacks resolved at typecheck/Task 8, not deferred logic.

**Open follow-ups (not blockers):** M2 gasless USDC + the two de-risk spikes (gRPC-under-RN, testnet stablecoin allowlist) get their own spec/plan.
