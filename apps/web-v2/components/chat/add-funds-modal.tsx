"use client";

/**
 * Add funds modal — Geist build to `phase2-add-funds.html` (states 01–02).
 *
 * Two tabs:
 *   - **Receive** (built fully) — the open-receive QR (`SuiPayQr`, amount-less
 *     `sui:pay` deep-link), the user's `@audric` handle hero, a copyable Sui
 *     address row, the Sui-mainnet-only warning strip, and Share-link / Copy
 *     actions. This is the real, wired surface.
 *   - **Buy with bank** — a "coming soon" placeholder. No onramp provider is
 *     wired yet, so the three partner cards (bank transfer, card, Apple/Google
 *     Pay) are disabled with a Q2 badge.
 *
 * The prototype's listening / confirmed deposit-watching states (03–04) need
 * a chain-subscription that isn't wired in web-v2 — deferred. The address +
 * handle come from the caller (zkLogin address + claimed username).
 */

import {
  CheckIcon,
  CopyIcon,
  CreditCardIcon,
  LandmarkIcon,
  type LucideIcon,
  Share2Icon,
  SmartphoneIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SuiPayQr } from "@/components/pay/sui-pay-qr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const COPIED_FEEDBACK_MS = 1500;
const PROFILE_BASE = "https://audric.ai";

type Tab = "receive" | "buy";

export interface AddFundsModalProps {
  address: string;
  onClose: () => void;
  open: boolean;
  username?: string | null;
}

export function AddFundsModal({
  address,
  username,
  open,
  onClose,
}: AddFundsModalProps) {
  const [tab, setTab] = useState<Tab>("receive");

  // Reset to the Receive tab each time the modal opens.
  useEffect(() => {
    if (open) {
      setTab("receive");
    }
  }, [open]);

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent
        className="overflow-hidden bg-card p-0 sm:max-w-[460px]"
        data-testid="add-funds-modal"
        showCloseButton={false}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-[18px] pb-1.5">
          <div className="min-w-0">
            <DialogTitle className="m-0 font-medium font-sans text-[16px] text-foreground tracking-[-0.014em]">
              Add funds
            </DialogTitle>
            <DialogDescription className="mt-1 m-0 font-sans text-[13px] text-muted-foreground tracking-[-0.011em]">
              {tab === "receive"
                ? "Receive USDC or SUI from anyone."
                : "Buy USDC with your bank or card."}
            </DialogDescription>
          </div>
          <button
            aria-label="Close"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
            onClick={onClose}
            type="button"
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="flex gap-0 border-border border-b px-5 pt-3">
          <TabButton
            active={tab === "receive"}
            onClick={() => setTab("receive")}
          >
            Receive
          </TabButton>
          <TabButton active={tab === "buy"} onClick={() => setTab("buy")}>
            Buy with bank
            <span className="ml-2 rounded-[3px] border border-[var(--border-strong)] px-1.5 py-px text-[9.5px] tracking-[0.06em]">
              Q2
            </span>
          </TabButton>
        </div>

        {tab === "receive" ? (
          <ReceiveBody address={address} username={username ?? null} />
        ) : (
          <BuyBody />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-pressed={active}
      className={`-mb-px inline-flex items-center border-b-2 px-3.5 pt-2 pb-2.5 font-medium font-mono text-[11px] uppercase tracking-[0.08em] transition ${
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function ReceiveBody({
  address,
  username,
}: {
  address: string;
  username: string | null;
}) {
  const [addrCopied, setAddrCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [handleCopied, setHandleCopied] = useState(false);

  const fullHandle = username ? `${username}@audric` : null;
  const profileUrl = username ? `${PROFILE_BASE}/${username}` : null;

  const copy = (text: string, setFlag: (v: boolean) => void) => {
    navigator.clipboard.writeText(text).catch(() => {
      // best-effort; clipboard can fail in insecure contexts
    });
    setFlag(true);
    setTimeout(() => setFlag(false), COPIED_FEEDBACK_MS);
  };

  const handleShare = () => {
    const url = profileUrl ?? address;
    if (typeof navigator.share === "function") {
      navigator
        .share({ title: "Pay me on Audric", url })
        .catch(() => copy(url, setShared));
      return;
    }
    copy(url, setShared);
  };

  return (
    <div className="flex flex-col items-center gap-4 p-5">
      <SuiPayQr amount={null} recipientAddress={address} size={180} />

      {fullHandle && (
        <div className="flex w-full flex-col items-center gap-1">
          <div className="font-medium font-mono text-[22px] text-foreground tracking-[-0.018em]">
            {fullHandle}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.06em]">
            Your Audric handle
          </div>
        </div>
      )}

      <div className="flex w-full items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 font-mono text-[12.5px] text-foreground tracking-[0.02em]">
        <span className="min-w-0 flex-1 truncate">{address}</span>
        <button
          aria-label={addrCopied ? "Copied address" : "Copy address"}
          className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md transition hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none ${
            addrCopied ? "text-signal" : "text-muted-foreground"
          }`}
          onClick={() => copy(address, setAddrCopied)}
          type="button"
        >
          {addrCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
      </div>

      <div className="flex w-full items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-[12.5px] text-warning leading-[1.5]">
        <span className="mt-px font-mono font-semibold">!</span>
        <span>
          Send only on <strong className="font-medium">Sui mainnet</strong>.
          Funds sent on other chains will be lost. Accepts{" "}
          <WarnCode>USDC</WarnCode> · <WarnCode>USDsui</WarnCode> ·{" "}
          <WarnCode>SUI</WarnCode>.
        </span>
      </div>

      <div className="flex w-full gap-2">
        <button
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-transparent font-medium font-sans text-[13px] text-foreground transition hover:bg-accent focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={handleShare}
          type="button"
        >
          <Share2Icon size={14} />
          {shared ? "Copied" : "Share link"}
        </button>
        <button
          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 font-medium font-sans text-[13px] text-primary-foreground transition hover:opacity-90 focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:outline-none"
          onClick={() => copy(fullHandle ?? address, setHandleCopied)}
          type="button"
        >
          {handleCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          {(() => {
            if (handleCopied) {
              return "Copied";
            }
            return fullHandle ? "Copy handle" : "Copy address";
          })()}
        </button>
      </div>
    </div>
  );
}

function WarnCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[3px] border border-warning/20 bg-warning/10 px-[5px] py-px font-mono text-[11.5px] text-warning">
      {children}
    </code>
  );
}

const ONRAMPS: {
  icon: LucideIcon;
  title: string;
  sub: string;
  fee: string;
}[] = [
  {
    icon: LandmarkIcon,
    title: "Bank transfer",
    sub: "ACH or SEPA — 0% fee, settles in 1–2 business days.",
    fee: "~$0 fee",
  },
  {
    icon: CreditCardIcon,
    title: "Debit or credit card",
    sub: "Instant. Powered by partner.",
    fee: "~2.5% fee",
  },
  {
    icon: SmartphoneIcon,
    title: "Apple Pay · Google Pay",
    sub: "One-tap from your wallet app.",
    fee: "~2.9% fee",
  },
];

function BuyBody() {
  return (
    <div className="flex flex-col gap-2.5 p-5">
      {ONRAMPS.map((o) => (
        <div
          aria-disabled="true"
          className="flex cursor-not-allowed items-start gap-3.5 rounded-[10px] border border-border p-4 opacity-60"
          key={o.title}
        >
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
            <o.icon size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-medium font-sans text-[14px] text-foreground tracking-[-0.011em]">
              {o.title}
              <span className="rounded-[3px] border border-[var(--border-strong)] px-1.5 py-px font-mono text-[9.5px] text-muted-foreground uppercase tracking-[0.08em]">
                Q2
              </span>
            </div>
            <div className="mt-0.5 font-sans text-[12.5px] text-muted-foreground tracking-[-0.011em]">
              {o.sub}
            </div>
          </div>
          <div className="shrink-0 font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
            {o.fee}
          </div>
        </div>
      ))}
      <p className="mt-1 text-center font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
        Buy with bank arrives Q2
      </p>
    </div>
  );
}
