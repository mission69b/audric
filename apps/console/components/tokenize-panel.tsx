"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  TOKENIZE_STEPS,
  type TokenizeResult,
  type TokenizeStep,
  tokenizeAgent,
} from "@/lib/tokenize";

// The tokenize form — used by the Create Agent form's Token step (05) and by
// the token page's un-tokenized state. Two Passport taps; the launcher's own
// SUI seeds the pool. Copy stays UTILITY-framed: fees fund the agent; a token
// is not an investment and we never suggest returns (SPEC_ACP_SUI §6 legal
// frame).

const MIN_LP_SUI_DISPLAY = 1;

export function TokenizePanel({
  agent,
  agentName,
  onDone,
}: {
  agent: string;
  agentName?: string;
  onDone?: (result: TokenizeResult) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState(agentName ?? "");
  const [description, setDescription] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [lpSui, setLpSui] = useState("5");
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [activeStep, setActiveStep] = useState<TokenizeStep>("publish");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TokenizeResult | null>(null);

  async function launch() {
    setError(null);
    // Floor, never round up — the seeded amount must be ≤ what was typed.
    const suiFloat = Number.parseFloat(lpSui);
    if (!Number.isFinite(suiFloat) || suiFloat < MIN_LP_SUI_DISPLAY) {
      setError(`Seed at least ${MIN_LP_SUI_DISPLAY} SUI of liquidity.`);
      return;
    }
    const lpSuiMist = BigInt(Math.floor(suiFloat * 1e9));
    setPhase("running");
    try {
      const res = await tokenizeAgent({
        agent,
        params: { symbol, name, description, iconUrl, lpSuiMist },
        onStep: setActiveStep,
      });
      setResult(res);
      setPhase("done");
      onDone?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tokenize failed.");
      setPhase("form");
    }
  }

  if (phase === "done" && result) {
    return (
      <div className="grid gap-2 text-[13px]">
        <div className="flex items-center gap-2 text-foreground">
          <Check className="size-4 text-emerald-500" />
          Token launched — LP locked for 10 years, pool fees route to this
          agent&apos;s wallet.
        </div>
        <a
          className="font-mono text-[12px] text-fg-subtle underline"
          href={`https://suiscan.xyz/mainnet/tx/${result.tokenizeDigest}`}
          rel="noreferrer"
          target="_blank"
        >
          {result.tokenizeDigest.slice(0, 20)}…
        </a>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <div className="grid gap-2.5">
        {TOKENIZE_STEPS.map(({ id, label }) => {
          const idx = TOKENIZE_STEPS.findIndex((s) => s.id === activeStep);
          const mine = TOKENIZE_STEPS.findIndex((s) => s.id === id);
          return (
            <div className="flex items-center gap-2.5 text-[13px]" key={id}>
              {idx > mine ? (
                <Check className="size-4 text-emerald-500" />
              ) : id === activeStep ? (
                <Loader2 className="size-4 animate-spin text-foreground" />
              ) : (
                <span className="size-4" />
              )}
              <span
                className={idx >= mine ? "text-foreground" : "text-fg-subtle"}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[12px] text-fg-subtle">
          Ticker (2–8 chars)
          <input
            className="ag-input font-mono uppercase"
            maxLength={8}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="FUNKII"
            value={symbol}
          />
        </label>
        <label className="grid gap-1 text-[12px] text-fg-subtle">
          Token name
          <input
            className="ag-input"
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            placeholder="Funkii Studio"
            value={name}
          />
        </label>
      </div>
      <label className="grid gap-1 text-[12px] text-fg-subtle">
        Description
        <input
          className="ag-input"
          maxLength={256}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this agent does"
          value={description}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[12px] text-fg-subtle">
          Icon URL (https)
          <input
            className="ag-input"
            onChange={(e) => setIconUrl(e.target.value)}
            placeholder="https://…/icon.png"
            value={iconUrl}
          />
        </label>
        <label className="grid gap-1 text-[12px] text-fg-subtle">
          SUI to seed liquidity (yours, min {MIN_LP_SUI_DISPLAY})
          <input
            className="ag-input font-mono"
            inputMode="decimal"
            onChange={(e) => setLpSui(e.target.value)}
            value={lpSui}
          />
        </label>
      </div>
      <div
        className="rounded-lg border border-dashed px-3.5 py-2.5 text-[12px] text-fg-subtle leading-relaxed"
        style={{ borderColor: "var(--ag-border)" }}
      >
        1B supply, fixed forever: 50% seeds the trading pool (LP locked 10
        years), 50% goes to the agent&apos;s wallet. Pool fees route to the
        agent&apos;s wallet only — they fund its work. One token per agent; this
        can&apos;t be undone. A token is a utility, not an investment.
      </div>
      {error && (
        <p className="m-0 text-[13px] text-red-400" role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          className="ag-btn ag-btn--primary"
          onClick={launch}
          type="button"
        >
          Launch token (2 taps)
        </button>
      </div>
    </div>
  );
}
