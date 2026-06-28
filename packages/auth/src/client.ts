/**
 * zkLogin — client-side OAuth + session (shared Passport flow).
 *
 * Consumed by both audric/web-v3 and apps/console (SPEC_T2000_API_V2 §2 / M1).
 * Lean rewrite of web-v2's flow (Approach A), with the wheel left un-reinvented:
 *  - `@mysten/enoki` `EnokiClient` does nonce + salt/address + ZK proof
 *    (replaces v2's hand-rolled `generateNonce`/`fetch` to the Enoki REST).
 *  - The session blob constructs `@t2000/sdk`'s `ZkLoginSigner` 1:1
 *    (`toZkLoginSigner`) — the bridge our Phase-4 money writes ride.
 *  - No `@mysten/dapp-kit` wallet model, no auth-fetch event glue, no
 *    WatchAddress helpers — the bloat v2 accreted is dropped.
 *
 * Session storage: the full blob (ephemeral key + proof) lives in
 * `localStorage`, the canonical zkLogin pattern (Mysten reference). Blast
 * radius is time-bounded by `maxEpoch` (~days) + the JWT exp. The pre-OAuth
 * handoff lives in `sessionStorage` (tab-scoped, single-use).
 *
 * Config: the caller passes `ZkLoginConfig` (Enoki key + Google client id +
 * network). The values must NOT be read from `process.env` inside this package
 * — `NEXT_PUBLIC_*` static replacement does NOT fire inside a `transpilePackages`
 * dependency (Turbopack shims `process`, so the ref stays a runtime lookup that
 * resolves to "" on the client → empty Enoki key → 400). Each consuming app
 * reads its OWN inlined `env.NEXT_PUBLIC_*` (where replacement works) and hands
 * them in here.
 */

import { EnokiClient } from "@mysten/enoki";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
// Browser-safe entry — keeps the SDK's Node-only modules (fs keyManager) out
// of the client bundle.
import { type ZkLoginProof, ZkLoginSigner } from "@t2000/sdk/browser";

const STORAGE_KEY = "audric:zklogin:session";
const PENDING_KEY = "audric:zklogin:pending";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// ~7-day signing window target (mainnet epoch ≈ 24h). Enoki caps maxEpoch; we
// use the returned `estimatedExpiration` as the source of truth either way.
const ADDITIONAL_EPOCHS = 7;

export type EnokiNetwork = "mainnet" | "testnet" | "devnet";

/** Caller-supplied client config — the app's inlined `NEXT_PUBLIC_*` values. */
export interface ZkLoginConfig {
  enokiApiKey: string;
  googleClientId: string;
  network: EnokiNetwork;
}

function enoki(apiKey: string): EnokiClient {
  return new EnokiClient({ apiKey });
}

export interface ZkLoginSession {
  /** Canonical zkLogin Sui address (the Passport wallet). */
  address: string;
  /** Bech32 ephemeral secret key — rebuilds the signing keypair. */
  ephemeralSecret: string;
  /** Unix ms when the session expires (Enoki `estimatedExpiration`). */
  expiresAt: number;
  /** Google OIDC id_token — sent once at callback to mint the app session. */
  jwt: string;
  /** Sui epoch the ephemeral key/proof are valid through (signing window). */
  maxEpoch: number;
  /** ZK proof — feeds `ZkLoginSigner` directly. */
  proof: ZkLoginProof;
}

interface PendingAuth {
  ephemeralSecret: string;
  expiresAt: number;
  maxEpoch: number;
  randomness: string;
}

export type ZkLoginStep = "jwt" | "address" | "proof" | "done";

// --- Session persistence (localStorage) ---

export function saveSession(session: ZkLoginSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): ZkLoginSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ZkLoginSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSessionExpired(
  session: ZkLoginSession,
  nowMs: number = Date.now()
): boolean {
  return nowMs >= session.expiresAt;
}

// --- The @t2000/sdk bridge ---

/** Construct a `ZkLoginSigner` from a live session — the signer our Phase-4
 * writes (send / x402 pay) inject into `@t2000/sdk`. */
export function toZkLoginSigner(session: ZkLoginSession): ZkLoginSigner {
  const keypair = Ed25519Keypair.fromSecretKey(session.ephemeralSecret);
  return new ZkLoginSigner(
    keypair,
    session.proof,
    session.address,
    session.maxEpoch
  );
}

// --- OAuth ---

function redirectUri(): string {
  return `${window.location.origin}/auth/callback`;
}

function buildGoogleOAuthUrl(nonce: string, clientId: string): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

function extractJwtFromUrl(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get("id_token");
}

// --- Flow ---

/**
 * Begin sign-in: create an ephemeral keypair, get an Enoki-issued nonce
 * (binds the key + maxEpoch), stash the pre-auth handoff, redirect to Google.
 */
export async function startLogin(config: ZkLoginConfig): Promise<void> {
  const keypair = new Ed25519Keypair();
  const { nonce, randomness, maxEpoch, estimatedExpiration } = await enoki(
    config.enokiApiKey
  ).createZkLoginNonce({
    network: config.network,
    ephemeralPublicKey: keypair.getPublicKey(),
    additionalEpochs: ADDITIONAL_EPOCHS,
  });

  const pending: PendingAuth = {
    ephemeralSecret: keypair.getSecretKey(),
    randomness,
    maxEpoch,
    expiresAt: estimatedExpiration,
  };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  window.location.href = buildGoogleOAuthUrl(nonce, config.googleClientId);
}

function getPending(): PendingAuth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingAuth) : null;
  } catch {
    return null;
  }
}

/**
 * Complete sign-in from the OAuth callback: parse the JWT, fetch the address
 * (Enoki salt holder) + ZK proof, persist the session. `onStep` drives the
 * loading UI (the proof step is the slow ~2-4s one).
 */
export async function completeLogin(
  config: ZkLoginConfig,
  opts?: {
    onStep?: (step: ZkLoginStep) => void;
  }
): Promise<ZkLoginSession> {
  const onStep = opts?.onStep ?? (() => undefined);

  const jwt = extractJwtFromUrl();
  if (!jwt) {
    throw new Error("No id_token in the callback URL.");
  }
  const pending = getPending();
  if (!pending) {
    throw new Error("Missing pending auth — start sign-in again.");
  }
  onStep("jwt");

  const keypair = Ed25519Keypair.fromSecretKey(pending.ephemeralSecret);

  const { address } = await enoki(config.enokiApiKey).getZkLogin({ jwt });
  onStep("address");

  const proof = (await enoki(config.enokiApiKey).createZkLoginZkp({
    network: config.network,
    jwt,
    ephemeralPublicKey: keypair.getPublicKey(),
    randomness: pending.randomness,
    maxEpoch: pending.maxEpoch,
  })) as ZkLoginProof;
  onStep("proof");

  const session: ZkLoginSession = {
    address,
    ephemeralSecret: pending.ephemeralSecret,
    jwt,
    maxEpoch: pending.maxEpoch,
    proof,
    expiresAt: pending.expiresAt,
  };
  saveSession(session);
  sessionStorage.removeItem(PENDING_KEY);
  onStep("done");

  return session;
}
