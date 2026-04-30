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
  }, [jwt, address]);

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
    <div className="flex flex-col gap-0.5 px-1">
      <div className="overflow-y-auto max-h-[220px] space-y-0.5 scrollbar-none">
        {loading && (
          <div className="space-y-2 px-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-9 rounded-sm bg-border-subtle/50 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && sessions.map((s) => {
          const isActive = activeSessionId === s.id;
          return (
            <div
              key={s.id}
              className={[
                'group relative w-full rounded-sm transition-colors',
                isActive ? 'bg-border-subtle' : 'hover:bg-surface-nav-hover',
              ].join(' ')}
            >
              <button
                onClick={() => onLoadSession(s.id)}
                className="w-full text-left px-2 py-1.5 pr-7 rounded-sm focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
              >
                <p
                  className={[
                    'text-[12px] truncate',
                    isActive ? 'text-fg-primary' : 'text-fg-secondary',
                  ].join(' ')}
                >
                  {s.title || s.preview || 'Conversation'}
                </p>
                <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-fg-muted mt-0.5">
                  {s.messageCount} msgs · {relativeTime(s.updatedAt)}
                </p>
              </button>

              <button
                onClick={(e) => handleDelete(e, s.id)}
                disabled={deletingId === s.id}
                className={[
                  'absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-sm',
                  'text-fg-muted hover:text-error-solid hover:bg-error-bg',
                  'transition-opacity duration-150',
                  'focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)] focus-visible:opacity-100',
                  deletingId === s.id ? 'opacity-50 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100',
                ].join(' ')}
                aria-label="Delete conversation"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
