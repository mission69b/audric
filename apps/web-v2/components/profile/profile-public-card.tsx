import Link from "next/link";
import { AddressCopyButton } from "@/app/[username]/address-copy-button";
import { SendToHandleButton } from "@/app/[username]/send-to-handle-button";
import { SuiPayQr } from "@/components/pay/sui-pay-qr";
import { AudricMark } from "@/components/ui/audric-mark";

/**
 * ProfilePublicCard — the standalone public creator card at
 * `audric.ai/[username]` (R6.6 6c, `phase2-profile-legal.html` CP4).
 *
 * Presentational + server-safe (no hooks) so the server-rendered profile
 * page and the `/dev/profile` harness share the exact same chrome — the
 * harness verifies the real card, not a copy.
 *
 * Scope decision (R6.6 6c, locked with the user): adopt the phase2
 * aesthetic (page-nav, cover, avatar, sans name + on-chain "Verified" tag,
 * Q2 storefront banner, powered-by footer) but KEEP the real, wired data
 * (the wallet-connect send flow + receive QR + copy-address). The
 * prototype's social stats (received $ / payers / joined) and personal bio
 * are NOT rendered — there's no backend for them in web-v2, and fabricating
 * them would be worse than omitting. The tagline below is a generic product
 * fact, not invented personal data.
 */

function truncateAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function VerifiedTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] border border-signal/30 bg-signal-bg px-1.5 py-0.5 font-mono text-[9.5px] text-signal uppercase tracking-[0.06em]">
      <svg
        aria-hidden="true"
        fill="none"
        height="8"
        viewBox="0 0 16 16"
        width="8"
      >
        <path
          d="M3.5 8.5L6.5 11.5L13 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
      Verified
    </span>
  );
}

export function ProfilePublicCard({
  label,
  displayHandle,
  address,
}: {
  address: string;
  displayHandle: string;
  label: string;
}) {
  const name = label.charAt(0).toUpperCase() + label.slice(1);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* page-nav — brand + canonical url */}
      <div className="flex h-12 items-center gap-2 border-border border-b px-[18px]">
        <Link
          aria-label="Audric"
          className="inline-flex items-center gap-2 transition-opacity hover:opacity-80"
          href="/"
        >
          <AudricMark size={18} />
          <span className="font-sans font-semibold text-[14px] tracking-[-0.022em]">
            audric
          </span>
        </Link>
        <span className="ml-auto truncate font-mono text-[10.5px] text-muted-foreground tracking-[0.02em]">
          audric.ai/{label}
        </span>
      </div>

      {/* cover + identity */}
      <div className="h-20 bg-gradient-to-br from-muted to-accent" />
      <div className="px-[18px] pb-[18px]">
        <div className="-mt-7 size-14 rounded-full border-[3px] border-card bg-gradient-to-br from-muted-foreground to-foreground" />
        <div className="mt-2.5 flex items-center gap-2">
          <h1 className="break-all font-sans font-semibold text-[18px] text-foreground tracking-[-0.018em]">
            {name}
          </h1>
          <VerifiedTag />
        </div>
        <div className="break-all font-mono text-[12px] text-muted-foreground tracking-[0.02em]">
          {displayHandle}
        </div>
        <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
          Pay in USDC — gasless, settles in under a second.
        </p>

        {/* Pay — wallet-connect send flow (real, wired) */}
        <div className="mt-4">
          <SendToHandleButton
            handle={displayHandle}
            recipientAddress={address}
          />
        </div>

        {/* or scan / copy from another wallet (real, wired) */}
        <div className="mt-4 flex flex-col items-center gap-3 border-border border-t pt-4">
          <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.08em]">
            or scan to pay
          </p>
          <SuiPayQr amount={null} recipientAddress={address} size={160} />
          <div className="font-mono text-[10px] text-muted-foreground">
            {truncateAddress(address)}
          </div>
          <div className="w-full">
            <AddressCopyButton address={address} />
          </div>
        </div>

        {/* Q2 storefront — Audric Store is Phase 5 / coming soon */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.06em]">
          <span className="rounded-[3px] border border-border px-1.5 py-px text-foreground">
            Q2
          </span>
          Storefront · digital goods coming
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center gap-1.5 border-border border-t px-[18px] py-3 font-mono text-[10px] text-muted-foreground tracking-[0.04em]">
        <span className="size-1 rounded-full bg-signal" />
        Powered by Audric · Conversational finance on Sui
      </div>
    </div>
  );
}
