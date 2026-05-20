"use client";

/**
 * LoadingScreen — splash UI for the OAuth callback while zkLogin
 * is computing the ZK proof (~3-8s). Three steps with monospace
 * labels + bottom progress bar.
 *
 * Ported from `apps/web/components/auth/LoadingScreen.tsx` (S.204+
 * Phase 2). Visual parity with v1 is the goal — NewYork serif
 * heading, DepartureMono step labels, fg-primary progress fill.
 * The v1 file uses `<Icon name="check">`; we inline an SVG instead
 * to avoid pulling in v1's full Icon component tree.
 *
 * Status flow (driven by `useZkLogin().provingStep`):
 *   null  → "Reading callback data…"
 *   jwt   → [✓ Authenticated] [⋯ Resolving address…] [   Verifying]
 *   salt  → [✓] [✓] [⋯ Verifying identity…]
 *   proof → [✓] [✓] [✓]
 *   done  → showDone view ("You're all set")
 *
 * Error renders inline with a retry button.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { ZkLoginStep } from "@/lib/zklogin";

interface LoadingScreenProps {
  error: string | null;
  onRetry?: () => void;
  step: ZkLoginStep | null;
}

const STEPS: { key: ZkLoginStep; label: string }[] = [
  { key: "jwt", label: "Authenticated" },
  { key: "salt", label: "Resolving address" },
  { key: "proof", label: "Verifying identity" },
];

function stepIndex(step: ZkLoginStep | null): number {
  if (!step) {
    return -1;
  }
  if (step === "done") {
    return STEPS.length;
  }
  return STEPS.findIndex((s) => s.key === step);
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 24 24"
      width={size}
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ErrorIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export function LoadingScreen({ step, error, onRetry }: LoadingScreenProps) {
  const currentIdx = stepIndex(step);
  const isDone = step === "done";
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => setShowDone(true), 300);
      return () => clearTimeout(timer);
    }
  }, [isDone]);

  const progress = Math.min(((currentIdx + 1) / STEPS.length) * 100, 100);

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-page px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-error-bg text-error-solid">
            <ErrorIcon />
          </div>
          <div className="space-y-2">
            <h2 className="font-serif text-[28px] text-fg-primary leading-[1.15] tracking-[-0.01em]">
              Something went wrong
            </h2>
            <p className="text-[13px] text-fg-secondary leading-relaxed">
              {error}
            </p>
          </div>
          {onRetry && (
            <Button onClick={onRetry} size="lg">
              Try again
            </Button>
          )}
        </div>
      </main>
    );
  }

  if (showDone) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-page px-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-bg text-success-solid">
            <CheckIcon size={28} />
          </div>
          <h2 className="font-serif text-[28px] text-fg-primary leading-[1.15] tracking-[-0.01em]">
            You&apos;re all set
          </h2>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-page px-6">
      <div className="w-full max-w-sm space-y-7">
        <h2 className="text-center font-serif text-[28px] text-fg-primary leading-[1.15] tracking-[-0.01em]">
          Signing you in…
        </h2>

        <div className="space-y-3.5">
          {STEPS.map((s, i) => {
            const isComplete = currentIdx > i;
            const isActive = currentIdx === i;
            let indicator: React.ReactNode;
            if (isComplete) {
              indicator = (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-solid">
                  <CheckIcon />
                </div>
              );
            } else if (isActive) {
              indicator = (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <Spinner size="md" />
                </div>
              );
            } else {
              indicator = (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-fg-disabled" />
                </div>
              );
            }
            return (
              <div className="flex items-center gap-3" key={s.key}>
                {indicator}
                <span
                  className={[
                    "font-mono text-[11px] uppercase tracking-[0.08em]",
                    isComplete || isActive
                      ? "text-fg-primary"
                      : "text-fg-muted",
                  ].join(" ")}
                >
                  {s.label}
                  {isActive ? "…" : ""}
                </span>
              </div>
            );
          })}
        </div>

        <div className="h-1 w-full overflow-hidden rounded-pill bg-border-subtle">
          <div
            className="h-full rounded-pill bg-fg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </main>
  );
}
