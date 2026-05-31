"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.11 (Batch A) — toasts + confirm dialogs restyled
 * to `t2000-AFI/audric/phase2-batch-a.html` §2 (confirm dialog) + §3 (toasts).
 *
 * Fire each toast variant (cyan success / amber guard / red sticky error /
 * neutral info / a stack), and open the confirm dialog in its neutral +
 * destructive forms. Gated to non-production.
 *
 * NOTE: the standalone send modal (batch-a §1) and the swap/borrow canvases
 * (batch-c / swap-quote) were deliberately NOT built — chat-native send +
 * `SwapQuoteCardV2` + `PermissionCard` + the `health_simulator` canvas
 * already cover those flows; a second surface would duplicate them. See the
 * R6.11 entry in SPEC_AUDRIC_GEIST_MIGRATION.md.
 */
export default function TransactionalHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [destructiveOpen, setDestructiveOpen] = useState(false);
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Transactional harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-batch-a.html (toasts + confirm)"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle
            active={!isDark}
            label="Light"
            onClick={() => setTheme("light")}
          />
          <Toggle
            active={isDark}
            label="Dark"
            onClick={() => setTheme("dark")}
          />
        </div>
      </header>

      <main className="mx-auto flex max-w-[640px] flex-col gap-10 px-6 py-12">
        <Section label="// TOASTS · bottom-right · max 3 · 4s default, sticky on error">
          <Action
            label="Success"
            onClick={() =>
              toast.success("Sent 50 USDC to alice@audric", {
                description: "0.41s · gasless · Hp4o…HHs",
              })
            }
          />
          <Action
            label="Guard (warn)"
            onClick={() =>
              toast.warning("Daily cap reached · $200 of $200 used today", {
                description: "Audric paused auto-send until tomorrow.",
              })
            }
          />
          <Action
            label="Error (sticky)"
            onClick={() =>
              toast.error("Transaction reverted · insufficient balance", {
                description: "No funds moved. Gas refunded.",
                duration: Number.POSITIVE_INFINITY,
              })
            }
          />
          <Action
            label="Info"
            onClick={() =>
              toast.info("Yield digest ready", {
                description: "+$0.92 earned this week",
              })
            }
          />
          <Action
            label="Plain (no sub)"
            onClick={() => toast.success("Copied to clipboard")}
          />
          <Action
            label="Stack ×3"
            onClick={() => {
              toast.success("Saved 100 USDC to NAVI · 5.24% APY", {
                description: "Earning ~$5.24/yr",
              });
              toast.success("Swapped 50 SUI → 209.62 USDC", {
                description: "Cetus · 0.18% impact",
              });
              toast.info("Yield digest ready", {
                description: "+$0.92 earned this week",
              });
            }}
          />
        </Section>

        <Section label="// CONFIRM DIALOG · neutral + destructive">
          <Action
            label="Neutral confirm"
            onClick={() => setConfirmOpen(true)}
          />
          <Action
            label="Destructive confirm"
            onClick={() => setDestructiveOpen(true)}
          />
        </Section>
      </main>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Raise daily cap to $500?</AlertDialogTitle>
            <AlertDialogDescription>
              Audric will be able to send up to $500/day without
              re-confirmation. You can lower this any time in Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Raise cap</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog onOpenChange={setDestructiveOpen} open={destructiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all your chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes every conversation in your history. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive">
              Delete everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <span className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-9 items-center rounded-lg border border-border px-4 font-medium font-sans text-[13px] text-foreground transition hover:bg-accent"
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Toggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-md border px-2.5 py-1 font-mono text-[11px] tracking-[0.04em] transition-colors",
        active
          ? "border-border bg-card text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}
