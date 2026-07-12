// Hermes ships no WebCrypto. Two consumers inside the @mysten packages need it:
//  - @noble/hashes captures `globalThis.crypto` AT MODULE LOAD and calls
//    `getRandomValues` for ephemeral keypair generation;
//  - EnokiClient stamps a `Request-Id: crypto.randomUUID()` header on every
//    API call.
// Backed by expo-crypto's OS CSPRNG. MUST be imported before any `@mysten/*`
// import executes (keep it as the FIRST import of google.ts).
import * as Crypto from "expo-crypto";

type CryptoLike = { getRandomValues?: unknown; randomUUID?: unknown };

const g = globalThis as { crypto?: CryptoLike };

if (
  typeof g.crypto?.getRandomValues !== "function" ||
  typeof g.crypto?.randomUUID !== "function"
) {
  g.crypto = {
    ...(g.crypto ?? {}),
    getRandomValues: <T extends Uint8Array>(array: T): T =>
      Crypto.getRandomValues(array),
    randomUUID: () => Crypto.randomUUID(),
  };
}
