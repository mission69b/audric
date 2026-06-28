"use client";

import { Button, Card, CardContent } from "@t2000/ui";
import { Check, Copy } from "lucide-react";
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
    <Card>
      <CardContent className="pt-6">
        {data && !data.canIssue ? (
          <p className="text-muted-foreground text-sm">
            Add credit (or a plan) to mint a key — fund your balance in Billing
            to get started. Every model is pay-as-you-go from your credit.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              OpenAI-compatible — point any SDK at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
                {API_BASE_URL}
              </code>
              . Private (zero data retention), metered per-token.
            </p>

            {keys.length > 0 && (
              <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
                {keys.map((k) => (
                  <li
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    key={k.id}
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-foreground text-sm">
                        {k.keyPrefix}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {k.lastUsedAt
                          ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                          : "never used"}
                      </div>
                    </div>
                    <Button
                      className="text-destructive hover:text-destructive"
                      onClick={() => revoke(k.id)}
                      size="sm"
                      variant="ghost"
                    >
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <Button className="mt-4" disabled={creating} onClick={createKey}>
              {creating ? "Creating…" : "Create API key"}
            </Button>

            {error ? (
              <p className="mt-2 text-destructive text-sm">{error}</p>
            ) : null}

            {newSecret ? (
              <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
                <div className="text-foreground text-xs">
                  Copy your key now — for your security, this is the only time
                  it's shown.
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-foreground text-xs">
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
      </CardContent>
    </Card>
  );
}
