"use client";

import { AlertTriangle, Check, Copy, Download, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FundAgent } from "@/components/fund-agent";
import { Button } from "@/components/ui/button";
import {
  CREATE_STEPS,
  CreateAgentError,
  type CreateStep,
  clearKeyStash,
  createAgent,
  readKeyStash,
} from "@/lib/create-agent";

// The composition moment (T1/A2, SPEC_COMPOSITION_MOMENT): ONE form — name,
// description, category — and one Launch tap mints the wallet, registers the
// Agent ID, links it to the signed-in Passport, and saves the profile. The
// done screen hands over the agent's private key exactly once, then points at
// fund / sell / manage. Everything else is "set up anytime."

const CATEGORIES = [
  "ai-models",
  "data-feeds",
  "finance",
  "research",
  "dev-tools",
  "creative",
  "other",
] as const;

const inputCls =
  "w-full rounded-lg border border-border bg-input/30 px-3 py-2 text-foreground text-sm outline-none placeholder:text-fg-subtle focus:border-fg-subtle";

function short(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-6)}`;
}

function KeyHandoff({
  address,
  secretKey,
  onSaved,
}: {
  address: string;
  secretKey: string;
  onSaved: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const download = () => {
    const blob = new Blob([`${secretKey}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-${address.slice(2, 10)}.key`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 font-medium text-amber-500 text-sm">
        <AlertTriangle className="size-4" />
        Save the agent's key — shown only once
      </div>
      <p className="mt-1.5 mb-0 text-fg-muted text-xs leading-relaxed">
        This key IS the agent: it signs its services, endpoint changes, and
        spending. We don't keep a copy. Your Passport stays the owner — you can
        always edit the listing and deactivate — but on-chain changes need this
        key (via the CLI).
      </p>
      <div className="mt-3 break-all rounded-lg border border-border bg-background/60 px-3 py-2 font-mono text-foreground text-xs">
        {revealed ? secretKey : "•".repeat(40)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setRevealed((v) => !v)}
          size="sm"
          type="button"
          variant="outline"
        >
          {revealed ? "Hide" : "Reveal"}
        </Button>
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(secretKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button onClick={download} size="sm" type="button" variant="outline">
          <Download className="size-3.5" />
          Download .key
        </Button>
        <Button onClick={onSaved} size="sm" type="button">
          I saved my key
        </Button>
      </div>
      <p className="mt-3 mb-0 text-fg-subtle text-xs">
        Use it from the CLI:{" "}
        <code className="font-mono text-foreground">
          t2 init --import &lt;key&gt; --key ~/.t2000/
          {`agent-${address.slice(2, 8)}`}.key
        </code>
      </p>
    </div>
  );
}

function DoneView({
  address,
  secretKey,
  name,
}: {
  address: string;
  secretKey: string;
  name: string;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="grid gap-4">
      <div className="ag-card p-5">
        <div className="flex items-center gap-2 font-medium text-foreground text-sm">
          <Check className="size-4 text-emerald-500" />
          {name} is live
        </div>
        <p className="mt-1 mb-0 text-fg-muted text-sm">
          Registered on-chain, owned by your Passport, listed in the directory.
        </p>
        <div className="mt-2 font-mono text-fg-subtle text-xs">
          {short(address)}
        </div>
      </div>

      {saved ? null : (
        <KeyHandoff
          address={address}
          onSaved={() => {
            clearKeyStash();
            setSaved(true);
          }}
          secretKey={secretKey}
        />
      )}

      {saved && (
        <div className="ag-card p-5">
          <div className="font-medium text-foreground text-sm">
            Set up anytime
          </div>
          <ul className="mt-2 mb-0 grid list-none gap-2 p-0 text-fg-muted text-sm">
            <li>
              <span className="text-foreground">Fund it</span> — send USDC from
              your Passport below; the agent pays its own way from there.
            </li>
            <li>
              <span className="text-foreground">Sell services</span> — add
              catalog SKUs with{" "}
              <code className="font-mono text-xs">t2 agent services add</code>{" "}
              or deploy a paid endpoint with{" "}
              <code className="font-mono text-xs">t2 agent deploy</code>.
            </li>
            <li>
              <span className="text-foreground">Deploy code</span> — write a
              handler and run it on t2000 compute, no server: Manage → Deploy.
              It sells per call; failures auto-refund the buyer.
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button asChild size="sm">
              <a href={`/manage/agents/${address}`}>Manage listing</a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={`/${address}`} rel="noreferrer" target="_blank">
                View in store
              </a>
            </Button>
            <FundAgent agentAddress={address} />
          </div>
        </div>
      )}
    </div>
  );
}

export function CreateAgentForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phase, setPhase] = useState<"form" | "running" | "done">("form");
  const [step, setStep] = useState<CreateStep | null>(null);
  const [failedStep, setFailedStep] = useState<CreateStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    address: string;
    secretKey: string;
  } | null>(null);
  const [stashName, setStashName] = useState<string>("");

  // A stashed key from an interrupted earlier attempt must resurface — the
  // key is the one unrecoverable artifact of this flow.
  useEffect(() => {
    const stash = readKeyStash();
    if (stash) {
      setResult({ address: stash.address, secretKey: stash.secretKey });
      setStashName(stash.name || "Your agent");
      setPhase("done");
    }
  }, []);

  const launch = async (resumeFrom?: CreateStep) => {
    setError(null);
    setFailedStep(null);
    setPhase("running");
    try {
      const r = await createAgent({
        name: name.trim(),
        description: description.trim() || undefined,
        category: category || undefined,
        onProgress: setStep,
        resume:
          resumeFrom && result ? { ...result, from: resumeFrom } : undefined,
      });
      setResult(r);
      setPhase("done");
    } catch (e) {
      if (e instanceof CreateAgentError) {
        setFailedStep(e.step);
        // Keep whatever the flow minted so retry resumes instead of orphaning.
        const stash = readKeyStash();
        if (stash) {
          setResult({ address: stash.address, secretKey: stash.secretKey });
        }
      }
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("form");
    }
  };

  if (phase === "done" && result) {
    return (
      <DoneView
        address={result.address}
        name={name.trim() || stashName || "Your agent"}
        secretKey={result.secretKey}
      />
    );
  }

  const stepIndex = step ? CREATE_STEPS.findIndex((s) => s.id === step) : -1;

  return (
    <div className="grid max-w-[560px] gap-4">
      <div className="ag-card grid gap-4 p-5">
        <div>
          <label
            className="mb-1.5 block text-fg-muted text-xs"
            htmlFor="ca-name"
          >
            Name
          </label>
          <input
            className={inputCls}
            id="ca-name"
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Atlas Research"
            value={name}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-fg-muted text-xs"
            htmlFor="ca-desc"
          >
            Description <span className="text-fg-subtle">(optional)</span>
          </label>
          <textarea
            className={`${inputCls} min-h-[76px] resize-y`}
            id="ca-desc"
            maxLength={600}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do, for whom?"
            value={description}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-fg-muted text-xs"
            htmlFor="ca-cat"
          >
            Category <span className="text-fg-subtle">(optional)</span>
          </label>
          <select
            className={inputCls}
            id="ca-cat"
            onChange={(e) => setCategory(e.target.value)}
            value={category}
          >
            <option value="">Pick later</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="ag-card p-5">
        <div className="font-medium text-foreground text-sm">
          Included on launch
        </div>
        <p className="mt-1 mb-0 text-fg-muted text-sm">
          Its own Sui wallet (gasless USDC) · an on-chain Agent ID owned by your
          Passport · a public store listing. Services, funding, and hosted
          runtime (soon) are set up anytime.
        </p>
      </div>

      {phase === "running" && (
        <div className="ag-card grid gap-2 p-5">
          {CREATE_STEPS.map((s, i) => (
            <div className="flex items-center gap-2 text-sm" key={s.id}>
              {i < stepIndex ? (
                <Check className="size-4 text-emerald-500" />
              ) : i === stepIndex ? (
                <Loader2 className="size-4 animate-spin text-foreground" />
              ) : (
                <span className="inline-block size-4 rounded-full border border-border" />
              )}
              <span
                className={
                  i <= stepIndex ? "text-foreground" : "text-fg-subtle"
                }
              >
                {s.label}
              </span>
            </div>
          ))}
          <p className="mt-1 mb-0 text-fg-subtle text-xs">
            Sponsored — no SUI needed. Your Passport signs the ownership
            confirmation.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
          {failedStep && (
            <button
              className="ml-3 underline underline-offset-2"
              onClick={() => launch(failedStep)}
              type="button"
            >
              Retry from "{CREATE_STEPS.find((s) => s.id === failedStep)?.label}
              "
            </button>
          )}
        </div>
      )}

      {phase === "form" && (
        <div className="flex items-center gap-3">
          <Button
            disabled={name.trim().length === 0}
            onClick={() => launch()}
            type="button"
          >
            Launch agent
          </Button>
          <span className="text-fg-subtle text-xs">
            Free · gasless · non-custodial — you get the key
          </span>
        </div>
      )}
    </div>
  );
}
