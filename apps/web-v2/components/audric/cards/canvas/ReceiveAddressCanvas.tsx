"use client";

import { useCallback, useState } from "react";
import { SuiPayQr } from "@/components/pay/sui-pay-qr";

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

  if (!data.available) {
    return (
      <div className="flex flex-col items-center justify-center space-y-2 py-10 text-center">
        <span className="text-3xl">📭</span>
        <p className="text-muted-foreground text-sm">
          {data.message ?? "Receive address unavailable."}
        </p>
      </div>
    );
  }

  const { address, suinsName } = data;
  const displayLabel = suinsName ?? truncAddr(address);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address).catch(() => {
      // Clipboard can fail in insecure contexts; UX is best-effort.
    });
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [address]);

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-6">
      <SuiPayQr amount={null} recipientAddress={address} size={180} />

      <div className="text-center">
        <div className="font-mono text-[14px] text-foreground">
          {displayLabel}
        </div>
        <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
          {address}
        </div>
      </div>

      <button
        aria-label={
          copied ? "Copied to clipboard" : `Copy address ${address}`
        }
        aria-live="polite"
        className="w-full max-w-xs rounded-md border border-border bg-background px-3 py-2 text-center text-[12px] text-foreground transition-colors hover:border-foreground/30"
        onClick={handleCopy}
        type="button"
      >
        {copied ? "✓ Copied address" : "📋 Copy address"}
      </button>

      <p className="max-w-xs text-center text-[11px] text-muted-foreground">
        Scan with a Sui wallet, or paste this address into any wallet or
        exchange withdrawal form. The payer chooses the amount.
      </p>
    </div>
  );
}
