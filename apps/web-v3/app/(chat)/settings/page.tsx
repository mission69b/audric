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

export default function SettingsPage() {
  const router = useRouter();
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

      {/* Memory */}
      <Section title="Private Memory">
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-xs">
            When on, Audric remembers your preferences across chats —{" "}
            <strong>encrypted, private, off by default</strong>. Turn it off any
            time to stop recall.
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
          Permanent per-memory deletion is coming soon. Until then, turning
          memory off stops Audric from recalling it, and stored memories expire
          on their own.
        </p>
      </Section>

      {/* Your data */}
      <Section title="Your data">
        <Row
          desc="Remove every chat and its messages. This can't be undone."
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
          desc="Wipe all chats, messages, and generated artifacts (and their files). Your account, plan, and credit balance are kept."
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
            · Models run through a zero-data-retention gateway by default.
          </li>
          <li>
            · Chats and artifacts are stored privately (encrypted at rest).
          </li>
          <li>· Memories are encrypted on Walrus — yours, never sold.</li>
        </ul>
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
    </Overlay>
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
