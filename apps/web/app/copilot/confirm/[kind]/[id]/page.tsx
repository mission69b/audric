"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useZkLogin } from "@/components/auth/useZkLogin";
import { useCopilotEnabled } from "@/hooks/useFeatureFlags";
import { useAgent } from "@/hooks/useAgent";
import { useBalance, type BalanceData } from "@/hooks/useBalance";
import { formatCron } from "@/lib/copilot/format-cron";

type Kind = "scheduled_action" | "copilot_suggestion";

interface ScheduledActionDetail {
  kind: "scheduled_action";
  id: string;
  actionType: string;
  amount: string;
  asset: string;
  targetAsset: string | null;
  cronExpr: string;
  patternType: string | null;
  confidence: number | null;
  surfaceStatus: string;
  surfacedAt: string | null;
  expiresAt: string | null;
  failedAttempts: number;
}

interface OneShotDetail {
  kind: "copilot_suggestion";
  id: string;
  type: "compound" | "idle_action" | "income_action" | "hf_topup";
  payload: Record<string, unknown> | null;
  status: string;
  surfacedAt: string;
  expiresAt: string;
  failedAttempts: number;
  snoozedCount: number;
}

type Detail = ScheduledActionDetail | OneShotDetail;

function isPending(detail: Detail): boolean {
  if (detail.kind === "scheduled_action") return detail.surfaceStatus === "pending";
  return detail.status === "pending";
}

function fmtAmt(raw: string, decimals: number = 4): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function ConfirmPage() {
  const router = useRouter();
  const params = useParams<{ kind: string; id: string }>();
  const kind = params.kind as Kind;
  const id = params.id;

  const enabled = useCopilotEnabled();
  const { session, status } = useZkLogin();
  const address = session?.address ?? null;
  const jwt = session?.jwt ?? null;

  const agentHook = useAgent();
  const agent = agentHook.agent;
  const balance = useBalance(address);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !address || !jwt) return;
    if (kind !== "scheduled_action" && kind !== "copilot_suggestion") {
      setLoadError("Invalid suggestion link");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/copilot/suggestions/${id}?address=${address}&kind=${kind}`,
          { headers: { "x-zklogin-jwt": jwt } }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setLoadError(data.error ?? `Failed (${res.status})`);
          return;
        }
        const data = (await res.json()) as Detail;
        if (!cancelled) setDetail(data);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, kind, address, jwt, enabled]);

  const expired = useMemo(() => {
    if (!detail) return false;
    const exp = detail.kind === "scheduled_action" ? detail.expiresAt : detail.expiresAt;
    if (!exp) return false;
    return new Date(exp).getTime() < Date.now();
  }, [detail]);

  const lines = useMemo(
    () => (detail ? buildSummaryLines(detail, balance.data) : null),
    [detail, balance.data]
  );

  if (!enabled) {
    return <CenterShell title="Copilot is currently disabled" body="This feature isn't available right now." />;
  }

  if (status === "loading") {
    return <CenterShell title="Loading…" body="" />;
  }

  if (status !== "authenticated" || !address || !jwt) {
    return (
      <CenterShell
        title="Sign in to confirm"
        body="Your session expired. Sign back in to continue with this Copilot suggestion."
        action={{ label: "Sign in", onClick: () => router.push(`/?next=/copilot/confirm/${kind}/${id}`) }}
      />
    );
  }

  if (loadError) {
    return (
      <CenterShell
        title="Couldn't load this suggestion"
        body={loadError}
        action={{ label: "Back to dashboard", onClick: () => router.push("/") }}
      />
    );
  }

  if (!detail) {
    return <CenterShell title="Loading suggestion…" body="" />;
  }

  if (!isPending(detail) || expired) {
    return (
      <CenterShell
        title="This suggestion has moved on"
        body={
          expired
            ? "It expired before you got a chance to confirm. Audric will surface it again next time it makes sense."
            : "It was already actioned or dismissed elsewhere."
        }
        action={{ label: "Back to dashboard", onClick: () => router.push("/") }}
      />
    );
  }

  const onConfirm = async () => {
    if (!agent) return;
    setSubmitError(null);
    setSubmitting(true);

    let digest: string | null = null;
    let errorReason: string | null = null;

    try {
      const actions = await agent.getInstance();

      if (detail.kind === "scheduled_action") {
        const amt = Number(detail.amount);
        if (!Number.isFinite(amt) || amt <= 0) throw new Error("Invalid amount");

        if (detail.actionType === "save") {
          const r = await actions.save({ amount: amt, asset: detail.asset });
          digest = r.tx;
        } else if (detail.actionType === "swap") {
          if (!detail.targetAsset) throw new Error("Missing swap target");
          const r = await actions.swap({
            from: detail.asset,
            to: detail.targetAsset,
            amount: amt,
            slippage: 0.005,
            byAmountIn: true,
          });
          digest = r.tx;
        } else if (detail.actionType === "stake") {
          const r = await actions.stakeVSui({ amount: amt });
          digest = r.tx;
        } else if (detail.actionType === "send") {
          throw new Error("Send suggestions need a recipient — confirm from chat");
        } else {
          throw new Error(`Unsupported action: ${detail.actionType}`);
        }
      } else {
        // CopilotSuggestion one-shots
        const payload = detail.payload ?? {};
        const usdcAmount = typeof payload.amountUsd === "number" ? payload.amountUsd : null;

        if (detail.type === "compound") {
          // Claim NAVI rewards then save the resulting USDC. V1 simplification:
          // claim only — autosave-on-claim lives behind a follow-up suggestion.
          const r = await actions.claimRewards();
          digest = r.tx;
        } else if (detail.type === "idle_action" || detail.type === "income_action") {
          const action = typeof payload.action === "string" ? payload.action : "save";
          if (!usdcAmount) throw new Error("Missing amount in suggestion payload");
          if (action === "save") {
            const r = await actions.save({ amount: usdcAmount, asset: "USDC" });
            digest = r.tx;
          } else if (action === "stake") {
            const r = await actions.stakeVSui({ amount: usdcAmount });
            digest = r.tx;
          } else {
            throw new Error(`Unsupported one-shot action: ${action}`);
          }
        } else if (detail.type === "hf_topup") {
          if (!usdcAmount) throw new Error("Missing repay amount in suggestion payload");
          const r = await actions.repay({ amount: usdcAmount });
          digest = r.tx;
        } else {
          throw new Error(`Unsupported suggestion type: ${detail.type}`);
        }
      }
    } catch (err) {
      errorReason = err instanceof Error ? err.message : "Transaction failed";
      setSubmitError(errorReason);
    }

    // Always report outcome — confirmed digest OR failure with reason
    try {
      await fetch(`/api/copilot/suggestions/${detail.id}/result`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-zklogin-jwt": jwt,
        },
        body: JSON.stringify({
          address,
          kind: detail.kind,
          outcome: digest ? "confirmed" : "failed",
          digest: digest ?? undefined,
          errorReason: errorReason ?? undefined,
        }),
      });
    } catch {
      // Result reporting is best-effort — don't block the user
    }

    setSubmitting(false);

    if (digest) {
      router.push(`/?confirmed=${detail.kind}:${detail.id}&digest=${digest}`);
    }
  };

  if (!lines) return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div>
          <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-accent mb-2">
            AUDRIC NOTICED
          </p>
          <h1 className="text-2xl font-semibold leading-tight">{lines.title}</h1>
          {lines.subtitle && (
            <p className="text-sm text-muted mt-1">{lines.subtitle}</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3 space-y-2">
          {lines.rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="text-muted">{r.label}</span>
              <span className="font-mono text-foreground">{r.value}</span>
            </div>
          ))}
        </div>

        {detail.failedAttempts > 0 && !submitError && (
          <p className="text-xs text-warning">
            Previous attempt failed ({detail.failedAttempts} of 3). One more retry, then this
            suggestion will be marked failed.
          </p>
        )}

        {submitError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {submitError}
          </div>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || !agent}
            className="w-full py-3 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {submitting ? "Confirming…" : "Confirm and execute"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/")}
            disabled={submitting}
            className="w-full py-3 rounded-md border border-border text-sm text-foreground hover:bg-surface transition disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <p className="text-[11px] text-dim text-center">
          You&apos;ll sign with your zkLogin session. Audric never has custody of your funds.
        </p>
      </div>
    </div>
  );
}

function buildSummaryLines(
  detail: Detail,
  walletBalance: BalanceData | undefined
): { title: string; subtitle: string | null; rows: { label: string; value: string }[] } {
  const rows: { label: string; value: string }[] = [];

  if (detail.kind === "scheduled_action") {
    const amt = fmtAmt(detail.amount);
    if (detail.actionType === "save") {
      rows.push({ label: "Action", value: `Save ${amt} ${detail.asset} → NAVI` });
      rows.push({ label: "Cadence", value: prettyCron(detail.cronExpr) });
      const haveUsdc = walletBalance?.usdc;
      if (typeof haveUsdc === "number") {
        rows.push({ label: "Wallet USDC", value: haveUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 }) });
      }
      return {
        title: `Save ${amt} ${detail.asset}`,
        subtitle: `Audric saw this happen on a ${prettyCron(detail.cronExpr)} cadence.`,
        rows,
      };
    }
    if (detail.actionType === "swap") {
      rows.push({ label: "Action", value: `Swap ${amt} ${detail.asset} → ${detail.targetAsset}` });
      rows.push({ label: "Cadence", value: prettyCron(detail.cronExpr) });
      rows.push({ label: "Slippage", value: "0.5%" });
      return {
        title: `Swap ${amt} ${detail.asset} → ${detail.targetAsset}`,
        subtitle: "Best route via Cetus aggregator.",
        rows,
      };
    }
    if (detail.actionType === "stake") {
      rows.push({ label: "Action", value: `Stake ${amt} SUI (Volo)` });
      rows.push({ label: "Cadence", value: prettyCron(detail.cronExpr) });
      return {
        title: `Stake ${amt} SUI`,
        subtitle: "Volo liquid staking — earn while staying liquid.",
        rows,
      };
    }
    rows.push({ label: "Action", value: `${detail.actionType} ${amt} ${detail.asset}` });
    return { title: `${detail.actionType} ${amt} ${detail.asset}`, subtitle: null, rows };
  }

  // copilot_suggestion
  const payload = detail.payload ?? {};
  const usd = typeof payload.amountUsd === "number" ? payload.amountUsd : null;
  const apy = typeof payload.projectedApy === "number" ? payload.projectedApy : null;

  if (detail.type === "compound") {
    if (usd !== null) rows.push({ label: "Rewards", value: `$${usd.toFixed(2)}` });
    if (apy !== null) rows.push({ label: "Projected APY", value: `${(apy * 100).toFixed(1)}%` });
    return {
      title: usd !== null ? `Compound $${usd.toFixed(2)} into savings` : "Compound rewards",
      subtitle: "Claim NAVI rewards and route them back into savings.",
      rows,
    };
  }

  if (detail.type === "idle_action" || detail.type === "income_action") {
    const action = typeof payload.action === "string" ? payload.action : "save";
    if (usd !== null) rows.push({ label: "Amount", value: `$${usd.toFixed(2)} USDC` });
    if (apy !== null) rows.push({ label: "Projected APY", value: `${(apy * 100).toFixed(1)}%` });
    rows.push({ label: "Destination", value: action === "save" ? "NAVI savings" : "Volo (vSUI)" });
    return {
      title:
        detail.type === "idle_action"
          ? `${action === "save" ? "Save" : "Stake"} ${usd ? `$${usd.toFixed(2)}` : "idle balance"}`
          : `${action === "save" ? "Save" : "Allocate"} incoming ${usd ? `$${usd.toFixed(2)}` : "deposit"}`,
      subtitle:
        detail.type === "idle_action"
          ? "This balance has been sitting idle — put it to work."
          : "Audric noticed a recurring deposit pattern.",
      rows,
    };
  }

  if (detail.type === "hf_topup") {
    const hf = typeof payload.healthFactor === "number" ? payload.healthFactor.toFixed(2) : "low";
    if (usd !== null) rows.push({ label: "Repay", value: `$${usd.toFixed(2)} USDC` });
    rows.push({ label: "Health factor", value: hf });
    return {
      title: usd !== null ? `Repay $${usd.toFixed(2)} to lift HF` : "Repay to lift health factor",
      subtitle: "Protect your NAVI position from liquidation.",
      rows,
    };
  }

  return { title: "Audric noticed something", subtitle: null, rows };
}

// prettyCron is a thin alias to the shared formatter so the confirm screen,
// dashboard card, and digest email all render cron the same way.
const prettyCron = formatCron;

interface CenterShellProps {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

function CenterShell({ title, body, action }: CenterShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {body && <p className="text-sm text-muted">{body}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-2 px-4 py-2 rounded-md bg-foreground text-background text-sm hover:opacity-90 transition"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
