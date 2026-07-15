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

type KeysResponse = { keys: ApiKeyRow[] };

const API_BASE_URL = "https://api.t2000.ai/v1";

export function ApiKeysSection() {
  const [data, setData] = useState<KeysResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
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
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j?.error ?? "Couldn't create key.");
      }
      setNewSecret(j.key);
      setNewName("");
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
      <p className="text-muted-foreground text-xs">
        OpenAI-compatible — point any SDK at{" "}
        <code className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-foreground text-[11px]">
          {API_BASE_URL}
        </code>
        . Private (zero data retention). Free daily allowance on
        kimi-k2.7-code; paid models draw from credit.
      </p>

      {keys.length > 0 && (
        <div className="mt-3 space-y-2">
          {keys.map((k) => (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border border-border/40 px-3 py-2"
              key={k.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {k.name ? (
                    <span className="truncate font-medium text-foreground text-xs">
                      {k.name}
                    </span>
                  ) : null}
                  <span className="font-mono text-foreground/80 text-xs">
                    {k.keyPrefix}
                  </span>
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

      <div className="mt-3 flex items-center gap-2">
        <input
          className="h-8 w-44 rounded-md border border-border/60 bg-transparent px-2.5 text-foreground text-xs outline-none placeholder:text-muted-foreground focus:border-border"
          maxLength={64}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !creating) {
              createKey();
            }
          }}
          placeholder="Name (e.g. cursor, zero, ci)"
          value={newName}
        />
        <Button disabled={creating} onClick={createKey} size="sm">
          {creating ? "Creating…" : "Create API key"}
        </Button>
      </div>

      {error ? <p className="mt-2 text-red-500 text-xs">{error}</p> : null}

      {newSecret ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="text-foreground text-xs">
            Copy your key now — for your security, this is the only time it's
            shown.
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
            <Button onClick={() => setNewSecret(null)} size="sm" variant="ghost">
              Done
            </Button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
