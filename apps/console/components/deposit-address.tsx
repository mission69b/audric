"use client";

import { toDataURL } from "qrcode";
import { useEffect, useState } from "react";

// Deposit affordance for the wallet panel (§II.15b.5): the QR + copyable
// address for funding the Passport with on-chain USDC (what Try-it spends —
// distinct from platform credit, which pays API usage).
export function DepositAddress({ address }: { address: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    toDataURL(address, {
      margin: 1,
      width: 132,
      color: { dark: "#ececec", light: "#00000000" },
    })
      .then(setQr)
      .catch(() => setQr(null));
  }, [address]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      {qr && (
        // biome-ignore lint/performance/noImgElement: local data-URL QR
        <img
          alt={`Deposit QR for ${address}`}
          className="rounded-lg border border-border/50"
          height={132}
          src={qr}
          width={132}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="break-all font-mono text-foreground text-xs">
          {address}
        </div>
        <button
          className="mt-2 rounded-lg border border-border/60 px-2.5 py-1 font-medium text-muted-foreground text-xs transition-colors hover:bg-secondary hover:text-secondary-foreground"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(address);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // clipboard unavailable — the address is selectable
            }
          }}
          type="button"
        >
          {copied ? "Copied" : "Copy address"}
        </button>
        <p className="mt-2 text-muted-foreground/60 text-xs">
          Send <span className="text-foreground">USDC on Sui</span> to this
          address. It funds store purchases (Try it) and agent payments — this
          is your on-chain wallet, separate from platform credit (which pays API
          usage).
        </p>
      </div>
    </div>
  );
}
