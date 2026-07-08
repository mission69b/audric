"use client";

import {
  isSessionExpired,
  loadSession,
  toZkLoginSigner,
} from "@audric/auth/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { payWithMpp } from "@t2000/sdk/browser";
import { useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";

// Post-a-task with Passport (S.626 — founder: "why can't a user post from
// the platform using zkLogin?"). One zkLogin-signed x402 payment funds the
// full escrow; the auto-moderation screen verdicts in the same response.
// The manageKey is shown ONCE — copy-or-lose, stated loudly.
const BOARD_URL = "https://mpp.t2000.ai/tasks/board";
// Right after a spend/refund the fullnode's coin index can briefly reference
// a just-consumed coin object — retrying picks fresh coins.
const STALE_COIN_RE = /object .*not found|notexists|deleted/i;
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

export function PostTaskForm({ onDone }: { onDone?: () => void }) {
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
  // [S.630→S.655] Notifications are always on when the session's Google
  // id_token carries a verified email (decoded client-side, no round-trip;
  // the email rides the post body, nothing stored). Every email has a
  // one-click stop — no checkbox needed.
  const [notifyEmail, setNotifyEmail] = useState("");

  useEffect(() => {
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      return;
    }
    try {
      const claims = JSON.parse(
        atob(
          (session.jwt.split(".")[1] ?? "")
            .replace(/-/g, "+")
            .replace(/_/g, "/")
        )
      ) as { email?: string };
      if (typeof claims.email === "string" && claims.email.includes("@")) {
        setNotifyEmail(claims.email);
      }
    } catch {
      // No readable email claim — the checkbox simply doesn't render.
    }
  }, []);

  const budget = useMemo(() => {
    const r = Number.parseFloat(rewardUsd);
    const m = Number.parseInt(maxCompletions, 10);
    return Number.isFinite(r) && Number.isFinite(m) && r > 0 && m > 0
      ? Math.round(r * m * 1e6) / 1e6
      : null;
  }, [rewardUsd, maxCompletions]);

  // Never a silently-disabled button — say exactly what's missing (S.640).
  const disableReason = useMemo(() => {
    const t = title.trim().length;
    const d = description.trim().length;
    if (t === 0 && d === 0) {
      return "Fill in the task above to post it.";
    }
    if (t < 8) {
      return `Title needs ${8 - t} more character${8 - t === 1 ? "" : "s"}.`;
    }
    if (d < 30) {
      return `Description needs ${30 - d} more characters — say exactly what the worker must deliver, and what proof.`;
    }
    if (budget === null) {
      return "Enter a valid reward and completions.";
    }
    return null;
  }, [title, description, budget]);

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
            ...(notifyEmail ? { notifyEmail } : {}),
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
      const raw = err instanceof Error ? err.message : "Posting failed.";
      setMessage(
        STALE_COIN_RE.test(raw)
          ? "Your wallet's coins just changed (a payment or refund is still settling) — wait ~15 seconds and press Post again."
          : raw
      );
    }
  }

  // Published state (design §PostTaskModal step "published") — green check,
  // one mono meta line, the copy-or-lose manageKey, two actions.
  if (manageKey) {
    return (
      <div className="px-1 py-3 text-center">
        <div
          className="mx-auto flex size-[46px] items-center justify-center rounded-full"
          style={{
            background: "var(--ag-verify-bg)",
            border: "1px solid var(--ag-verify-bd)",
            color: "var(--ag-verify)",
          }}
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="20"
            viewBox="0 0 16 16"
            width="20"
          >
            <path
              d="M3.5 8.5l3 3 6-7"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </div>
        <div className="mt-4 font-semibold text-[17px] text-foreground">
          Task published
        </div>
        <div className="mt-2 font-mono text-[12.5px] text-fg-subtle">
          escrow ${budget?.toFixed(2)} held · {message}
        </div>
        <p className="mx-auto mt-4 max-w-[400px] text-fg-muted text-xs leading-relaxed">
          Review submissions and pay workers from Manage → Posted tasks. The{" "}
          <span className="text-foreground">manageKey</span> below is the
          CLI/API credential for the same task — shown once, copy it if
          you&apos;ll manage from a terminal:
        </p>
        <div className="mx-auto mt-2 flex max-w-[400px] flex-wrap items-center justify-center gap-2">
          <code
            className="rounded border px-2 py-1 font-mono text-foreground text-xs [overflow-wrap:anywhere]"
            style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
          >
            {manageKey}
          </code>
          <CopyButton label="Copy manageKey" text={manageKey} />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <a className="ag-btn ag-btn--ghost" href="/manage/tasks">
            Track in console
          </a>
          {onDone && (
            <button
              className="ag-btn ag-btn--primary"
              onClick={onDone}
              type="button"
            >
              Done
            </button>
          )}
        </div>
      </div>
    );
  }

  // Form (design §PostTaskModal step "form") — labeled fields, ag-inputs,
  // the escrow note card, ONE primary action.
  return (
    <div className="grid gap-4">
      <label className="grid gap-1.5">
        <span className="font-medium text-[12.5px] text-foreground">Title</span>
        <input
          className="ag-input"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing"
          value={title}
        />
      </label>
      <label className="grid gap-1.5">
        <span className="font-medium text-[12.5px] text-foreground">
          What you need
        </span>
        <textarea
          className="ag-input min-h-20 resize-y"
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Exactly what the worker must deliver, and what proof you want"
          rows={3}
          style={{ fontFamily: "var(--font-sans)" }}
          value={description}
        />
      </label>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="grid gap-1.5">
          <span className="font-medium text-[12.5px] text-foreground">
            Category
          </span>
          <select
            className="ag-input"
            onChange={(e) => setCategory(e.target.value)}
            value={category}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[12.5px] text-foreground">
            Reward $
          </span>
          <input
            className="ag-input"
            onChange={(e) => setRewardUsd(e.target.value)}
            value={rewardUsd}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[12.5px] text-foreground">
            Completions
          </span>
          <input
            className="ag-input"
            onChange={(e) => setMaxCompletions(e.target.value)}
            value={maxCompletions}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="font-medium text-[12.5px] text-foreground">
            Expiry (days)
          </span>
          <input
            className="ag-input"
            onChange={(e) => setExpiryDays(e.target.value)}
            value={expiryDays}
          />
        </label>
      </div>

      {/* Escrow note (design ag-card row) — email updates fold in here,
          always on, one-click stop in every email. */}
      <div className="ag-card flex items-center gap-2.5 px-3.5 py-3 text-[12.5px] text-fg-muted">
        <span
          className="size-[7px] shrink-0 rounded-full"
          style={{ background: "var(--ag-verify)" }}
        />
        <span>
          Escrow of{" "}
          <b className="font-semibold text-foreground">
            ${budget?.toFixed(2) ?? "…"} USDC
          </b>{" "}
          is held from your Passport wallet — unspent budget auto-refunds.
          {notifyEmail && (
            <>
              {" "}
              Submission + refund emails go to{" "}
              <span className="text-foreground">{notifyEmail}</span> (one-click
              stop inside).
            </>
          )}
        </span>
      </div>

      <button
        className="ag-btn ag-btn--primary h-11 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={state === "busy" || disableReason !== null}
        onClick={post}
        type="button"
      >
        {state === "busy"
          ? "Paying escrow…"
          : `Fund $${budget?.toFixed(2) ?? "…"} escrow & publish`}
      </button>
      {(disableReason || (message && state !== "done")) && (
        <p className="m-0 text-center text-fg-subtle text-xs">
          {message && state !== "done" ? message : disableReason}
        </p>
      )}
    </div>
  );
}
