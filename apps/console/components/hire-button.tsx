"use client";

import Link from "next/link";
import { useState } from "react";
import { hireOffering } from "@/lib/hire";

// The Hire button (t2 ACP Phase 1) — the browser buy path for an offering.
// Requirements form → Passport signs the sponsored escrow-create → the job
// funds on-chain at the LISTING's price/terms (server-resolved; nothing here
// is trusted). Success hands the buyer the Job id + watch instructions.

type HireOffering = {
  agent: string;
  slug: string;
  name: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  requirements: unknown;
};

const SUISCAN = "https://suiscan.xyz/mainnet";
const SIGN_IN_RE = /sign in/i;

/** Field keys for an object-shaped requirements spec. Sellers write either a
 *  plain "key: description" object or a JSON-schema-ish { properties: {…} }. */
function requirementKeys(req: unknown): [string, string][] {
  if (req == null || typeof req !== "object" || Array.isArray(req)) {
    return [];
  }
  const obj = req as Record<string, unknown>;
  const source =
    obj.properties &&
    typeof obj.properties === "object" &&
    !Array.isArray(obj.properties)
      ? (obj.properties as Record<string, unknown>)
      : obj;
  return Object.entries(source).map(([k, v]) => [
    k,
    typeof v === "string" ? v : JSON.stringify(v),
  ]);
}

function formatSla(minutes: number): string {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}

export function HireButton({ offering }: { offering: HireOffering }) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [freeText, setFreeText] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "done" | "error">(
    "idle"
  );
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ digest?: string; jobId?: string }>({});

  const keys = requirementKeys(offering.requirements);
  const wantsText =
    typeof offering.requirements === "string" ||
    (offering.requirements != null && keys.length === 0);

  async function hire() {
    setStatus("signing");
    setError("");
    try {
      let requirements: unknown = null;
      if (keys.length > 0) {
        requirements = Object.fromEntries(
          keys.map(([k]) => [k, fields[k] ?? ""])
        );
      } else if (offering.requirements != null) {
        requirements = freeText.trim();
      }
      const res = await hireOffering({
        agent: offering.agent,
        slug: offering.slug,
        requirements,
      });
      setResult(res);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="ag-card grid gap-2.5 p-5">
        <div className="font-semibold text-[14px] text-foreground">
          Job funded — ${offering.priceUsdc.toFixed(2)} USDC escrowed ✓
        </div>
        <p className="m-0 text-[12.5px] text-fg-muted leading-relaxed">
          The money sits in an on-chain Job object, not with the seller and not
          with us. The seller delivers within {formatSla(offering.slaMinutes)},
          then you have {formatSla(offering.reviewWindowMinutes)} to accept or
          reject. No delivery by the deadline — you reclaim everything.
        </p>
        {result.jobId && (
          <code className="block overflow-x-auto whitespace-nowrap rounded-md border border-border/60 px-3 py-2 font-mono text-[11.5px] text-foreground">
            t2 job watch {result.jobId}
          </code>
        )}
        <p className="m-0 text-[11.5px] text-fg-subtle">
          Track it (and accept the delivery) in your{" "}
          <Link className="underline underline-offset-4" href="/manage/jobs">
            Job inbox
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-3 font-mono text-[11.5px]">
          {result.jobId && (
            <a
              className="text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
              href={`${SUISCAN}/object/${result.jobId}`}
              rel="noreferrer"
              target="_blank"
            >
              Job object ↗
            </a>
          )}
          {result.digest && (
            <a
              className="text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
              href={`${SUISCAN}/tx/${result.digest}`}
              rel="noreferrer"
              target="_blank"
            >
              Funding tx ↗
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="ag-btn ag-btn--primary"
        onClick={() => setOpen(true)}
        type="button"
      >
        Hire — ${offering.priceUsdc.toFixed(2)} USDC
      </button>
    );
  }

  return (
    <div className="ag-card grid gap-3.5 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-semibold text-[14px] text-foreground">
          Hire: {offering.name}
        </div>
        <span className="ag-tabular font-mono text-[13px] text-foreground">
          ${offering.priceUsdc.toFixed(2)} USDC
        </span>
      </div>

      {keys.length > 0 && (
        <div className="grid gap-3">
          {keys.map(([key, hint]) => (
            <label className="grid gap-[6px]" key={key}>
              <span className="font-medium text-[12.5px] text-foreground">
                {key}
                <span className="ml-2 font-normal text-[11.5px] text-fg-subtle">
                  {hint}
                </span>
              </span>
              <input
                className="ag-input"
                onChange={(e) =>
                  setFields((f) => ({ ...f, [key]: e.target.value }))
                }
                value={fields[key] ?? ""}
              />
            </label>
          ))}
        </div>
      )}
      {wantsText && (
        <label className="grid gap-[6px]">
          <span className="font-medium text-[12.5px] text-foreground">
            What the seller needs
            {typeof offering.requirements === "string" && (
              <span className="ml-2 font-normal text-[11.5px] text-fg-subtle">
                {offering.requirements}
              </span>
            )}
          </span>
          <textarea
            className="ag-input min-h-20 resize-y"
            onChange={(e) => setFreeText(e.target.value)}
            rows={3}
            style={{ fontFamily: "var(--font-sans)" }}
            value={freeText}
          />
        </label>
      )}

      <p className="m-0 text-[11.5px] text-fg-subtle leading-relaxed">
        Your USDC escrows on-chain and releases when you accept delivery (or the{" "}
        {formatSla(offering.reviewWindowMinutes)} review window lapses). No
        delivery by the deadline — you get it all back. No gas fees.
      </p>

      <div className="flex items-center gap-3">
        <button
          className="ag-btn ag-btn--primary disabled:opacity-50"
          disabled={status === "signing"}
          onClick={hire}
          type="button"
        >
          {status === "signing"
            ? "Confirm in your Passport…"
            : `Escrow $${offering.priceUsdc.toFixed(2)} USDC`}
        </button>
        <button
          className="ag-btn ag-btn--ghost"
          onClick={() => setOpen(false)}
          type="button"
        >
          Cancel
        </button>
      </div>
      {status === "error" && (
        <p className="m-0 text-[12.5px] text-destructive">
          {error}{" "}
          {SIGN_IN_RE.test(error) && (
            <Link className="underline underline-offset-4" href="/manage">
              Sign in →
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
