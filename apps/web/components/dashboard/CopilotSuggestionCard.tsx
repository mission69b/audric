"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CopilotSuggestion,
  CopilotSuggestionAction,
  ScheduledActionSuggestion,
  CopilotOneShotSuggestion,
} from "@/hooks/useCopilotSuggestions";
import { useCopilotSuggestionAction } from "@/hooks/useCopilotSuggestions";
import { formatCron } from "@/lib/copilot/format-cron";

interface CopilotSuggestionCardProps {
  suggestion: CopilotSuggestion;
  address: string | null;
  jwt: string | null;
}

function fmtAmount(raw: string, asset: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return `${raw} ${asset}`;
  if (n >= 1) return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${asset}`;
  return `${n.toFixed(4).replace(/0+$/, "")} ${asset}`;
}

// Cron formatter is shared with the digest email — see lib/copilot/format-cron.ts

function describeScheduledAction(s: ScheduledActionSuggestion): {
  title: string;
  detail: string;
  actionVerb: string;
} {
  const target = s.targetAsset ? ` into ${s.targetAsset}` : "";
  const cadence = formatCron(s.cronExpr);

  if (s.actionType === "save") {
    return {
      title: `Save ${fmtAmount(s.amount, s.asset)}`,
      detail: `${cadence} · earns NAVI APY`,
      actionVerb: "Save",
    };
  }

  if (s.actionType === "swap") {
    return {
      title: `Swap ${fmtAmount(s.amount, s.asset)}${target}`,
      detail: `${cadence} · best route via Cetus`,
      actionVerb: "Swap",
    };
  }

  if (s.actionType === "stake") {
    return {
      title: `Stake ${fmtAmount(s.amount, s.asset)} (Volo)`,
      detail: `${cadence} · liquid SUI staking`,
      actionVerb: "Stake",
    };
  }

  if (s.actionType === "send") {
    return {
      title: `Send ${fmtAmount(s.amount, s.asset)}`,
      detail: cadence,
      actionVerb: "Send",
    };
  }

  return {
    title: `${s.actionType} ${fmtAmount(s.amount, s.asset)}`,
    detail: cadence,
    actionVerb: "Confirm",
  };
}

function describeOneShot(s: CopilotOneShotSuggestion): {
  title: string;
  detail: string;
  actionVerb: string;
} {
  const payload = s.payload ?? {};
  const usd = typeof payload.amountUsd === "number" ? payload.amountUsd : null;
  const apy = typeof payload.projectedApy === "number" ? payload.projectedApy : null;
  const apyStr = apy !== null ? ` · projected ${(apy * 100).toFixed(1)}% APY` : "";
  const usdStr = usd !== null ? `$${usd.toFixed(2)}` : "";

  if (s.type === "compound") {
    return {
      title: `Compound ${usdStr || "rewards"} into savings`,
      detail: `NAVI rewards ready${apyStr}`,
      actionVerb: "Compound",
    };
  }

  if (s.type === "idle_action") {
    const action = typeof payload.action === "string" ? payload.action : "save";
    return {
      title: `${action === "save" ? "Save" : "Stake"} ${usdStr || "idle balance"}`,
      detail: `Idle for ${typeof payload.idleDays === "number" ? payload.idleDays : "several"} days${apyStr}`,
      actionVerb: action === "save" ? "Save" : "Stake",
    };
  }

  if (s.type === "income_action") {
    const action = typeof payload.action === "string" ? payload.action : "save";
    return {
      title: `${action === "save" ? "Save" : "Allocate"} ${usdStr || "incoming deposit"}`,
      detail: `Recurring deposit detected${apyStr}`,
      actionVerb: action === "save" ? "Save" : "Allocate",
    };
  }

  if (s.type === "hf_topup") {
    const hf = typeof payload.healthFactor === "number" ? payload.healthFactor.toFixed(2) : "low";
    return {
      title: `Repay ${usdStr || "to lift HF"}`,
      detail: `Health factor ${hf} — protect your position`,
      actionVerb: "Repay",
    };
  }

  return { title: "Audric noticed something", detail: "Open to review", actionVerb: "Review" };
}

export function CopilotSuggestionCard({
  suggestion,
  address,
  jwt,
}: CopilotSuggestionCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const mutate = useCopilotSuggestionAction(address, jwt);

  const meta =
    suggestion.kind === "scheduled_action"
      ? describeScheduledAction(suggestion)
      : describeOneShot(suggestion);

  const onConfirm = () => {
    router.push(`/copilot/confirm/${suggestion.kind}/${suggestion.id}`);
  };

  const onAct = (action: CopilotSuggestionAction) => {
    setMenuOpen(false);
    mutate.mutate({ id: suggestion.id, kind: suggestion.kind, action });
  };

  const failedHint =
    suggestion.failedAttempts > 0
      ? ` · last attempt failed (${suggestion.failedAttempts}/3)`
      : "";

  return (
    <div className="rounded-lg border border-accent/20 bg-surface px-4 py-3 space-y-2 relative">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-accent">
          AUDRIC NOTICED
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-dim hover:text-foreground transition px-1 -mx-1 text-sm leading-none"
            aria-label="More options"
          >
            ···
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-10 min-w-[180px] rounded-md border border-border bg-background shadow-lg py-1 text-xs">
              {suggestion.kind === "scheduled_action" && (
                <>
                  <button
                    type="button"
                    onClick={() => onAct("pause_pattern")}
                    className="block w-full text-left px-3 py-1.5 hover:bg-surface text-foreground"
                  >
                    Pause this pattern
                  </button>
                  <button
                    type="button"
                    onClick={() => onAct("never_again")}
                    className="block w-full text-left px-3 py-1.5 hover:bg-surface text-foreground"
                  >
                    Never suggest this again
                  </button>
                </>
              )}
              {suggestion.kind === "copilot_suggestion" && (
                <button
                  type="button"
                  onClick={() => onAct("never_again")}
                  className="block w-full text-left px-3 py-1.5 hover:bg-surface text-foreground"
                >
                  Don&apos;t suggest this type again
                </button>
              )}
              <button
                type="button"
                onClick={() => onAct("skip")}
                className="block w-full text-left px-3 py-1.5 hover:bg-surface text-foreground"
              >
                Skip
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="text-sm text-foreground font-medium">{meta.title}</p>
        <p className="text-xs text-muted mt-0.5">
          {meta.detail}
          {failedHint}
        </p>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onConfirm}
          disabled={mutate.isPending}
          className="px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {meta.actionVerb}
        </button>
        <button
          type="button"
          onClick={() => onAct("snooze")}
          disabled={mutate.isPending}
          className="px-3 py-1.5 rounded-md border border-border text-xs text-foreground hover:bg-background transition disabled:opacity-50"
        >
          Snooze 24h
        </button>
      </div>
    </div>
  );
}
