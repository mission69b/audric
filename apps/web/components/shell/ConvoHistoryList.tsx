'use client';

import { useEffect, useState } from 'react';

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
  collapsed,
}: ConvoHistoryListProps) {
  const [sessions, setSessions] = useState<ConvoSession[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (collapsed) return null;

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {/* Session list */}
      <div className="overflow-y-auto max-h-[200px] space-y-0.5 scrollbar-none">
        {loading && (
          <div className="space-y-1.5 px-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {!loading && sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onLoadSession(s.id)}
            className={`
              w-full text-left rounded-md px-2 py-2 mb-px transition-colors
              ${activeSessionId === s.id ? 'bg-[var(--n700)]' : 'hover:bg-[var(--n700)]'}
            `}
          >
            <p className={`text-[11px] truncate max-w-[165px] ${activeSessionId === s.id ? 'text-[var(--n400)]' : 'text-dim'}`}>{s.title || s.preview || 'Conversation'}</p>
            <p className="text-[10px] text-border-bright mt-px">
              {s.messageCount} msgs · {relativeTime(s.updatedAt)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
