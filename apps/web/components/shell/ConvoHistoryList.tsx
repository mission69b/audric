'use client';

import { useCallback, useEffect, useState } from 'react';

interface ConvoSession {
  id: string;
  title?: string;
  preview?: string;
  messageCount: number;
  updatedAt: string;
  createdAt?: string;
}

interface ConvoHistoryListProps {
  jwt: string | undefined;
  address: string | undefined;
  activeSessionId?: string;
  onLoadSession: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
  collapsed?: boolean;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function ConvoHistoryList({
  jwt,
  address,
  activeSessionId,
  onLoadSession,
  onDeleteSession,
  collapsed,
}: ConvoHistoryListProps) {
  const [sessions, setSessions] = useState<ConvoSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!jwt || !address) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/engine/sessions?address=${address}`, {
      headers: { 'x-zklogin-jwt': jwt },
    })
      .then((r) => (r.ok ? r.json() : { sessions: [] }))
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [jwt]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      if (!jwt || deletingId) return;

      setDeletingId(sessionId);
      try {
        const res = await fetch(`/api/engine/sessions/${sessionId}`, {
          method: 'DELETE',
          headers: { 'x-zklogin-jwt': jwt },
        });
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
    [jwt, deletingId, activeSessionId, onDeleteSession],
  );

  if (collapsed) return null;

  return (
    <div className="flex flex-col gap-0.5 px-2">
      <div className="overflow-y-auto max-h-[200px] space-y-0.5 scrollbar-none">
        {loading && (
          <div className="space-y-1.5 px-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {!loading && sessions.map((s) => (
          <div
            key={s.id}
            className={`
              group relative w-full rounded-md mb-px transition-colors
              ${activeSessionId === s.id ? 'bg-[var(--n700)]' : 'hover:bg-[var(--n700)]'}
            `}
          >
            <button
              onClick={() => onLoadSession(s.id)}
              className="w-full text-left px-2 py-2 pr-7"
            >
              <p className={`text-[11px] truncate max-w-[145px] ${activeSessionId === s.id ? 'text-foreground' : 'text-dim'}`}>
                {s.title || s.preview || 'Conversation'}
              </p>
              <p className="text-[10px] text-border-bright mt-px">
                {s.messageCount} msgs · {relativeTime(s.updatedAt)}
              </p>
            </button>

            <button
              onClick={(e) => handleDelete(e, s.id)}
              disabled={deletingId === s.id}
              className={`
                absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded
                text-dim hover:text-red-400 hover:bg-red-400/10
                transition-opacity duration-150
                ${deletingId === s.id ? 'opacity-50 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100'}
              `}
              aria-label="Delete conversation"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
