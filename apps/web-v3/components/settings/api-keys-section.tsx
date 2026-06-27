"use client";

/**
 * Settings → API keys (SPEC_AUDRIC_API v1). Pro/Max subscribers mint `sk-…`
 * keys for the Private Inference API (api.t2000.ai). The secret is shown ONCE
 * on creation (we only ever store its hash). Free users see an upgrade prompt.
 */

import { CopyIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fetcher } from "@/lib/utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const API_BASE_URL = "https://api.t2000.ai/v1";

type ApiKeyRow = {
  id: string;
  name: string | null;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export function ApiKeysSection() {
  const router = useRouter();
  const { data, mutate } = useSWR<{ paid: boolean; keys: ApiKeyRow[] }>(
    `${BASE}/api/keys`,
    fetcher,
    { revalidateOnFocus: false }
  );
  const [creating, setCreating] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  // The just-created plaintext secret — held only in memory, shown once.
  const [newSecret, setNewSecret] = useState<string | null>(null);

  async function createKey() {
    setCreating(true);
    try {
      const res = await fetch(`${BASE}/api/keys`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j?.error ?? "failed");
      }
      setNewSecret(j.key);
      mutate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create key.");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      const res = await fetch(`${BASE}/api/keys?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("failed");
      }
      toast.success("Key revoked.");
      mutate();
    } catch {
      toast.error("Couldn't revoke key.");
    } finally {
      setRevokeId(null);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  // Free users: upgrade prompt, no generator.
  if (data && !data.paid) {
    return (
      <Section>
        <p className="text-muted-foreground text-xs">
          Call every model behind <strong>one key</strong>, private by default,
          pay-as-you-go from your credit — OpenAI-compatible. Available on the{" "}
          <strong>Pro</strong> and <strong>Max</strong> plans.
        </p>
        <Button
          className="mt-3"
          onClick={() => router.push(`${BASE}/settings/billing`)}
          size="sm"
          type="button"
        >
          Upgrade to get a key
        </Button>
      </Section>
    );
  }

  const keys = data?.keys ?? [];

  return (
    <Section>
      <p className="text-muted-foreground text-xs">
        OpenAI-compatible — point any SDK at{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
          {API_BASE_URL}
        </code>{" "}
        with your key. Calls are private (zero data retention) and metered
        per-token from your credit balance.
      </p>

      {keys.length > 0 && (
        <ul className="mt-3 space-y-2">
          {keys.map((k) => (
            <li
              className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2"
              key={k.id}
            >
              <div className="min-w-0">
                <div className="font-mono text-foreground/80 text-xs">
                  {k.keyPrefix}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {k.name ? `${k.name} · ` : ""}
                  {k.lastUsedAt
                    ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                    : "never used"}
                </div>
              </div>
              <Button
                className="shrink-0 text-red-500 hover:text-red-500"
                onClick={() => setRevokeId(k.id)}
                size="sm"
                type="button"
                variant="outline"
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button
        className="mt-3"
        disabled={creating}
        onClick={createKey}
        size="sm"
        type="button"
      >
        {creating ? "Creating…" : "Create API key"}
      </Button>

      {/* Show-once secret */}
      <AlertDialog
        onOpenChange={(o) => {
          if (!o) {
            setNewSecret(null);
          }
        }}
        open={newSecret !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Your new API key</AlertDialogTitle>
            <AlertDialogDescription>
              Copy it now — for your security, this is the only time it's shown.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
            <code className="min-w-0 flex-1 break-all font-mono text-[11px] text-foreground/80">
              {newSecret}
            </code>
            <Button
              onClick={() => newSecret && copy(newSecret, "API key")}
              size="sm"
              type="button"
              variant="outline"
            >
              <CopyIcon className="size-3.5" />
            </Button>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNewSecret(null)}>
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke confirm */}
      <AlertDialog
        onOpenChange={(o) => {
          if (!o) {
            setRevokeId(null);
          }
        }}
        open={revokeId !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
            <AlertDialogDescription>
              Any app or agent using it will immediately stop working. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => revokeId && revoke(revokeId)}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-border/50 bg-card/40 p-5">
      <h2 className="mb-2 font-medium text-foreground text-sm">API keys</h2>
      {children}
    </div>
  );
}
