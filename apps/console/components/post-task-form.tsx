"use client";

import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { payWithMpp } from "@t2000/sdk/browser";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";

// Post-a-task with Passport (S.626 — founder: "why can't a user post from
// the platform using zkLogin?"). One zkLogin-signed x402 payment funds the
// full escrow; the auto-moderation screen verdicts in the same response.
// The manageKey is shown ONCE — copy-or-lose, stated loudly.
const BOARD_URL = "https://mpp.t2000.ai/tasks/board";
const CATEGORIES = [
  "research",
  "data",
  "marketing",
  "dev",
  "creative",
  "other",
];
const MAX_BUDGET_USD = 500;

function grpcClient(): SuiGrpcClient {
  const network =
    env.NEXT_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";
  return new SuiGrpcClient({ baseUrl, network });
}

export function PostTaskForm() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("research");
  const [rewardUsd, setRewardUsd] = useState("0.25");
  const [maxCompletions, setMaxCompletions] = useState("3");
  const [expiryDays, setExpiryDays] = useState("7");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");
  const [manageKey, setManageKey] = useState("");

  const budget = useMemo(() => {
    const r = Number.parseFloat(rewardUsd);
    const m = Number.parseInt(maxCompletions, 10);
    return Number.isFinite(r) && Number.isFinite(m) && r > 0 && m > 0
      ? Math.round(r * m * 1e6) / 1e6
      : null;
  }, [rewardUsd, maxCompletions]);

  async function post() {
    setState("busy");
    setMessage("");
    setManageKey("");
    try {
      const session = loadSession();
      if (!session || isSessionExpired(session)) {
        throw new Error(
          "Sign in first (Manage → sign in with Google) — posting pays from your Passport wallet USDC."
        );
      }
      if (budget === null || budget > MAX_BUDGET_USD) {
        throw new Error(`Budget must be $0.01–$${MAX_BUDGET_USD}.`);
      }
      const result = await payWithMpp({
        signer: toZkLoginSigner(session),
        client: grpcClient(),
        options: {
          url: BOARD_URL,
          method: "POST",
          maxPrice: budget,
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            category,
            rewardUsd: Number.parseFloat(rewardUsd),
            maxCompletions: Number.parseInt(maxCompletions, 10),
            expiryDays: Number.parseInt(expiryDays, 10),
          }),
        },
      });
      const body = result.body as
        | {
            ok?: boolean;
            error?: string;
            refunded?: boolean;
            manageKey?: string;
            moderation?: string;
          }
        | undefined;
      if (body?.ok && body.manageKey) {
        setState("done");
        setManageKey(body.manageKey);
        setMessage(body.moderation ?? "Task posted.");
      } else {
        setState("error");
        setMessage(
          `${body?.error ?? "Posting failed."}${body?.refunded ? " (Your budget was refunded.)" : ""}`
        );
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Posting failed.");
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 font-mono text-foreground text-xs outline-none placeholder:text-muted-foreground/40 focus:border-border";

  if (manageKey) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="font-medium text-emerald-500 text-sm">{message}</div>
        <p className="mt-2 text-muted-foreground text-xs">
          This is your{" "}
          <span className="font-medium text-foreground">manageKey</span> — it
          approves submissions and closes the task, and it is shown ONLY once.
          Copy it somewhere safe now.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="rounded bg-background/60 px-2 py-1 font-mono text-foreground text-xs [overflow-wrap:anywhere]">
            {manageKey}
          </code>
          <CopyButton label="Copy manageKey" text={manageKey} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <input
        className={inputCls}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title — what needs doing (8+ chars)"
        value={title}
      />
      <textarea
        className={`${inputCls} min-h-20 resize-y`}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description — exactly what the worker must deliver, and what proof you want (30+ chars)"
        value={description}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          className={inputCls}
          onChange={(e) => setCategory(e.target.value)}
          value={category}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className={inputCls}
          onChange={(e) => setRewardUsd(e.target.value)}
          placeholder="Reward $ / completion"
          value={rewardUsd}
        />
        <input
          className={inputCls}
          onChange={(e) => setMaxCompletions(e.target.value)}
          placeholder="Completions"
          value={maxCompletions}
        />
        <input
          className={inputCls}
          onChange={(e) => setExpiryDays(e.target.value)}
          placeholder="Expiry (days)"
          value={expiryDays}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-full bg-primary px-4 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={
            state === "busy" ||
            title.trim().length < 8 ||
            description.trim().length < 30 ||
            budget === null
          }
          onClick={post}
          type="button"
        >
          {state === "busy"
            ? "Paying escrow…"
            : `Post — fund $${budget?.toFixed(2) ?? "…"} escrow`}
        </button>
        <span className="text-muted-foreground/60 text-xs">
          Pays from your Passport wallet USDC. Unspent budget auto-refunds.
        </span>
        {message && state !== "done" && (
          <span className="text-muted-foreground text-xs">{message}</span>
        )}
      </div>
    </div>
  );
}
