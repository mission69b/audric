"use client";

/**
 * Settings → Privacy hub (Phase 6, SPEC_AUDRIC_V3 §6/§6b). Overlay over the
 * persistent chat shell (same pattern as /settings/billing). Privacy controls
 * are the headline, not a config maze: Memory (opt-in + honest deletion note),
 * Your data (delete-all-chats + purge-all), storage transparency, Billing link.
 */

import { ChevronRightIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useZkLogin } from "@/components/auth/zklogin-provider";
import { HandleModal } from "@/components/chat/handle-modal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MEMORY_KEY = "audric-memory";
const NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK ?? "mainnet";

function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatExpiry(expiresAt: number | undefined): string {
  if (!expiresAt) {
    return "—";
  }
  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    return "Expired — sign in again";
  }
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) {
    return `Expires in ${mins}m`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `Expires in ${hrs}h`;
  }
  return `Expires in ${Math.floor(hrs / 24)}d`;
}

export default function SettingsPage() {
  const router = useRouter();
  const { address, email, session } = useZkLogin();
  const [handleOpen, setHandleOpen] = useState(false);
  const { data: identity, mutate: mutateIdentity } = useSWR<{
    username: string | null;
    handle: string | null;
    configured: boolean;
  }>(`${BASE}/api/identity/me`, fetcher, { revalidateOnFocus: false });
  const { data: models } = useSWR<{ memoryEnabled?: boolean }>(
    `${BASE}/api/models`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [memoryOn, setMemoryOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMemoryOn(window.localStorage.getItem(MEMORY_KEY) === "1");
  }, []);

  function toggleMemory() {
    const next = !memoryOn;
    setMemoryOn(next);
    window.localStorage.setItem(MEMORY_KEY, next ? "1" : "0");
  }

  async function deleteAllChats() {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/history`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("failed");
      }
      toast.success("All chats deleted.");
      router.push(`${BASE}/`);
      router.refresh();
    } catch {
      toast.error("Couldn't delete chats.");
    } finally {
      setBusy(false);
    }
  }

  async function forgetMemory() {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/account/forget-memory`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error("failed");
      }
      toast.success("Your memories were forgotten — they won't be recalled.");
    } catch {
      toast.error("Couldn't forget your memories.");
    } finally {
      setBusy(false);
    }
  }

  async function purgeAll() {
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/account/purge`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j?.error ?? "failed");
      }
      toast.success(
        `Wiped ${j.chatsDeleted} chats, ${j.documentsDeleted} artifacts.`
      );
      router.push(`${BASE}/`);
      router.refresh();
    } catch {
      toast.error("Couldn't purge your data.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={() => router.push(`${BASE}/`)}>
      <h1 className="font-semibold text-foreground text-xl">Settings</h1>

      {/* Passport — identity, wallet, session */}
      {address && (
        <Section title="Passport">
          <p className="text-muted-foreground text-xs">
            <strong className="text-foreground/80">
              No seed phrase, no bank.
            </strong>{" "}
            Your wallet is created from your Google sign-in — non-custodial, so
            only you can move your money. We can't touch it.
          </p>
          <div className="mt-3 space-y-2.5">
            {identity?.configured && (
              <InfoRow label="Handle">
                {identity.handle ? (
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-foreground/80">
                      {identity.handle}
                    </span>
                    <button
                      className="text-muted-foreground text-xs underline hover:text-foreground"
                      onClick={() => setHandleOpen(true)}
                      type="button"
                    >
                      Change
                    </button>
                  </span>
                ) : (
                  <button
                    className="rounded-md border border-border px-2.5 py-1 text-foreground/80 text-xs transition-colors hover:bg-accent"
                    onClick={() => setHandleOpen(true)}
                    type="button"
                  >
                    Claim a handle
                  </button>
                )}
              </InfoRow>
            )}
            <InfoRow label="Wallet address">
              <button
                className="font-mono text-foreground/80 transition-colors hover:text-foreground"
                onClick={() => {
                  navigator.clipboard.writeText(address);
                  toast.success("Address copied");
                }}
                title="Copy address"
                type="button"
              >
                {shortAddress(address)}
              </button>
            </InfoRow>
            <InfoRow label="Network">
              <span className="text-foreground/80 capitalize">{NETWORK}</span>
            </InfoRow>
            {email && (
              <InfoRow label="Sign-in email">
                <span className="text-foreground/80">{email}</span>
              </InfoRow>
            )}
            <InfoRow label="Session">
              <span className="text-foreground/80">
                {formatExpiry(session?.expiresAt)}
              </span>
            </InfoRow>
          </div>
        </Section>
      )}

      {/* Memory */}
      <Section title="Private Memory">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            Remembers your preferences across chats so it doesn't start over —{" "}
            <strong>encrypted on Walrus, off by default</strong>.
          </p>
          {models?.memoryEnabled ? (
            <Button
              onClick={toggleMemory}
              size="sm"
              type="button"
              variant={memoryOn ? "default" : "outline"}
            >
              {memoryOn ? "On" : "Off"}
            </Button>
          ) : (
            <span className="shrink-0 text-muted-foreground/60 text-xs">
              Unavailable
            </span>
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/60">
          Off stops recall; stored memories expire on their own.
        </p>
        {models?.memoryEnabled && (
          <>
            <div className="my-3 border-border/40 border-t" />
            <Row
              desc="Stop all recall and start fresh. Encrypted memories expire from storage on their own."
              title="Forget all my memories"
            >
              <ConfirmButton
                busy={busy}
                confirmLabel="Forget all"
                description="Audric will stop recalling everything it has remembered about you, and start fresh. The encrypted memories expire from decentralized storage on their own. This can't be undone."
                label="Forget all"
                onConfirm={forgetMemory}
                title="Forget all your memories?"
              />
            </Row>
          </>
        )}
      </Section>

      {/* Your data */}
      <Section title="Your data">
        <Row
          desc="Permanently remove every chat and message."
          title="Delete all chats"
        >
          <ConfirmButton
            busy={busy}
            confirmLabel="Delete all"
            description="This permanently deletes all of your chats and their messages."
            label="Delete all"
            onConfirm={deleteAllChats}
            title="Delete all chats?"
          />
        </Row>
        <div className="my-3 border-border/40 border-t" />
        <Row
          desc="Wipe every chat, message, and file. Your account, plan, and credit are kept."
          title="Purge all my data"
        >
          <ConfirmButton
            busy={busy}
            confirmLabel="Purge everything"
            description="This permanently deletes all of your chats, messages, and artifacts. Your account, plan, and credit balance are kept. This can't be undone."
            label="Purge"
            onConfirm={purgeAll}
            title="Purge all your data?"
          />
        </Row>
      </Section>

      {/* Privacy / storage transparency */}
      <Section title="Privacy & storage">
        <ul className="space-y-1.5 text-muted-foreground text-xs">
          <li>
            · Zero data retention — providers never store or train on your
            chats.
          </li>
          <li>
            · Chats and files encrypted at rest, never public — only you can
            read them.
          </li>
          <li>
            · Memory encrypted on Walrus (decentralized) — yours, never sold.
          </li>
        </ul>
        <div className="mt-3 flex gap-4 text-muted-foreground text-xs">
          <a className="underline hover:text-foreground" href="/privacy">
            Privacy Policy
          </a>
          <a className="underline hover:text-foreground" href="/terms">
            Terms of Service
          </a>
        </div>
      </Section>

      {/* Billing link */}
      <button
        className="mt-4 flex w-full items-center justify-between rounded-2xl border border-border/50 bg-card/40 p-5 text-left transition-colors hover:bg-card/60"
        onClick={() => router.push(`${BASE}/settings/billing`)}
        type="button"
      >
        <div>
          <div className="font-medium text-foreground text-sm">
            Billing & plans
          </div>
          <p className="mt-0.5 text-muted-foreground text-xs">
            Credit balance, top-up, auto-recharge, and subscription.
          </p>
        </div>
        <ChevronRightIcon className="size-4 text-muted-foreground" />
      </button>

      <HandleModal
        currentLabel={identity?.username ?? null}
        onChanged={() => mutateIdentity()}
        onClose={() => setHandleOpen(false)}
        open={handleOpen}
      />
    </Overlay>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
      <h2 className="mb-2 font-medium text-foreground text-sm">{title}</h2>
      {children}
    </div>
  );
}

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium text-foreground text-sm">{title}</div>
        <p className="mt-0.5 text-muted-foreground text-xs">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function ConfirmButton({
  label,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          className="shrink-0 text-red-500 hover:text-red-500"
          disabled={busy}
          size="sm"
          type="button"
          variant="outline"
        >
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-500 text-white hover:bg-red-600"
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <button
          aria-label="Back to chat"
          className="float-right rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
