"use client";

import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { buildSendTx, executeTx } from "@t2000/sdk/browser";
import { useState } from "react";
import { ZK_CONFIG } from "@/lib/zk-config";

// Fund an agent from the Passport (SPEC_ONRAMP, S.681) — the distribution
// half of the console-as-funding-hub design: card → Passport (onramp page),
// Passport → any agent (this, an instant gasless USDC send). Two-step
// confirm, same pattern as the usdc-topup client half.

function grpcClient(): SuiGrpcClient {
  const network = ZK_CONFIG.network === "testnet" ? "testnet" : "mainnet";
  return new SuiGrpcClient({
    baseUrl:
      network === "testnet"
        ? "https://fullnode.testnet.sui.io"
        : "https://fullnode.mainnet.sui.io",
    network,
  });
}

export function FundAgent({ agentAddress }: { agentAddress: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digest, setDigest] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const session = loadSession();
      if (!session || isSessionExpired(session)) {
        throw new Error("Session expired — sign in again.");
      }
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error("Enter a positive USDC amount.");
      }
      const signer = toZkLoginSigner(session);
      const client = grpcClient();
      const result = await executeTx(
        client,
        signer,
        () =>
          buildSendTx({
            client,
            address: signer.getAddress(),
            to: agentAddress,
            amount: value,
            asset: "USDC",
          }),
        { buildClient: client }
      );
      setDigest(result.digest);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
      setBusy(false);
    }
  };

  if (digest) {
    return (
      <a
        className="text-fg-muted text-xs underline decoration-border underline-offset-4"
        href={`https://suiscan.xyz/mainnet/tx/${digest}`}
        rel="noreferrer"
        target="_blank"
      >
        Funded ✓ tx ↗
      </a>
    );
  }

  if (!open) {
    return (
      <button
        className="ag-btn ag-btn--ghost"
        onClick={() => setOpen(true)}
        type="button"
      >
        Fund
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <input
        className="w-20 rounded-lg border bg-transparent px-2 py-1.5 text-foreground text-sm outline-none"
        inputMode="decimal"
        onChange={(e) => setAmount(e.target.value)}
        style={{ borderColor: "var(--ag-border)" }}
        value={amount}
      />
      <button
        className="ag-btn ag-btn--primary"
        disabled={busy}
        onClick={send}
        type="button"
      >
        {busy ? "Sending…" : `Send $${amount}`}
      </button>
      <button
        className="ag-btn ag-btn--ghost"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        type="button"
      >
        ✕
      </button>
      {error && <span className="text-destructive text-xs">{error}</span>}
    </span>
  );
}
