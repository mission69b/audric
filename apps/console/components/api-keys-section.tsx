"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";

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
      // transient
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
    <Section>
      {data && !data.canIssue ? (
        <p className="text-muted-foreground text-xs">
          Add credit (or a plan) to mint a key — fund your balance in Billing to
          get started. Every model is pay-as-you-go from your credit.
        </p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            OpenAI-compatible — point any SDK at{" "}
            <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-foreground text-[11px]">
              {API_BASE_URL}
            </code>
            . Private (zero data retention), metered per-token.
          </p>

          {keys.length > 0 && (
            <div className="mt-3 space-y-2">
              {keys.map((k) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2"
                  key={k.id}
                >
                  <div className="min-w-0">
                    <div className="font-mono text-foreground/80 text-xs">
                      {k.keyPrefix}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {k.lastUsedAt
                        ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                        : "never used"}
                    </div>
                  </div>
                  <Button
                    className="shrink-0 text-red-500 hover:text-red-500"
                    onClick={() => revoke(k.id)}
                    size="sm"
                    variant="outline"
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Button
            className="mt-3"
            disabled={creating}
            onClick={createKey}
            size="sm"
          >
            {creating ? "Creating…" : "Create API key"}
          </Button>

          {error ? <p className="mt-2 text-red-500 text-xs">{error}</p> : null}

          {newSecret ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-foreground text-xs">
                Copy your key now — for your security, this is the only time
                it's shown.
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/80">
                  {newSecret}
                </code>
                <Button onClick={copySecret} size="sm" variant="outline">
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
                <Button
                  onClick={() => setNewSecret(null)}
                  size="sm"
                  variant="ghost"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}
