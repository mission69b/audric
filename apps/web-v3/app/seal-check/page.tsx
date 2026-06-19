"use client";

/**
 * Seal ⟷ zkLogin round-trip validation (spike, dev surface).
 *
 * Visit signed-in: encrypts a probe (server) → creates a Seal SessionKey →
 * signs it with OUR zkLogin signer → decrypts via the MPC committee (server) →
 * asserts the round-trip. The "signature verified" step is the load-bearing
 * proof that our custom zkLogin signer produces a Seal-acceptable SessionKey.
 * Delete once Stage 3 (blob seam) lands.
 */

import { SessionKey } from "@mysten/seal";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { useState } from "react";
import { loadSession, toZkLoginSigner } from "@/lib/zklogin";

export default function SealCheckPage() {
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  function add(line: string) {
    setLog((prev) => [...prev, line]);
  }

  async function run() {
    setBusy(true);
    setLog([]);
    try {
      const session = loadSession();
      if (!session) {
        add("✗ Not signed in — sign in first, then return here.");
        return;
      }
      add(`Passport: ${session.address}`);

      add("1. encrypting probe (server)…");
      const encRes = await fetch("/api/seal/selftest").then((r) => r.json());
      if (encRes.error) {
        add(`✗ encrypt: ${encRes.error}`);
        return;
      }
      add(`   ✓ encrypted (${encRes.encryptedB64.length} b64 chars)`);

      const suiClient = new SuiGrpcClient({
        baseUrl: "https://fullnode.mainnet.sui.io",
        network: "mainnet",
      });

      add("2. creating Seal SessionKey…");
      const sk = await SessionKey.create({
        address: session.address,
        packageId: encRes.packageId,
        ttlMin: 10,
        suiClient,
      });

      add("3. signing SessionKey with zkLogin…");
      const message = sk.getPersonalMessage();
      const { signature } = await toZkLoginSigner(session).signPersonalMessage(
        message
      );
      await sk.setPersonalMessageSignature(signature);
      add("   ✓ signature verified — zkLogin → Seal SessionKey WORKS");

      add("4. decrypting via MPC committee (server)…");
      const decRes = await fetch("/api/seal/selftest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          encryptedB64: encRes.encryptedB64,
          // Spread strips Seal's non-enumerable `toJSON` guard (which blocks
          // accidental JSON serialization of the session secret) so we can
          // transport the export to our own delegate server over HTTPS.
          exportedSessionKey: { ...sk.export() },
        }),
      }).then((r) => r.json());
      if (decRes.error) {
        add(`✗ decrypt: ${decRes.error}`);
        return;
      }

      const ok =
        typeof decRes.plaintext === "string" &&
        decRes.plaintext.startsWith(encRes.expectedPrefix);
      add(
        ok
          ? `✓✓ SEAL ROUND-TRIP OK — decrypted: "${decRes.plaintext}"`
          : `✗ mismatch: "${decRes.plaintext}"`
      );
      if (!ok) {
        return;
      }

      // --- Walrus leg (needs the funded uploader) ---
      add("");
      add("5. encrypt + STORE on Walrus (server)…");
      const storeRes = await fetch("/api/seal/selftest?walrus=1").then((r) =>
        r.json()
      );
      if (storeRes.error) {
        add(`✗ walrus store: ${storeRes.error}`);
        add("   (fund the uploader address with WAL + SUI, then retry)");
        return;
      }
      add(`   ✓ stored on Walrus — blobId ${storeRes.blobId}`);

      add("6. fetch from Walrus + Seal-decrypt (server)…");
      const fetchRes = await fetch("/api/seal/selftest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blobId: storeRes.blobId,
          exportedSessionKey: { ...sk.export() },
        }),
      }).then((r) => r.json());
      if (fetchRes.error) {
        add(`✗ walrus fetch: ${fetchRes.error}`);
        return;
      }
      const walrusOk =
        typeof fetchRes.plaintext === "string" &&
        fetchRes.plaintext.startsWith(storeRes.expectedPrefix);
      add(
        walrusOk
          ? `✓✓✓ WALRUS+SEAL ROUND-TRIP OK — "${fetchRes.plaintext}"`
          : `✗ walrus mismatch: "${fetchRes.plaintext}"`
      );
    } catch (e) {
      add(`✗ ${(e as Error).name}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="font-semibold text-lg">Seal ⟷ zkLogin round-trip check</h1>
      <p className="text-muted-foreground text-sm">
        Validates that our zkLogin signer can sign a Seal SessionKey and
        round-trip encrypt → decrypt through the mainnet MPC committee. Sign in
        first.
      </p>
      <button
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm disabled:opacity-50"
        disabled={busy}
        onClick={run}
        type="button"
      >
        {busy ? "Running…" : "Run round-trip"}
      </button>
      <pre className="whitespace-pre-wrap rounded-md bg-muted p-4 font-mono text-xs">
        {log.length === 0 ? "(no output yet)" : log.join("\n")}
      </pre>
    </div>
  );
}
