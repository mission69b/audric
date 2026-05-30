"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { LoadingScreen } from "@/components/auth/loading-screen";
import { cn } from "@/lib/utils";
import type { ZkLoginStep } from "@/lib/zklogin";

/**
 * Dev-only harness for R6.5 5c — the auth-callback holding screen
 * (`t2000-AFI/audric/phase2-auth-callback.html`). `LoadingScreen` is
 * presentational; the header selects the state (the proving steps + done
 * + error) and the theme. Gated to non-production.
 */
type HarnessState = "verifying" | "address" | "identity" | "done" | "error";

const STATE_TO_STEP: Record<HarnessState, ZkLoginStep | null> = {
  verifying: "jwt",
  address: "salt",
  identity: "proof",
  done: "done",
  error: null,
};

const STATE_LABELS: { key: HarnessState; label: string }[] = [
  { key: "verifying", label: "Verifying" },
  { key: "address", label: "Address" },
  { key: "identity", label: "Identity" },
  { key: "done", label: "Done" },
  { key: "error", label: "Error" },
];

export default function AuthCallbackHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [state, setState] = useState<HarnessState>("verifying");
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Auth callback harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-auth-callback.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {STATE_LABELS.map((s) => (
            <Toggle
              active={state === s.key}
              key={s.key}
              label={s.label}
              onClick={() => setState(s.key)}
            />
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
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

      <LoadingScreen
        error={state === "error" ? "Sign-in was cancelled." : null}
        onBack={() => undefined}
        onRetry={() => undefined}
        step={STATE_TO_STEP[state]}
      />
    </div>
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
