"use client";

/**
 * Withdraw funds modal — Geist build to `export-withdraw-funds.html`
 * (states 01 To wallet · 02 Review · 04 Sent; 03 To bank is the Q2 stub).
 *
 * Two tabs:
 *   - **To wallet** (wired) — amount + asset (USDC / USDsui, both gasless)
 *     + destination. The destination accepts a raw 0x Sui address OR an
 *     Audric handle (`name@audric`) / SuiNS name (`name.sui`), resolved to
 *     an address via `/api/suins/resolve` (debounced) before sending →
 *     Review → Confirm. The confirm runs the
 *     real gasless sponsored-tx round-trip via `sponsoredTx({ type: 'send' })`
 *     (prepare → zkLogin sign → execute), the same path the chat agent uses
 *     for `send_transfer`. Settles + returns an on-chain digest.
 *   - **To bank** — a "coming soon" Q2 placeholder. No offramp provider is
 *     wired yet (mirrors Add funds' "Buy with bank" tab).
 *
 * Amount safety: MAX + the typed amount are floored to the asset's decimals
 * (never rounded up) so the SDK's `amount * 10^decimals` can't exceed the
 * on-chain balance — see `.cursor/rules/financial-amounts.mdc`.
 */

import { isValidSuiAddress } from "@mysten/sui/utils";
import {
  CheckIcon,
  ChevronDownIcon,
  ClipboardIcon,
  CreditCardIcon,
  LandmarkIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePortfolio } from "@/hooks/use-portfolio";
import { SponsoredTxError, sponsoredTx } from "@/lib/audric/sponsored-tx";

type Tab = "wallet" | "bank";
type Step = "form" | "review" | "sent";
type Asset = "USDC" | "USDsui";

const ASSETS: Asset[] = ["USDC", "USDsui"];
const ASSET_DECIMALS = 6;

export interface WithdrawFundsModalProps {
  address: string;
  onClose: () => void;
  open: boolean;
}

function truncate(addr: string) {
  return addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function floorTo(amount: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.floor(amount * f) / f;
}

/**
 * Normalize a typed destination into a fully-qualified SuiNS name, or null
 * if it isn't a handle/name. `alice@audric` → `alice.audric.sui`; a bare
 * `alice.sui` (or any `*.sui`) passes through. Raw 0x addresses return null
 * (the caller handles those directly).
 */
function toSuinsName(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (!v) {
    return null;
  }
  const atAudric = v.match(/^([a-z0-9-]+)@audric$/);
  if (atAudric) {
    return `${atAudric[1]}.audric.sui`;
  }
  if (/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.sui$/.test(v)) {
    return v;
  }
  return null;
}

type ResolveStatus = "idle" | "resolving" | "resolved" | "notfound" | "error";

export function WithdrawFundsModal({
  address,
  open,
  onClose,
}: WithdrawFundsModalProps) {
  const [tab, setTab] = useState<Tab>("wallet");
  const [step, setStep] = useState<Step>("form");

  // Reset to the default state each time the modal opens.
  useEffect(() => {
    if (open) {
      setTab("wallet");
      setStep("form");
    }
  }, [open]);

  let sub: string;
  if (step === "sent") {
    sub = "Settled on Sui mainnet · gasless.";
  } else if (step === "review") {
    sub = "Confirm the details below.";
  } else {
    sub = "Send to a wallet, or cash out to your bank.";
  }

  let title: string;
  if (step === "sent") {
    title = "Withdrawal sent";
  } else if (step === "review") {
    title = "Review withdrawal";
  } else {
    title = "Withdraw";
  }

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
        className="flex max-h-[90dvh] flex-col overflow-hidden bg-card p-0 sm:max-w-[460px]"
        data-testid="withdraw-funds-modal"
        showCloseButton={false}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pt-[18px] pb-1.5">
          <div className="min-w-0">
            <DialogTitle className="m-0 font-medium font-sans text-[16px] text-foreground tracking-[-0.014em]">
              {title}
            </DialogTitle>
            <DialogDescription className="mt-1 m-0 font-sans text-[13px] text-muted-foreground tracking-[-0.011em]">
              {sub}
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

        {step === "form" && (
          <div className="flex shrink-0 gap-0 border-border border-b px-5 pt-3">
            <TabButton
              active={tab === "wallet"}
              onClick={() => setTab("wallet")}
            >
              To wallet
            </TabButton>
            <TabButton active={tab === "bank"} onClick={() => setTab("bank")}>
              To bank
              <span className="ml-2 rounded-[3px] border border-[var(--border-strong)] px-1.5 py-px text-[9.5px] tracking-[0.06em]">
                Q2
              </span>
            </TabButton>
          </div>
        )}

        {tab === "bank" && step === "form" ? (
          <BankBody />
        ) : (
          <WalletBody
            address={address}
            onClose={onClose}
            setStep={setStep}
            step={step}
          />
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

function WalletBody({
  address,
  step,
  setStep,
  onClose,
}: {
  address: string;
  step: Step;
  setStep: (s: Step) => void;
  onClose: () => void;
}) {
  const { session } = useZkLogin();
  const { data: portfolio } = usePortfolio(address);

  const [asset, setAsset] = useState<Asset>("USDC");
  const [assetMenuOpen, setAssetMenuOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{
    address: string;
    name: string;
  } | null>(null);
  const [resolveStatus, setResolveStatus] = useState<ResolveStatus>("idle");

  const available = useMemo(() => {
    const coin = portfolio?.wallet.find(
      (c) => c.symbol.toLowerCase() === asset.toLowerCase()
    );
    if (!coin) {
      return 0;
    }
    return floorTo(Number(coin.balance) / 10 ** coin.decimals, ASSET_DECIMALS);
  }, [portfolio, asset]);

  const numAmount = Number.parseFloat(amount);
  const amountValid =
    Number.isFinite(numAmount) && numAmount > 0 && numAmount <= available;

  const trimmedDest = destination.trim();
  const isRawAddress = isValidSuiAddress(trimmedDest);
  const pendingName = toSuinsName(destination);

  // Debounced SuiNS resolution for handle / name inputs. Raw 0x addresses
  // skip the round-trip entirely.
  useEffect(() => {
    if (isRawAddress || !pendingName) {
      setResolveStatus("idle");
      setResolved(null);
      return;
    }
    setResolveStatus("resolving");
    let cancelled = false;
    const timer = setTimeout(() => {
      const run = async () => {
        const res = await fetch(
          `/api/suins/resolve?name=${encodeURIComponent(pendingName)}`
        );
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setResolved(null);
          setResolveStatus("error");
          return;
        }
        const data = (await res.json()) as { address: string | null };
        if (cancelled) {
          return;
        }
        if (data.address) {
          setResolved({ name: pendingName, address: data.address });
          setResolveStatus("resolved");
        } else {
          setResolved(null);
          setResolveStatus("notfound");
        }
      };
      run().catch(() => {
        if (!cancelled) {
          setResolved(null);
          setResolveStatus("error");
        }
      });
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isRawAddress, pendingName]);

  const recipient = useMemo(() => {
    if (isRawAddress) {
      return trimmedDest;
    }
    if (pendingName && resolved && resolved.name === pendingName) {
      return resolved.address;
    }
    return null;
  }, [isRawAddress, trimmedDest, pendingName, resolved]);
  const destValid = recipient !== null;

  const handleReview = () => {
    setError(null);
    if (!amountValid) {
      setError(
        numAmount > available
          ? `You only have ${available} ${asset}.`
          : "Enter a valid amount."
      );
      return;
    }
    if (!destValid) {
      setError("Enter a valid Sui address or @audric / .sui handle.");
      return;
    }
    setStep("review");
  };

  const handleConfirm = async () => {
    if (!session) {
      setError("Your session expired — sign in again.");
      return;
    }
    if (!recipient) {
      setError("Destination address is invalid.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await sponsoredTx({
        type: "send",
        amount: floorTo(numAmount, ASSET_DECIMALS),
        recipient,
        asset,
        session,
      });
      setDigest(result.digest);
      setStep("sent");
    } catch (err) {
      const msg =
        err instanceof SponsoredTxError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Withdrawal failed";
      setError(msg);
      setStep("review");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setDestination(text.trim());
      }
    } catch {
      // clipboard unavailable — user can type manually.
    }
  };

  if (step === "sent" && digest) {
    return (
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-signal text-background">
            <CheckIcon size={16} />
          </span>
          <div>
            <div className="font-medium font-sans text-[15px] text-foreground tracking-[-0.014em]">
              Withdrawal sent
            </div>
            <div className="font-mono text-[11px] text-muted-foreground tracking-[0.02em]">
              Settled · gasless
            </div>
          </div>
        </div>
        <Receipt
          amount={`−${floorTo(numAmount, ASSET_DECIMALS)} ${asset}`}
          destination={recipient ?? trimmedDest}
          digest={digest}
        />
        <div className="flex w-full gap-2">
          <button
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-transparent font-medium font-sans text-[13px] text-foreground transition hover:bg-accent"
            onClick={onClose}
            type="button"
          >
            Done
          </button>
          <a
            className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 font-medium font-sans text-[13px] text-primary-foreground transition hover:opacity-90"
            href={`https://suivision.xyz/txblock/${digest}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            View on Sui ↗
          </a>
        </div>
      </div>
    );
  }

  if (step === "review" && Number.isFinite(numAmount) && numAmount > 0) {
    return (
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-5">
        <Receipt
          amount={`−${floorTo(numAmount, ASSET_DECIMALS)} ${asset}`}
          destination={recipient ?? trimmedDest}
          left={`${floorTo(available - numAmount, ASSET_DECIMALS)} ${asset}`}
        />
        <div className="flex w-full items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-[12.5px] text-warning leading-[1.5]">
          <span className="mt-px font-mono font-semibold">!</span>
          <span>
            Transfers are <strong className="font-medium">final</strong>.
            Double-check the destination — funds can&rsquo;t be recovered.
          </span>
        </div>
        {error && (
          <p className="text-center text-[12px] text-destructive">{error}</p>
        )}
        <div className="flex w-full gap-2">
          <button
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-transparent font-medium font-sans text-[13px] text-foreground transition hover:bg-accent disabled:opacity-50"
            disabled={submitting}
            onClick={() => setStep("form")}
            type="button"
          >
            Back
          </button>
          <button
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary px-3 font-medium font-sans text-[13px] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={submitting}
            onClick={handleConfirm}
            type="button"
          >
            {submitting ? "Confirming…" : "Confirm withdrawal"}
          </button>
        </div>
      </div>
    );
  }

  // step === "form"
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-5">
      <div className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        Amount
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
        <input
          aria-label="Amount"
          className="min-w-0 flex-1 bg-transparent font-medium font-sans text-[18px] text-foreground tabular-nums outline-none placeholder:text-muted-foreground"
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          value={amount}
        />
        <div className="relative shrink-0">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 font-medium font-mono text-[12px] text-foreground transition hover:bg-accent"
            onClick={() => setAssetMenuOpen((v) => !v)}
            type="button"
          >
            {asset}
            <ChevronDownIcon size={12} />
          </button>
          {assetMenuOpen && (
            <>
              <button
                aria-label="Close asset menu"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setAssetMenuOpen(false)}
                tabIndex={-1}
                type="button"
              />
              <div className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[110px] overflow-hidden rounded-md border border-border bg-card shadow-lg">
                {ASSETS.map((a) => (
                  <button
                    className={`flex w-full items-center px-3 py-2 text-left font-mono text-[12px] transition hover:bg-accent ${
                      a === asset ? "text-foreground" : "text-muted-foreground"
                    }`}
                    key={a}
                    onClick={() => {
                      setAsset(a);
                      setAssetMenuOpen(false);
                      setError(null);
                    }}
                    type="button"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between font-sans text-[12px] text-muted-foreground">
        <span>
          Available{" "}
          <strong className="font-medium text-foreground tabular-nums">
            {available} {asset}
          </strong>
        </span>
        <button
          className="rounded font-mono text-[10.5px] text-foreground uppercase tracking-[0.06em] transition hover:text-primary"
          onClick={() => setAmount(String(available))}
          type="button"
        >
          Max
        </button>
      </div>

      <div className="mt-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.08em]">
        To
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2.5">
        <input
          aria-label="Destination address"
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
          onChange={(e) => setDestination(e.target.value)}
          placeholder="0x… address or name@audric"
          value={destination}
        />
        <button
          aria-label="Paste"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          onClick={handlePaste}
          type="button"
        >
          <ClipboardIcon size={14} />
        </button>
      </div>

      {!isRawAddress && resolveStatus === "resolving" && (
        <p className="font-mono text-[11px] text-muted-foreground">
          Resolving…
        </p>
      )}
      {resolveStatus === "resolved" && resolved && (
        <p className="font-mono text-[11px] text-signal">
          ✓ {resolved.name} → {truncate(resolved.address)}
        </p>
      )}
      {resolveStatus === "notfound" && (
        <p className="font-mono text-[11px] text-destructive">
          No address found for that handle.
        </p>
      )}
      {resolveStatus === "error" && (
        <p className="font-mono text-[11px] text-destructive">
          Couldn’t resolve — try again.
        </p>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-signal/25 bg-signal/[0.06] px-3 py-2 text-[12px] text-foreground">
        <ZapIcon className="text-signal" size={13} />
        <span>USDC &amp; USDsui withdrawals are gasless.</span>
      </div>

      {error && (
        <p className="text-center text-[12px] text-destructive">{error}</p>
      )}

      <div className="mt-1 flex w-full gap-2">
        <button
          className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-border bg-transparent font-medium font-sans text-[13px] text-foreground transition hover:bg-accent"
          onClick={onClose}
          type="button"
        >
          Cancel
        </button>
        <button
          className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-primary px-3 font-medium font-sans text-[13px] text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!(amountValid && destValid)}
          onClick={handleReview}
          type="button"
        >
          Review
        </button>
      </div>
    </div>
  );
}

function Receipt({
  amount,
  destination,
  left,
  digest,
}: {
  amount: string;
  destination: string;
  left?: string;
  digest?: string;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-3 text-[13px]">
      <Row label="Amount">
        <span className="font-medium text-destructive tabular-nums">
          {amount}
        </span>
      </Row>
      <Row label="To">
        <span className="font-mono text-[12px] text-foreground">
          {truncate(destination)}
        </span>
      </Row>
      <Row label="Network">
        <span className="text-foreground">Sui mainnet</span>
      </Row>
      <Row label="Network fee">
        <span className="font-medium text-signal">Gasless</span>
      </Row>
      {left !== undefined && (
        <Row label="You’ll have left">
          <span className="text-foreground tabular-nums">{left}</span>
        </Row>
      )}
      {digest && (
        <Row label="Tx">
          <a
            className="font-mono text-[12px] text-foreground underline-offset-2 hover:underline"
            href={`https://suivision.xyz/txblock/${digest}`}
            rel="noreferrer noopener"
            target="_blank"
          >
            {`${digest.slice(0, 6)}…${digest.slice(-4)}`} ↗
          </a>
        </Row>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

const OFFRAMPS = [
  {
    icon: LandmarkIcon,
    title: "Bank transfer",
    sub: "ACH · SEPA · FPS — 70+ countries. Settles in 1–2 business days.",
    fee: "~$0–1 fee",
  },
  {
    icon: CreditCardIcon,
    title: "Debit card payout",
    sub: "Instant to eligible Visa & Mastercard debit.",
    fee: "~1.5% fee",
  },
] as const;

function BankBody() {
  return (
    <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto p-5">
      <p className="font-sans text-[12.5px] text-muted-foreground tracking-[-0.011em]">
        Cash out USDC straight to your bank in 70+ countries. Rolling out in Q2.
      </p>
      {OFFRAMPS.map((o) => (
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
        Cash out to bank arrives Q2
      </p>
    </div>
  );
}
