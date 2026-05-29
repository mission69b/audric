"use client";

/**
 * `/settings/memory` content — recall-oriented disclosure of MemWal facts.
 *
 * Phase 3 LITE (Path A — see S.218 in audric-build-tracker.md). Replaces
 * the v0.7c deferral signpost card with a real list of "what your agent
 * currently knows about you," powered by `GET /api/memory/list` (which
 * approximates "list namespace" via a broad MemWal recall query).
 *
 * **What this surface lands (U-2 partial benefit):**
 *   - Disclosure: top-K most-semantically-broad facts MemWal extracted
 *     from chat history. Read-only.
 *   - Cold-start narrative: when the list is empty, the copy reinforces
 *     the D-14 "agent learns from new chats" expectation (set by the
 *     first-session banner in Phase 7).
 *   - Honest limits: copy notes the list is approximate (broad-query
 *     based) until MemWal SDK exposes namespace listing.
 *
 * **What this surface does NOT land (Phase 3.5 backlog):**
 *   - Per-record "forget this" — MemWal SDK 0.0.4 has no per-record
 *     delete primitive. Users can clear via chat today ("Hey Audric,
 *     forget what you know about X") — surfaced as a hint in the empty
 *     state copy.
 *   - Per-record "explain why → source chat turn" — requires host-side
 *     provenance correlation table (deferred).
 *   - Recall-frequency ranking — requires host-side counter (deferred).
 *
 * Three states, exhaustive:
 *   - `loading` — initial fetch in flight
 *   - `ok` — request completed; `records` may be empty (cold start) or populated
 *   - `memwal-unconfigured` — server-side memwal client is null (dev only)
 *   - `error` — recall threw on the server; show actionable message
 */

import { useEffect, useState } from "react";
import { useZkLogin } from "@/components/auth/use-zklogin";

interface MemoryListRecord {
  text: string;
}

type FetchState =
  | { kind: "loading" }
  | { kind: "ok"; records: MemoryListRecord[] }
  | { kind: "memwal-unconfigured" }
  | { kind: "error"; error: string };

interface ApiResponse {
  error?: string;
  records?: MemoryListRecord[];
  status: "ok" | "memwal-unconfigured" | "error";
}

export function MemorySection() {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  // Audric is zkLogin (no cookie-based session) — every server-side
  // auth check reads identity from the `x-zklogin-jwt` HEADER. We grab
  // the JWT from the zkLogin session and forward it on the fetch.
  // Same pattern as `hooks/use-user-status.ts` L57 + every other
  // /api/* call in web-v2. Gate the fetch on JWT presence so we
  // don't issue a guaranteed-401 request while the session is still
  // hydrating from localStorage on first paint.
  const { session } = useZkLogin();
  const jwt = session?.jwt ?? null;

  useEffect(() => {
    if (!jwt) {
      return;
    }
    let cancelled = false;
    fetch("/api/memory/list", { headers: { "x-zklogin-jwt": jwt } })
      .then(async (res) => {
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          setState({
            kind: "error",
            error: `HTTP ${res.status}`,
          });
          return;
        }
        const json: ApiResponse = await res.json();
        if (cancelled) {
          return;
        }
        if (json.status === "memwal-unconfigured") {
          setState({ kind: "memwal-unconfigured" });
          return;
        }
        if (json.status === "error") {
          setState({
            kind: "error",
            error: json.error ?? "unknown error",
          });
          return;
        }
        setState({ kind: "ok", records: json.records ?? [] });
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setState({
          kind: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [jwt]);

  return (
    <div className="flex flex-col gap-3.5">
      <p className="mb-1.5 text-[13px] text-muted-foreground">
        Audric remembers context from your conversations to give better answers
        over time. The facts below are extracted by MemWal — Audric&rsquo;s
        privacy-preserving memory layer.
      </p>

      {state.kind === "loading" && <LoadingCard />}
      {state.kind === "memwal-unconfigured" && <UnconfiguredCard />}
      {state.kind === "error" && <ErrorCard message={state.error} />}
      {state.kind === "ok" && state.records.length === 0 && <EmptyCard />}
      {state.kind === "ok" && state.records.length > 0 && (
        <RecordList records={state.records} />
      )}

      <ForgetHintCard />
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-md border border-border bg-muted p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Loading
      </p>
      <p className="mt-3 text-[13px] leading-[1.55] text-muted-foreground">
        Asking MemWal what Audric currently remembers about you&hellip;
      </p>
    </div>
  );
}

function EmptyCard() {
  return (
    <div className="rounded-md border border-border bg-muted p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Nothing remembered yet
      </p>
      <p className="mt-3 text-[13px] leading-[1.55] text-muted-foreground">
        Audric hasn&rsquo;t learned anything about you yet. Start chatting —
        your agent learns about your preferences, holdings, and strategies from
        new conversations. Over the next ~30 days the list will fill in.
      </p>
    </div>
  );
}

function UnconfiguredCard() {
  return (
    <div className="rounded-md border border-border bg-muted p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Memory layer not configured
      </p>
      <p className="mt-3 text-[13px] leading-[1.55] text-muted-foreground">
        MemWal credentials aren&rsquo;t set on this deployment. Audric is still
        functional — it just can&rsquo;t recall facts across sessions. Contact
        your team admin if this looks wrong.
      </p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-border bg-muted p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Couldn&rsquo;t reach memory layer
      </p>
      <p className="mt-3 text-[13px] leading-[1.55] text-muted-foreground">
        We couldn&rsquo;t fetch your remembered facts just now. Chat still
        works, and Audric will resume recalling on the next session once the
        memory layer is reachable. Try again in a moment.
      </p>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        Details: {message}
      </p>
    </div>
  );
}

function RecordList({ records }: { records: MemoryListRecord[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        {records.length} {records.length === 1 ? "fact" : "facts"} remembered
      </p>
      <ul className="flex flex-col gap-2">
        {records.map((record) => (
          // MemWal SDK 0.0.4 doesn't expose a stable record id; the
          // recall query is deterministic on the same namespace so
          // record text is stable across re-mounts in practice.
          // Phase 3.5 swaps this for the real id once MemWal exposes
          // it (or once a host-side provenance table ships).
          <li
            className="rounded-md border border-border bg-muted px-4 py-3"
            key={record.text}
          >
            <p className="text-[13px] leading-[1.55] text-foreground">
              {record.text}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
        The list above is approximate — pulled by similarity to a broad query.
        Some facts may not appear here but still inform chat. Per-fact controls
        (delete, source link) ship in a future release.
      </p>
    </div>
  );
}

function ForgetHintCard() {
  return (
    <div className="rounded-md border border-border bg-muted p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
        Want Audric to forget something?
      </p>
      <p className="mt-3 text-[13px] leading-[1.55] text-muted-foreground">
        Tell Audric in chat:{" "}
        <span className="font-mono text-foreground">
          &ldquo;forget what you know about &lt;topic&gt;&rdquo;
        </span>
        . Per-fact delete from this page ships in a future update.
      </p>
    </div>
  );
}
