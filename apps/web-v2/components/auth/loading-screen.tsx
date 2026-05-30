"use client";

/**
 * LoadingScreen — the `/auth/callback` holding screen (R6.5 5c · AU3).
 *
 * [R6.5 5c — 2026-05-31] Rebuilt from the v1-ported 3-step progress list
 * to the calm AU3 holding screen (`t2000-AFI/audric/phase2-auth-callback.html`):
 * a large pulsing `AudricMark`, a title, and a monospace sub-line. The
 * OAuth roundtrip + zkLogin proof gen takes 1–3s — a blank redirect reads
 * as broken, so we show a branded holding frame immediately and never
 * strand the user on a bare spinner.
 *
 * The title spans both phases of the wait so it stays honest without the
 * noisy step list:
 *   null | jwt  → "Signing you in…"      · VERIFYING WITH GOOGLE
 *   salt        → "Setting up your Passport" · RESOLVING YOUR ADDRESS
 *   proof       → "Setting up your Passport" · VERIFYING IDENTITY
 *   done        → "You're all set"
 *
 * On failure → the AU3 error variant (red glyph + reassurance + Back /
 * Try again). The proof never half-creates anything, so "Nothing was
 * created" is literally true.
 */

import { AudricMark } from "@/components/ui/audric-mark";
import { Button } from "@/components/ui/button";
import type { ZkLoginStep } from "@/lib/zklogin";

interface LoadingScreenProps {
  error: string | null;
  onBack?: () => void;
  onRetry?: () => void;
  step: ZkLoginStep | null;
}

function holdingCopy(step: ZkLoginStep | null): { title: string; sub: string } {
  if (step === "salt") {
    return { title: "Setting up your Passport", sub: "Resolving your address" };
  }
  if (step === "proof") {
    return { title: "Setting up your Passport", sub: "Verifying identity" };
  }
  return { title: "Signing you in…", sub: "Verifying with Google" };
}

export function LoadingScreen({
  step,
  error,
  onRetry,
  onBack,
}: LoadingScreenProps) {
  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="flex max-w-[320px] flex-col items-center gap-5 text-center">
          <span className="flex size-11 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              viewBox="0 0 16 16"
              width="20"
            >
              <path
                d="M8 4.5V9M8 11v.5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </span>
          <div className="space-y-2">
            <p className="font-medium font-sans text-[18px] text-foreground tracking-[-0.018em]">
              Sign-in didn&apos;t complete
            </p>
            <p className="text-[13px] text-muted-foreground leading-[1.6] tracking-[-0.011em]">
              The Google sign-in was cancelled or timed out. Nothing was
              created.
            </p>
          </div>
          <div className="flex gap-2">
            {onBack && (
              <Button onClick={onBack} variant="outline">
                Back
              </Button>
            )}
            {onRetry && <Button onClick={onRetry}>Try again</Button>}
          </div>
        </div>
      </main>
    );
  }

  if (step === "done") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6">
        <div className="flex flex-col items-center gap-5 text-center">
          <AudricMark size={56} />
          <p className="font-medium font-sans text-[18px] text-foreground tracking-[-0.018em]">
            You&apos;re all set
          </p>
        </div>
      </main>
    );
  }

  const { title, sub } = holdingCopy(step);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="flex max-w-[320px] flex-col items-center gap-5 text-center">
        <AudricMark animate size={56} />
        <div className="space-y-2">
          <p className="font-medium font-sans text-[18px] text-foreground tracking-[-0.018em]">
            {title}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
            {sub}
          </p>
        </div>
      </div>
    </main>
  );
}
