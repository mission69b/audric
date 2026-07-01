"use client";

import type { VerifyCheck, VerifyResult } from "@t2000/sdk";
import { CheckIcon, Loader2Icon, LockIcon, XIcon } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

function receiptOf(message: ChatMessage): {
  receiptId?: string;
  modelId?: string;
} {
  const part = message.parts.find((p) => p.type === "data-confidential");
  if (part && "data" in part) {
    return { receiptId: part.data.receiptId, modelId: part.data.modelId };
  }
  return {
    receiptId: message.metadata?.receiptId,
    modelId: message.metadata?.modelId,
  };
}

function CheckRow({ check }: { check: VerifyCheck }) {
  const icon =
    check.status === "pass" ? (
      <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
    ) : check.status === "fail" ? (
      <XIcon className="mt-0.5 size-3.5 shrink-0 text-red-500" />
    ) : (
      <span className="mt-0.5 size-3.5 shrink-0 text-center text-muted-foreground/40">
        •
      </span>
    );
  return (
    <div className="flex items-start gap-2">
      {icon}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium text-xs">
          {check.name}
          {check.trust === "trustless" && (
            <span className="rounded bg-emerald-500/10 px-1 py-px text-[10px] text-emerald-600 dark:text-emerald-400">
              trustless
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground/70">
          {check.detail}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-message confidential badge + Verify modal (SPEC_CONFIDENTIAL_UI §6).
 * Renders only on confidential (GPU-TEE) assistant messages. The 🔒 badge marks
 * the turn as attested + anchored; Verify runs the server-side per-check report
 * (Option A) and always CTAs the trustless `t2 verify <id>` CLI path.
 */
export function ConfidentialBadge({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { receiptId, modelId } = receiptOf(message);
  const isConfidential =
    message.metadata?.confidential === true ||
    message.parts.some((p) => p.type === "data-confidential");
  if (!isConfidential) {
    return null;
  }

  const runVerify = async () => {
    if (!receiptId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ id: receiptId });
      if (modelId) {
        params.set("model", modelId);
      }
      const res = await fetch(`/api/verify-receipt?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setResult(json as VerifyResult);
      } else {
        setError(json.error ?? "Verification failed.");
      }
    } catch {
      setError("Could not reach the verifier.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="flex items-center gap-1 text-emerald-600/80 dark:text-emerald-400/80">
        <LockIcon className="size-3" />
        Confidential · attested · anchored
      </span>
      {receiptId && (
        <Dialog
          onOpenChange={(next) => {
            setOpen(next);
            if (next && !(result || loading)) {
              runVerify();
            }
          }}
          open={open}
        >
          <DialogTrigger asChild>
            <button
              className="text-muted-foreground/50 underline-offset-2 hover:text-foreground hover:underline"
              type="button"
            >
              Verify
            </button>
          </DialogTrigger>
          <DialogContent className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-sm">
                <LockIcon className="size-4 text-emerald-500" />
                Verify confidential response
              </DialogTitle>
              <DialogDescription className="text-xs">
                Trustless checks on the signed receipt + its on-chain Sui
                anchor.
              </DialogDescription>
            </DialogHeader>

            {loading && (
              <div className="flex items-center gap-2 py-6 text-muted-foreground text-xs">
                <Loader2Icon className="size-4 animate-spin" />
                Running verification…
              </div>
            )}
            {error && <div className="text-red-500 text-xs">{error}</div>}
            {result && (
              <div className="flex flex-col gap-3">
                <div
                  className={cn(
                    "rounded-md px-3 py-2 text-xs",
                    result.verified
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  )}
                >
                  {result.verified
                    ? "✓ Verified — TEE-signed receipt + trustless Sui anchor."
                    : "✗ Not verified — see the failed check below."}
                </div>
                <div className="flex flex-col gap-2">
                  {result.checks.map((c) => (
                    <CheckRow check={c} key={c.name} />
                  ))}
                </div>
                {result.anchor?.explorer && (
                  <a
                    className="text-[11px] text-muted-foreground/70 underline underline-offset-2 hover:text-foreground"
                    href={result.anchor.explorer}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View the anchor on Suiscan ↗
                  </a>
                )}
              </div>
            )}

            <div className="rounded-md border border-border/50 bg-muted/40 p-3">
              <div className="mb-1 font-medium text-[11px]">
                Verify it yourself (fully trustless):
              </div>
              <code className="block select-all rounded bg-background px-2 py-1 text-[11px]">
                t2 verify {receiptId}
              </code>
              <div className="mt-1 text-[10px] text-muted-foreground/60">
                The CLI checks the Intel TDX quote client-side too — no trust in
                our server.
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
