"use client";

import { CheckIcon, LoaderIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isReserved } from "@/lib/identity/reserved-usernames";
import { validateAudricLabel } from "@/lib/identity/validate-label";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type CheckState = "idle" | "checking" | "available" | "unavailable";

function reasonText(reason: string): string {
  switch (reason) {
    case "too-short":
      return "At least 3 characters.";
    case "too-long":
      return "At most 20 characters.";
    case "reserved":
      return "That handle is reserved.";
    case "taken":
      return "That handle is taken.";
    case "unchanged":
      return "That's already your handle.";
    default:
      return "Letters, numbers, hyphens only.";
  }
}

export function HandleModal({
  open,
  onClose,
  currentLabel,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  currentLabel: string | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [check, setCheck] = useState<CheckState>("idle");
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setCheck("idle");
      setReason(null);
    }
  }, [open]);

  useEffect(() => {
    const v = validateAudricLabel(value);
    if (!v.valid) {
      if (value.length > 0) {
        setCheck("unavailable");
        setReason(v.reason);
      } else {
        setCheck("idle");
        setReason(null);
      }
      return;
    }
    if (isReserved(v.label)) {
      setCheck("unavailable");
      setReason("reserved");
      return;
    }
    if (v.label === currentLabel) {
      setCheck("unavailable");
      setReason("unchanged");
      return;
    }
    setCheck("checking");
    setReason(null);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `${BASE}/api/identity/check?label=${encodeURIComponent(v.label)}`,
          { signal: ctrl.signal }
        );
        const j = await res.json();
        if (j.available) {
          setCheck("available");
          setReason(null);
        } else {
          setCheck("unavailable");
          setReason(j.reason ?? "taken");
        }
      } catch {
        // aborted / superseded by next keystroke
      }
    }, 350);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [value, currentLabel]);

  async function submit() {
    const v = validateAudricLabel(value);
    if (!(v.valid && check === "available")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/identity/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: v.label }),
      });
      const j = await res.json();
      if (!(res.ok && j.success)) {
        toast.error(j.error ?? "Couldn't set your handle.");
        return;
      }
      toast.success(`You're now ${j.handle}`);
      onChanged();
      onClose();
    } catch {
      toast.error("Couldn't set your handle.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={(o) => !o && onClose()} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {currentLabel ? "Change handle" : "Claim your handle"}
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <input
            autoFocus
            className="w-full rounded-lg border border-border bg-transparent py-2.5 pr-20 pl-3 font-mono text-sm outline-none focus:border-foreground/40"
            maxLength={20}
            onChange={(e) =>
              setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
            }
            placeholder="yourhandle"
            value={value}
          />
          <span className="-translate-y-1/2 absolute top-1/2 right-3 font-mono text-muted-foreground text-sm">
            @audric
          </span>
        </div>

        <div className="flex min-h-5 items-center gap-1.5 text-xs">
          {check === "checking" && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="animate-spin">
                <LoaderIcon className="size-3" />
              </span>
              Checking…
            </span>
          )}
          {check === "available" && (
            <span className="flex items-center gap-1.5 text-emerald-500">
              <CheckIcon className="size-3.5" />
              {value}@audric is available
            </span>
          )}
          {check === "unavailable" && reason && (
            <span className="text-amber-500">{reasonText(reason)}</span>
          )}
          {check === "idle" && (
            <span className="text-muted-foreground/60">
              3–20 characters · letters, numbers, hyphens
            </span>
          )}
        </div>

        {currentLabel && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-600 text-xs dark:text-amber-400">
            Heads up: <strong>{currentLabel}@audric</strong> is released and
            someone else can claim it. Update anyone who pays you.
          </p>
        )}

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            disabled={busy || check !== "available"}
            onClick={submit}
            type="button"
          >
            {busy
              ? "Setting…"
              : currentLabel
                ? `Change to ${value || "…"}@audric`
                : "Claim handle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
