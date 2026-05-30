"use client";

import { useCallback, useState } from "react";
import { SuiPayQr } from "@/components/pay/sui-pay-qr";
import {
  CanvasButton,
  CanvasFooterMeta,
  CanvasShell,
} from "./canvas-shell";

/**
 * ReceiveAddressCanvas — wallet 0x address + open-receive QR rendered
 * inline in chat. Surfaces the same QR primitive (`SuiPayQr` with
 * `amount: null`) that `audric.ai/[username]` uses on the public profile
 * page, so the chat-side and profile-side receive UX are visually
 * identical.
 *
 * Open-receive semantics: scanning this QR opens the payer's wallet
 * with the recipient pre-filled but the AMOUNT unset — the wallet
 * prompts the payer for the amount. Use this when the user wants
 * "give me a QR so anyone can pay me whatever they like." For a
 * fixed-amount payment link (where the QR encodes a specific dollar
 * value), use `create_payment_link` instead — the engine's tool
 * description tells the LLM to pick this template vs that tool by
 * intent.
 *
 * Engine data shape (see `packages/engine/src/tools/canvas.ts` —
 * `template === 'receive_address'` branch):
 *
 *   templateData: {
 *     available: true,
 *     address: string,           // canonical 0x form
 *     isSelfRender: boolean,     // true when address === signed-in user
 *     suinsName: string | null,  // resolved SuiNS name when present
 *   }
 *
 * No data fetching needed — the address itself IS the payload.
 *
 * S.266 — 2026-05-23.
 */

interface ReceiveAddressData {
  available: true;
  address: string;
  isSelfRender?: boolean;
  suinsName?: string | null;
}

interface Props {
  data: ReceiveAddressData | { available: false; message?: string };
}

const COPY_FEEDBACK_MS = 1500;

function truncAddr(addr: string): string {
  return addr.length > 16 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function ReceiveAddressCanvas({ data }: Props) {
  const [copied, setCopied] = useState(false);

  const address = data.available ? data.address : "";
  const suinsName = data.available ? data.suinsName : null;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address).catch(() => {
      // Clipboard can fail in insecure contexts; UX is best-effort.
    });
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [address]);

  if (!data.available) {
    return (
      <CanvasShell eyebrow="Receive" name="Your address">
        <div className="flex flex-col items-center justify-center space-y-2 py-6 text-center">
          <span className="text-3xl">📭</span>
          <p className="text-muted-foreground text-sm">
            {data.message ?? "Receive address unavailable."}
          </p>
        </div>
      </CanvasShell>
    );
  }

  const displayLabel = suinsName ?? truncAddr(address);

  return (
    <CanvasShell
      eyebrow="Receive"
      footer={
        <>
          <CanvasFooterMeta>
            Or in chat: <strong className="font-medium text-foreground">"what's my address"</strong>
          </CanvasFooterMeta>
          <CanvasButton onClick={handleCopy} variant="secondary">
            {copied ? "✓ Copied" : "Copy handle"}
          </CanvasButton>
        </>
      }
      live
      name="Your address"
    >
      <div className="flex flex-col items-center gap-6 sm:grid sm:grid-cols-[168px_1fr] sm:items-center">
        <div className="shrink-0">
          <SuiPayQr amount={null} recipientAddress={address} size={168} />
        </div>

        <div className="flex w-full min-w-0 flex-col gap-2.5">
          <div className="font-medium font-mono text-[20px] text-foreground tracking-[-0.014em]">
            {displayLabel}
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-foreground">
              {address}
            </span>
            <button
              aria-label={
                copied ? "Copied to clipboard" : `Copy address ${address}`
              }
              aria-live="polite"
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onClick={handleCopy}
              type="button"
            >
              {copied ? (
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="13"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="1.5"
                  viewBox="0 0 16 16"
                  width="13"
                >
                  <path d="M3 8.5L6.5 12L13 4" />
                </svg>
              ) : (
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="13"
                  viewBox="0 0 16 16"
                  width="13"
                >
                  <rect
                    height="9"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    width="8"
                    x="5"
                    y="5"
                  />
                  <path
                    d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-5A1.5 1.5 0 0 0 3 3.5v7A1.5 1.5 0 0 0 4.5 12H5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="1.4"
                  />
                </svg>
              )}
            </button>
          </div>

          <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2.5 text-[12.5px] text-warning leading-[1.5] tracking-[-0.011em]">
            <span className="shrink-0 font-mono font-semibold">!</span>
            <span>
              Send only on{" "}
              <strong className="font-medium text-warning">Sui mainnet</strong>{" "}
              ·{" "}
              {["USDC", "USDsui", "SUI"].map((t) => (
                <code
                  className="mr-1 rounded-[3px] bg-warning/[0.08] px-1.5 py-px font-mono text-[11.5px]"
                  key={t}
                >
                  {t}
                </code>
              ))}
            </span>
          </div>
        </div>
      </div>
    </CanvasShell>
  );
}
