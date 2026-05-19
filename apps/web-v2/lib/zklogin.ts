/**
 * zkLogin — client-side session + OAuth state machine.
 *
 * --- WHY THIS FILE EXISTS (Phase 3 Day 3c) ---
 *
 * Phase 2 P2.0a shipped a JWT-only auth surface in web-v2: paste a JWT,
 * the server verifies it via `getCurrentUser`, you're "authenticated".
 * That was enough for the Day 2b read-tool smoke (`balance_check`
 * doesn't sign anything). Phase 3 wires `save_deposit` as the first
 * write tool — which requires the FULL zkLogin session blob (ephemeral
 * keypair + Mysten ZK proof + maxEpoch) so the client can sign sponsored
 * transactions locally.
 *
 * This file is a direct port of `apps/web/lib/zklogin.ts` (~381 LoC)
 * with two diffs from legacy:
 *
 *   1. Constants source: legacy reads `GOOGLE_CLIENT_ID` / `ENOKI_API_KEY` /
 *      `SUI_NETWORK` from `./constants`; web-v2 reads from the Zod-
 *      validated env proxy (`env.NEXT_PUBLIC_*`) per the cross-app
 *      env-validation-gate rule.
 *   2. No `apps/web/lib/auth-fetch.ts` dependency. Web-v2 doesn't ship
 *      the `authFetch` helper today; the engine's chat route + the
 *      sponsored-tx routes inject `x-zklogin-jwt` directly via
 *      `headers` on each `fetch` call. The `ZKLOGIN_EXPIRED_EVENT`
 *      glue lives in `useZkLogin` instead.
 *
 * Trust model + storage rationale: see legacy `apps/web/lib/zklogin.ts`
 * L42-87 (preserved verbatim in `saveSession` JSDoc below). localStorage
 * is the canonical zkLogin pattern; the CodeQL alert is acknowledged +
 * documented + retained as a tracking artefact for future hardening.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 3 Day 3c" + S.175.
 */

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
} from "@mysten/sui/zklogin";
import { env } from "./env";

const STORAGE_KEY = "t2000:zklogin:session";
const PENDING_KEY = "t2000:zklogin:pending";
const ENOKI_BASE = "https://api.enoki.mystenlabs.com/v1";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface ZkLoginSession {
  address: string;
  /** base64-encoded Ed25519 secret key */
  ephemeralKeyPair: string;
  /** unix ms — approximate expiry based on epoch duration */
  expiresAt: number;
  jwt: string;
  maxEpoch: number;
  proof: ZkProof;
  randomness: string;
  salt: string;
}

export interface ZkProof {
  addressSeed: string;
  headerBase64: string;
  issBase64Details: {
    indexMod4: number;
    value: string;
  };
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
}

export type ZkLoginStep = "jwt" | "salt" | "proof" | "done";

// --- Session persistence ---

/**
 * Persist a zkLogin session to localStorage.
 *
 * Trust model + storage rationale ported verbatim from legacy
 * `apps/web/lib/zklogin.ts` L42-87:
 *
 *   1. No server-side encryption key exists. Encrypting the blob
 *      with a server key reintroduces custodial risk.
 *   2. Time-bounded blast radius — ephemeral key expires at the next
 *      Sui epoch (~24h on mainnet); JWT expires at `exp` (~1h Google-side).
 *   3. Mysten's reference implementation uses localStorage.
 *
 * Residual risk: cross-origin XSS could read the blob and sign as the
 * user until the ephemeral key expires (~24h). Defense in depth lives
 * at CSP hardening + dependency hygiene (SPEC 30 Phase 8/9).
 */
export function saveSession(session: ZkLoginSession): void {
  // codeql[js/clear-text-storage-of-sensitive-data]: zkLogin canonical pattern; trust model documented above.
  // lgtm[js/clear-text-storage-of-sensitive-data]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): ZkLoginSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as ZkLoginSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSessionExpired(
  session: ZkLoginSession,
  currentEpoch: number
): boolean {
  return currentEpoch >= session.maxEpoch;
}

/**
 * SPEC 30 Phase 1A.7 — JWT-exp expiry check (independent of Sui-epoch).
 * Returns `true` if the session's JWT has expired (with 60s skew
 * tolerance) so consumers can flip to `'expired'` and trigger re-login.
 */
export function isJwtExpired(
  session: ZkLoginSession,
  nowMs: number = Date.now()
): boolean {
  try {
    const parts = session.jwt.split(".");
    if (parts.length !== 3) {
      return true;
    }
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    ) as { exp?: number };
    if (typeof payload.exp !== "number") {
      return true;
    }
    return nowMs >= payload.exp * 1000 - 60_000;
  } catch {
    return true;
  }
}

/** ~24h before maxEpoch we warn. */
export function isSessionExpiringSoon(
  session: ZkLoginSession,
  currentEpoch: number
): boolean {
  return session.maxEpoch - currentEpoch <= 1;
}

// --- Ephemeral key management ---

export function createEphemeralKeypair(): Ed25519Keypair {
  return new Ed25519Keypair();
}

export function serializeKeypair(kp: Ed25519Keypair): string {
  return kp.getSecretKey();
}

export function deserializeKeypair(secretKey: string): Ed25519Keypair {
  return Ed25519Keypair.fromSecretKey(secretKey);
}

// --- OAuth ---

export function getRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

export function buildOAuthUrl(params: {
  nonce: string;
  redirectUri: string;
  clientId?: string;
}): string {
  const clientId = params.clientId || env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("nonce", params.nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

/**
 * Compute the OAuth nonce. `maxEpoch` determines session validity
 * (~7 epochs ≈ 7 days on mainnet).
 */
export function computeNonce(
  ephemeralKeyPair: Ed25519Keypair,
  maxEpoch: number,
  randomness: string
): string {
  return generateNonce(ephemeralKeyPair.getPublicKey(), maxEpoch, randomness);
}

// --- JWT ---

export function extractJwtFromUrl(): string | null {
  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);
  return params.get("id_token");
}

// --- Salt + Address (via Enoki) ---

export async function fetchSaltAndAddress(
  jwt: string
): Promise<{ salt: string; address: string }> {
  const res = await fetch(`${ENOKI_BASE}/zklogin`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.NEXT_PUBLIC_ENOKI_API_KEY}`,
      "zklogin-jwt": jwt,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Enoki salt error (${res.status}): ${body}`);
  }

  const { data } = (await res.json()) as {
    data: { salt: string; address: string };
  };
  return { salt: data.salt, address: data.address };
}

// --- ZK Proof (via Enoki) ---

export async function fetchZkProof(params: {
  jwt: string;
  ephemeralPublicKey: string;
  maxEpoch: number;
  randomness: string;
}): Promise<ZkProof> {
  const res = await fetch(`${ENOKI_BASE}/zklogin/zkp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.NEXT_PUBLIC_ENOKI_API_KEY}`,
      "zklogin-jwt": params.jwt,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      network: env.NEXT_PUBLIC_SUI_NETWORK,
      ephemeralPublicKey: params.ephemeralPublicKey,
      maxEpoch: params.maxEpoch,
      randomness: params.randomness,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Enoki ZKP error (${res.status}): ${body}`);
  }

  const { data } = (await res.json()) as { data: ZkProof };
  return data;
}

// --- Full flow helpers ---

/**
 * Start the OAuth login flow:
 *  1. Generate ephemeral keypair
 *  2. Get current Sui epoch
 *  3. Compute nonce binding the ephemeral key to maxEpoch
 *  4. Stash pre-auth data in sessionStorage (tab-scoped — cleared on
 *     close; single-use; cannot sign outside the zkLogin proof window)
 *  5. Redirect to Google OAuth
 */
export async function startLogin(
  getCurrentEpoch: () => Promise<number>
): Promise<void> {
  const ephemeralKeyPair = createEphemeralKeypair();
  const randomness = generateRandomness();
  const currentEpoch = await getCurrentEpoch();
  const maxEpoch = currentEpoch + 7;

  const nonce = computeNonce(ephemeralKeyPair, maxEpoch, randomness);
  const redirectUri = getRedirectUrl();

  // codeql[js/clear-text-storage-of-sensitive-data]: tab-scoped + single-use; documented above.
  // lgtm[js/clear-text-storage-of-sensitive-data]
  sessionStorage.setItem(
    PENDING_KEY,
    JSON.stringify({
      ephemeralKey: serializeKeypair(ephemeralKeyPair),
      maxEpoch,
      randomness,
    })
  );

  window.location.href = buildOAuthUrl({ nonce, redirectUri });
}

interface PendingAuth {
  ephemeralKey: string;
  maxEpoch: number;
  randomness: string;
}

/**
 * Retrieve pre-auth data stored before the OAuth redirect.
 */
export function getPendingAuth(): PendingAuth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as PendingAuth;
  } catch {
    return null;
  }
}

export function clearPendingAuth(): void {
  sessionStorage.removeItem(PENDING_KEY);
}

/**
 * Complete the login flow after Google redirects back. Drives the
 * loading screen via `onStep` callbacks; the ZK proof generation is
 * the 3-8 second step.
 *
 *  1. Extract JWT from URL hash
 *  2. Fetch salt + address from Enoki (cached server-side keyed on jwt.sub)
 *  3. Generate ZK proof via Enoki (3-8 seconds)
 *  4. Derive expiry timestamp
 *  5. Persist the session
 */
export async function completeLogin(params: {
  onStep: (step: ZkLoginStep) => void;
}): Promise<ZkLoginSession> {
  const jwt = extractJwtFromUrl();
  if (!jwt) {
    throw new Error("No JWT found in callback URL");
  }

  const pending = getPendingAuth();
  if (!pending) {
    throw new Error("No pending auth data — did you start login first?");
  }

  params.onStep("jwt");

  const ephemeralKeyPair = deserializeKeypair(pending.ephemeralKey);
  const extPubKey = getExtendedEphemeralPublicKey(
    ephemeralKeyPair.getPublicKey()
  );

  const { salt, address } = await fetchSaltAndAddress(jwt);
  params.onStep("salt");

  const proof = await fetchZkProof({
    jwt,
    ephemeralPublicKey: extPubKey,
    maxEpoch: pending.maxEpoch,
    randomness: pending.randomness,
  });
  params.onStep("proof");

  // Each epoch ~24h on mainnet, ~2h on testnet.
  const epochDurationMs =
    env.NEXT_PUBLIC_SUI_NETWORK === "mainnet"
      ? 24 * 60 * 60 * 1000
      : 2 * 60 * 60 * 1000;
  const epochsRemaining = 7;
  const expiresAt = Date.now() + epochsRemaining * epochDurationMs;

  const session: ZkLoginSession = {
    ephemeralKeyPair: pending.ephemeralKey,
    maxEpoch: pending.maxEpoch,
    randomness: pending.randomness,
    jwt,
    salt,
    proof,
    address,
    expiresAt,
  };

  saveSession(session);
  clearPendingAuth();
  params.onStep("done");

  return session;
}
