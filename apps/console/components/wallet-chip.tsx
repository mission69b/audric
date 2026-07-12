"use client";

import {
  clearSession,
  isSessionExpired,
  loadSession,
  startLogin,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { SUPPORTED_ASSETS } from "@t2000/sdk/browser";
import Link from "next/link";
import { useEffect, useState } from "react";
import { env } from "@/lib/env";
import { ZK_CONFIG } from "@/lib/zk-config";

// Signed-in wallet chip (t2000-design/agents AgentsNav.jsx §signedIn) —
// green dot + live USDC balance + account menu. Client island so the public
// store pages stay static: the session lives in localStorage (same origin as
// /manage) and the balance is read straight from a Sui fullnode.

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

const MENU = [
  { label: "Overview", href: "/manage/dashboard" },
  { label: "Wallet & billing", href: "/manage/billing" },
] as const;

export function WalletChip() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      return;
    }
    const addr = session.address;
    setAddress(addr);
    let alive = true;
    (async () => {
      try {
        const resp = await grpcClient().core.getBalance({
          owner: addr,
          coinType: SUPPORTED_ASSETS.USDC.type,
        });
        if (alive) {
          const usd =
            Number(BigInt(resp.balance.balance)) /
            10 ** SUPPORTED_ASSETS.USDC.decimals;
          // Floor, never round up (financial display rule).
          setBalance((Math.floor(usd * 100) / 100).toFixed(2));
        }
      } catch {
        // balance stays hidden — the chip still shows the address
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Signed out (or pre-hydration): the design's Sign in primary button —
  // starts Google zkLogin directly (no /manage splash detour).
  if (!(mounted && address)) {
    return (
      <button
        className="ag-btn ag-btn--primary ag-btn--sm disabled:opacity-60"
        disabled={signingIn}
        onClick={async () => {
          setSigningIn(true);
          try {
            await startLogin(ZK_CONFIG);
          } catch {
            setSigningIn(false);
          }
        }}
        type="button"
      >
        {signingIn ? "Redirecting…" : "Sign in with Google"}
      </button>
    );
  }

  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        className="flex h-9 items-center gap-2.5 rounded-[9px] border pr-2.5 pl-3 transition-colors"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "var(--ag-overlay)",
          borderColor: open ? "var(--ag-border-hi)" : "var(--ag-border)",
        }}
        type="button"
      >
        <span className="inline-flex items-center gap-1.5 font-mono text-[12.5px] text-foreground">
          <span
            className="size-1.5 rounded-full"
            style={{ background: "var(--ag-verify)" }}
          />
          {balance === null ? shortAddress(address) : `$${balance}`}
        </span>
        <span
          className="flex size-[26px] items-center justify-center rounded-[7px] font-mono text-[11px]"
          style={{
            background:
              "linear-gradient(140deg, rgba(0,114,245,0.2), rgba(0,114,245,0.07))",
            border: "1px solid rgba(0,114,245,0.27)",
            color: "var(--ag-accent)",
          }}
        >
          ◎
        </span>
      </button>

      {open && (
        <div
          className="absolute top-full right-0 z-50 w-[208px] pt-2.5"
          style={{ animation: "ag-fade-in 120ms var(--ease-out)" }}
        >
          <div
            className="rounded-[10px] border p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)]"
            style={{
              background: "var(--ag-card)",
              borderColor: "var(--ag-border-hi)",
            }}
          >
            {/* Address row IS the copy affordance — one click, no digging. */}
            <button
              className="flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--ag-overlay)]"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                } catch {
                  // clipboard unavailable — row stays inert
                }
              }}
              title="Copy address"
              type="button"
            >
              <span className="font-mono text-[11px] text-fg-subtle">
                {shortAddress(address)}
              </span>
              <span
                className="font-mono text-[10px]"
                style={{
                  color: copied ? "var(--ag-verify)" : "var(--fg-subtle)",
                }}
              >
                {copied ? "✓ Copied" : "Copy"}
              </span>
            </button>
            <div
              className="my-1.5 h-px"
              style={{ background: "var(--ag-border)" }}
            />
            {MENU.map((m) => (
              <Link
                className="block rounded-[7px] px-2.5 py-2 text-[13px] text-muted-foreground no-underline transition-colors hover:bg-[color:var(--ag-overlay)] hover:text-foreground"
                href={m.href}
                key={m.label}
              >
                {m.label}
              </Link>
            ))}
            <div
              className="my-1.5 h-px"
              style={{ background: "var(--ag-border)" }}
            />
            <button
              className="block w-full rounded-[7px] px-2.5 py-2 text-left text-[13px] text-fg-subtle transition-colors hover:text-foreground"
              onClick={async () => {
                clearSession();
                await fetch("/api/auth/session", { method: "DELETE" }).catch(
                  () => undefined
                );
                window.location.href = "/";
              }}
              type="button"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
