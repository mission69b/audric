"use client";

/**
 * ConvoHistoryList — RECENTS section in the sidebar.
 *
 * Ported from `apps/web/components/shell/ConvoHistoryList.tsx` (S.204+
 * Phase 6.7 polish). Calls apps/web's `/api/engine/sessions` endpoint
 * via `audricWebUrl()` because the engine API stays on apps/web until
 * v0.7e (Tier C copy-port).
 *
 * Behavior (matches v1 1:1):
 *   - Fetches sessions on mount + when address/jwt change
 *   - Loading state shows 3 pulse skeletons
 *   - Each row: title || preview || "Conversation", + relative time + msg count
 *   - Active row highlighted, hover row lifts
 *   - Per-row delete button (visible on hover) calls DELETE
 *     `/api/engine/sessions/[id]`
 *   - Click loads the session via `onLoadSession(id)` — parent
 *     re-mounts useChat with prior messages (no URL change; v07d's
 *     MemWal handles persistence, no permalink URLs)
 */

import { useCallback, useEffect, useState } from "react";
import { audricWebUrl } from "@/lib/audric-web-url";

interface ConvoSession {
  createdAt?: string;
  id: string;
  messageCount: number;
  preview?: string;
  title?: string;
  updatedAt: string;
}

interface ConvoHistoryListProps {
  activeSessionId?: string;
  address: string | undefined;
  jwt: string | undefined;
  onDeleteSession?: (sessionId: string) => void;
  onLoadSession: (sessionId: string) => void;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  return `${Math.floor(days / 7)}w`;
}

function DeleteIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width={size}
    >
      <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
    </svg>
  );
}

export function ConvoHistoryList({
  jwt,
  address,
  activeSessionId,
  onLoadSession,
  onDeleteSession,
}: ConvoHistoryListProps) {
  const [sessions, setSessions] = useState<ConvoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!(jwt && address)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(audricWebUrl(`/api/engine/sessions?address=${address}`), {
      headers: { "x-zklogin-jwt": jwt },
    })
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [jwt, address]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      if (!jwt || deletingId) {
        return;
      }

      setDeletingId(sessionId);
      try {
        const res = await fetch(
          audricWebUrl(`/api/engine/sessions/${sessionId}`),
          {
            method: "DELETE",
            headers: { "x-zklogin-jwt": jwt },
          }
        );
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          if (activeSessionId === sessionId) {
            onDeleteSession?.(sessionId);
          }
        }
      } catch {
        // silently fail — session stays in list
      } finally {
        setDeletingId(null);
      }
    },
    [jwt, deletingId, activeSessionId, onDeleteSession]
  );

  if (loading) {
    return (
      <div className="space-y-1.5 px-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            className="h-9 animate-pulse rounded-sm bg-border-subtle/50"
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders
            key={i}
          />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <p className="px-2 py-1.5 font-mono text-[10px] text-fg-muted uppercase tracking-[0.08em]">
        No conversations yet
      </p>
    );
  }

  return (
    <div className="max-h-[260px] space-y-0.5 overflow-y-auto pr-1">
      {sessions.map((s) => {
        const isActive = activeSessionId === s.id;
        return (
          <div
            className={[
              "group relative w-full rounded-sm transition-colors",
              isActive ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50",
            ].join(" ")}
            key={s.id}
          >
            <button
              className="w-full rounded-sm px-2 py-1.5 pr-7 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
              onClick={() => onLoadSession(s.id)}
              type="button"
            >
              <p
                className={[
                  "truncate text-[12px]",
                  isActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground/80",
                ].join(" ")}
              >
                {s.title || s.preview || "Conversation"}
              </p>
              <p className="mt-0.5 font-mono text-[9px] text-sidebar-foreground/50 uppercase tracking-[0.08em]">
                {s.messageCount} msgs · {relativeTime(s.updatedAt)}
              </p>
            </button>

            <button
              aria-label="Delete conversation"
              className={[
                "-translate-y-1/2 absolute top-1/2 right-1 rounded-sm p-1 transition-opacity duration-150",
                "text-sidebar-foreground/50 hover:bg-error-bg hover:text-error-solid",
                "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
                deletingId === s.id
                  ? "cursor-not-allowed opacity-50"
                  : "opacity-0 group-hover:opacity-100",
              ].join(" ")}
              disabled={deletingId === s.id}
              onClick={(e) => handleDelete(e, s.id)}
              type="button"
            >
              <DeleteIcon />
            </button>
          </div>
        );
      })}
    </div>
  );
}
