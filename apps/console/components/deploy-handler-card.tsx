"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  type ServeHandlerStatus,
  serveDeploy,
  serveSecrets,
  serveUndeploy,
} from "@/lib/serve-actions";

// The console Deploy surface (R1, S.696): paste handler code (or start from
// a template), set the SKU fields, Deploy — the browser equivalent of
// `t2 agent serve deploy`, for the self-agent AND owned agents. Code is
// write-only (redeploy replaces it); the secrets vault is managed inline.

// Mirrors the CLI templates (packages/cli … serve.ts) — keep in sync.
const STARTER = `// input — the buyer's request body (parsed JSON, or a raw string)
// ctx   — { agent, slug, buyer, secrets }
export default async function handle(input, ctx) {
  // const res = await fetch('https://api.example.com/data');
  // return await res.json();
  return { echo: input, from: ctx.slug };
}
`;

const PROXY = `// Resell an API you hold a key for. Your key lives in the vault
// (Secrets below: set UPSTREAM_KEY) — never in this code.
const UPSTREAM = 'https://api.example.com/v1/endpoint';

export default async function handle(input, ctx) {
  const res = await fetch(UPSTREAM, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(ctx.secrets?.UPSTREAM_KEY
        ? { authorization: \`Bearer \${ctx.secrets.UPSTREAM_KEY}\` }
        : {}),
    },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) throw new Error(\`Upstream error \${res.status}\`);
  return await res.json();
}
`;

type Sku = {
  slug: string;
  title: string;
  description: string;
  priceUsdc: string;
};

const inputCls = "ag-input";

export function DeployHandlerCard({
  agent,
  handlers,
  secretNames,
  skus,
}: {
  agent: string;
  handlers: ServeHandlerStatus[];
  secretNames: string[];
  skus: Sku[];
}) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0.02");
  const [code, setCode] = useState(STARTER);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [names, setNames] = useState(secretNames);
  const [secretPair, setSecretPair] = useState("");
  const [secretBusy, setSecretBusy] = useState(false);

  const loadSku = (s: string) => {
    setSlug(s);
    const sku = skus.find((x) => x.slug === s);
    if (sku) {
      setTitle(sku.title);
      setDescription(sku.description);
      setPrice(sku.priceUsdc);
    }
    setMsg({
      ok: true,
      text: "Code is write-only — paste it again (or a new version) to redeploy.",
    });
  };

  const deploy = async () => {
    setBusy(true);
    setMsg(null);
    const res = await serveDeploy({
      agent,
      slug,
      code,
      title,
      description,
      price,
    });
    setMsg({ ok: res.ok, text: res.message });
    setBusy(false);
    if (res.ok) {
      router.refresh();
    }
  };

  const undeploy = async (s: string) => {
    const res = await serveUndeploy({ agent, slug: s });
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) {
      router.refresh();
    }
  };

  const saveSecret = async (updates: Record<string, string>) => {
    setSecretBusy(true);
    const res = await serveSecrets({ agent, op: "set", updates });
    if (res.ok) {
      setNames(res.names);
      setSecretPair("");
    } else {
      setMsg({ ok: false, text: res.message ?? "Vault update failed." });
    }
    setSecretBusy(false);
  };

  return (
    <div className="ag-card p-5">
      <div className="ag-eyebrow">{"// DEPLOY — HOSTED CODE"}</div>
      <p className="mt-2 mb-0 text-[13px] text-fg-muted">
        Write a handler, deploy it on t2000 compute — no server. It runs only
        for paid, escrowed buys; failures auto-refund the buyer; earnings settle
        to the agent's wallet.
      </p>

      {handlers.length > 0 && (
        <div className="mt-4 divide-y divide-border/50 rounded-xl border border-border/60">
          {handlers.map((h) => (
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              key={h.slug}
            >
              <button
                className="font-medium font-mono text-foreground text-sm hover:underline"
                onClick={() => loadSku(h.slug)}
                type="button"
              >
                /{h.slug}
              </button>
              {h.active ? (
                <span className="ag-verified px-2 py-0.5 text-[11px]">
                  <span className="ag-dot" style={{ width: 4, height: 4 }} />{" "}
                  live
                </span>
              ) : (
                <span className="text-[11px] text-fg-subtle">undeployed</span>
              )}
              <span className="ag-tabular text-[11.5px] text-fg-subtle">
                {h.invocations} call{h.invocations === 1 ? "" : "s"}
                {h.lastInvocation &&
                  ` · last ${h.lastInvocation.status} · ${h.lastInvocation.durationMs}ms`}
              </span>
              <div className="ml-auto">
                {h.active && (
                  <button
                    className="ag-btn ag-btn--ghost ag-btn--sm text-fg-subtle"
                    onClick={() => undeploy(h.slug)}
                    type="button"
                  >
                    Undeploy
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid flex-1 gap-[7px]">
            <span className="font-medium text-[12.5px] text-foreground">
              Slug (in the buy URL)
            </span>
            <input
              className={`${inputCls} font-mono`}
              onChange={(e) =>
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))
              }
              placeholder="whale-alerts"
              value={slug}
            />
          </div>
          <div className="grid w-28 gap-[7px]">
            <span className="font-medium text-[12.5px] text-foreground">
              Price (USDC)
            </span>
            <input
              className={`${inputCls} font-mono`}
              inputMode="decimal"
              onChange={(e) => setPrice(e.target.value)}
              value={price}
            />
          </div>
        </div>
        <div className="grid gap-[7px]">
          <span className="font-medium text-[12.5px] text-foreground">
            Title
          </span>
          <input
            className={inputCls}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Whale alerts — large inflows, one call"
            value={title}
          />
        </div>
        <div className="grid gap-[7px]">
          <span className="font-medium text-[12.5px] text-foreground">
            Description (what the buyer gets · Provide: inputs)
          </span>
          <textarea
            className={`${inputCls} min-h-14 resize-y`}
            maxLength={480}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Returns… Provide: 1. token 2. min amount."
            value={description}
          />
        </div>
        <div className="grid gap-[7px]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-[12.5px] text-foreground">
              Handler code —{" "}
              <code className="font-mono text-[11px]">handle(input, ctx)</code>
            </span>
            <span className="flex gap-2">
              <button
                className="text-[11.5px] text-fg-subtle underline underline-offset-2 hover:text-foreground"
                onClick={() => setCode(STARTER)}
                type="button"
              >
                Starter
              </button>
              <button
                className="text-[11.5px] text-fg-subtle underline underline-offset-2 hover:text-foreground"
                onClick={() => setCode(PROXY)}
                type="button"
              >
                Proxy an API
              </button>
            </span>
          </div>
          <textarea
            className={`${inputCls} min-h-52 resize-y font-mono text-[12px] leading-relaxed`}
            onChange={(e) => setCode(e.target.value)}
            spellCheck={false}
            value={code}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="ag-btn ag-btn--sm"
            disabled={busy || !slug || !title.trim() || !description.trim()}
            onClick={deploy}
            type="button"
          >
            {busy ? "Deploying…" : "Deploy + list"}
          </button>
          {msg && (
            <span
              className={`text-[12.5px] ${msg.ok ? "text-fg-muted" : "text-destructive"}`}
            >
              {msg.text}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 border-border/60 border-t pt-4">
        <div className="font-medium text-[12.5px] text-foreground">
          Secrets vault
        </div>
        <p className="mt-1 mb-0 text-[12px] text-fg-subtle">
          Encrypted at t2000, injected as{" "}
          <code className="font-mono">ctx.secrets</code> on paid deliveries
          only. Values are write-only.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {names.map((n) => (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-2 py-1 font-mono text-[11.5px] text-fg-muted"
              key={n}
            >
              {n}
              <button
                aria-label={`Delete secret ${n}`}
                className="text-fg-subtle hover:text-destructive"
                disabled={secretBusy}
                onClick={() => saveSecret({ [n]: "" })}
                type="button"
              >
                ×
              </button>
            </span>
          ))}
          {names.length === 0 && (
            <span className="text-[12px] text-fg-subtle">Vault is empty.</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} max-w-[320px] font-mono`}
            onChange={(e) => setSecretPair(e.target.value)}
            placeholder="UPSTREAM_KEY=sk-…"
            value={secretPair}
          />
          <button
            className="ag-btn ag-btn--ghost ag-btn--sm"
            disabled={secretBusy || !secretPair.includes("=")}
            onClick={() => {
              const eq = secretPair.indexOf("=");
              saveSecret({
                [secretPair.slice(0, eq).trim()]: secretPair.slice(eq + 1),
              });
            }}
            type="button"
          >
            {secretBusy ? "Saving…" : "Set secret"}
          </button>
        </div>
      </div>
    </div>
  );
}
