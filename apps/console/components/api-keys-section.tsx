"use client";

import { useCallback, useEffect, useState } from "react";

type ApiKeyRow = {
  id: string;
  name: string | null;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type KeysResponse = { canIssue: boolean; keys: ApiKeyRow[] };

const API_BASE_URL = "https://api.t2000.ai/v1";

export function ApiKeysSection() {
  const [data, setData] = useState<KeysResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys");
      if (res.ok) {
        setData((await res.json()) as KeysResponse);
      }
    } catch {
      // transient — the card just shows a loading state
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j?.error ?? "Couldn't create key.");
      }
      setNewSecret(j.key);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create key.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      const res = await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("failed");
      }
      await load();
    } catch {
      setError("Couldn't revoke key.");
    }
  }

  function copySecret() {
    if (!newSecret) {
      return;
    }
    navigator.clipboard.writeText(newSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const keys = data?.keys ?? [];

  return (
    <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-5">
      <div className="text-[var(--dim)] text-xs uppercase tracking-wide">
        API keys
      </div>

      {data && !data.canIssue ? (
        <p className="mt-2 text-[var(--muted)] text-sm">
          Add credit (or a plan) to mint a key — fund your balance below to get
          started. Every model is pay-as-you-go from your credit.
        </p>
      ) : (
        <>
          <p className="mt-2 text-[var(--muted)] text-sm">
            OpenAI-compatible — point any SDK at{" "}
            <span className="font-mono text-[var(--foreground)] text-[13px]">
              {API_BASE_URL}
            </span>
            . Private (zero data retention), metered per-token from your credit.
          </p>

          {keys.length > 0 && (
            <ul className="mt-4 space-y-2">
              {keys.map((k) => (
                <li
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-bright)] px-3 py-2"
                  key={k.id}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[13px] text-[var(--foreground)]">
                      {k.keyPrefix}
                    </div>
                    <div className="text-[11px] text-[var(--dim)]">
                      {k.lastUsedAt
                        ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : "never used"}
                    </div>
                  </div>
                  <button
                    className="shrink-0 text-[13px] text-red-400 transition-colors hover:text-red-300"
                    onClick={() => revoke(k.id)}
                    type="button"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] px-4 font-medium text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            disabled={creating}
            onClick={createKey}
            type="button"
          >
            {creating ? "Creating…" : "Create API key"}
          </button>

          {error ? (
            <p className="mt-2 text-[13px] text-red-400">{error}</p>
          ) : null}

          {newSecret ? (
            <div className="mt-4 rounded-lg border border-[var(--accent)] bg-[var(--t2k-accent-bg)] p-3">
              <div className="text-[var(--foreground)] text-xs">
                Copy your key now — for your security, this is the only time
                it's shown.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[12px] text-[var(--foreground)]">
                  {newSecret}
                </code>
                <button
                  className="shrink-0 rounded-md border border-[var(--border-bright)] px-2 py-1 text-[12px] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
                  onClick={copySecret}
                  type="button"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  className="shrink-0 text-[12px] text-[var(--dim)] transition-colors hover:text-[var(--foreground)]"
                  onClick={() => setNewSecret(null)}
                  type="button"
                >
                  Done
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
