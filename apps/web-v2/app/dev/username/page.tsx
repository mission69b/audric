"use client";

import { notFound } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";
import { UsernameChangeModal } from "@/components/settings/username-change-modal";
import { UsernameClaimSuccess } from "@/components/settings/username-claim-success";
import {
  type UsernameCheckResult,
  UsernamePicker,
} from "@/components/settings/username-picker";
import { cn } from "@/lib/utils";

/**
 * Dev-only harness for R6.5 5d — the username picker / claim flow
 * (`t2000-AFI/audric/phase2-username-states.html`, AU6–AU12) and the
 * onboarding handle-pick (`phase2-onboarding.html` state 04).
 *
 * Each surface takes mock fetchers so the states are exercisable without a
 * live identity backend:
 *   - Picker — type `funkii` (available), `alice` (taken → suggestion pills),
 *     `ab` (too short), `!!` (invalid). Suggestions seed from `googleName`.
 *   - Success — the AU11 calm confirmation.
 *   - Change — the AU12 modal (mock available/taken via `newhandle` vs `taken`).
 *
 * Gated to non-production.
 */

const TAKEN = new Set(["alice", "sam", "admin", "taken"]);
const MOCK_LATENCY_MS = 280;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mockCheck(label: string): Promise<UsernameCheckResult> {
  await delay(MOCK_LATENCY_MS);
  if (TAKEN.has(label)) {
    return { available: false, reason: "taken" };
  }
  return { available: true };
}

type Surface = "picker" | "onboarding" | "success" | "change";

const SURFACES: { key: Surface; label: string }[] = [
  { key: "picker", label: "Picker" },
  { key: "onboarding", label: "Onboarding" },
  { key: "success", label: "Success" },
  { key: "change", label: "Change" },
];

export default function UsernameHarnessPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <Harness />;
}

function Harness() {
  const { resolvedTheme, setTheme } = useTheme();
  const [surface, setSurface] = useState<Surface>("picker");
  const isDark = resolvedTheme === "dark";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-border border-b bg-background px-8 py-3">
        <h1 className="font-semibold text-sm tracking-[-0.014em]">
          Username harness
        </h1>
        <span className="font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
          {"// diff vs phase2-username-states.html"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {SURFACES.map((s) => (
            <Toggle
              active={surface === s.key}
              key={s.key}
              label={s.label}
              onClick={() => setSurface(s.key)}
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

      <main className="mx-auto flex max-w-[480px] flex-col gap-6 px-6 py-16">
        {surface === "picker" && (
          <UsernamePicker
            checkFetcher={mockCheck}
            googleEmail="sam@gmail.com"
            googleName="Sam Rabu"
            onSkip={() => undefined}
            onSubmit={() => undefined}
          />
        )}

        {surface === "onboarding" && (
          <UsernamePicker
            checkFetcher={mockCheck}
            googleEmail="sam@gmail.com"
            googleName="Sam Rabu"
            onSubmit={() => undefined}
          />
        )}

        {surface === "success" && (
          <UsernameClaimSuccess
            label="funkii"
            onContinue={() => undefined}
            walletAddress="0xe1c0000000000000000000000000000000000000000000000000000000000f177"
          />
        )}

        {surface === "change" && (
          <p className="text-center font-mono text-[11px] text-muted-foreground tracking-[0.04em]">
            Change-handle modal is open as an overlay.
          </p>
        )}
      </main>

      <UsernameChangeModal
        address="0xe1c0000000000000000000000000000000000000000000000000000000000f177"
        changeFetcher={async (newLabel) => {
          await delay(MOCK_LATENCY_MS);
          return {
            fullHandle: `${newLabel}@audric`,
            newLabel,
            oldLabel: "funkii",
            success: true,
            txDigest: "0xmock",
            walletAddress: "0xe1c0",
          };
        }}
        checkFetcher={async (label) => {
          await delay(MOCK_LATENCY_MS);
          return { available: !TAKEN.has(label) };
        }}
        currentLabel="funkii"
        jwt="mock"
        onChanged={() => undefined}
        onClose={() => setSurface("picker")}
        open={surface === "change"}
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
