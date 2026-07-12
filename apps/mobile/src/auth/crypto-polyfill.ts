// Hermes ships no WebCrypto. @noble/hashes (inside @mysten/sui) captures
// `globalThis.crypto` AT MODULE LOAD and needs `getRandomValues` for ephemeral
// keypair generation — without this polyfill every sign-in throws
// "crypto.getRandomValues must be defined". Backed by expo-crypto's OS CSPRNG.
// MUST be imported before any `@mysten/*` import executes (keep it as the
// FIRST import of google.ts).
import * as Crypto from "expo-crypto";

type CryptoLike = { getRandomValues?: unknown };

const g = globalThis as { crypto?: CryptoLike };

if (typeof g.crypto?.getRandomValues !== "function") {
  g.crypto = {
    ...(g.crypto ?? {}),
    getRandomValues: <T extends Uint8Array>(array: T): T =>
      Crypto.getRandomValues(array),
  };
}
