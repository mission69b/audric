'use client';

import { useState, useEffect, useCallback } from 'react';

interface MemorySectionProps {
  address: string;
}

interface MemoryItem {
  id: string;
  memoryType: string;
  content: string;
  confidence: number;
  extractedAt: string;
}

function formatMemoryAge(extractedAt: string): string {
  const hoursAgo = (Date.now() - new Date(extractedAt).getTime()) / 3_600_000;
  if (hoursAgo < 24) return 'today';
  if (hoursAgo < 48) return 'yesterday';
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}

export function MemorySection({ address }: MemorySectionProps) {
  const [financialProfile, setFinancialProfile] = useState<{
    style: string;
    notes: string;
  } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [deletingMemory, setDeletingMemory] = useState<string | null>(null);
  const [clearingMemories, setClearingMemories] = useState(false);

  const fetchMemories = useCallback(async () => {
    if (!address) return;
    setMemoriesLoading(true);
    try {
      const res = await fetch(`/api/user/memories?address=${address}`);
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories ?? []);
      }
    } catch { /* ignore */ }
    finally { setMemoriesLoading(false); }
  }, [address]);

  useEffect(() => {
    if (!address) return;
    setProfileLoading(true);
    fetch(`/api/user/preferences?address=${address}`)
      .then((r) => r.json())
      .then((data: { limits?: Record<string, unknown> | null }) => {
        const fp = data.limits?.financialProfile as { style: string; notes: string } | null;
        setFinancialProfile(fp ?? null);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
    fetchMemories();
  }, [address, fetchMemories]);

  const handleDeleteMemory = async (id: string) => {
    if (!address) return;
    setDeletingMemory(id);
    try {
      const res = await fetch(`/api/user/memories/${id}?address=${address}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch { /* ignore */ }
    finally { setDeletingMemory(null); }
  };

  const handleClearAllMemories = async () => {
    if (!address) return;
    setClearingMemories(true);
    try {
      const res = await fetch(`/api/user/memories?address=${address}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories([]);
      }
    } catch { /* ignore */ }
    finally { setClearingMemories(false); }
  };

  return (
    <section className="space-y-6">
      <h2 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase pb-2 border-b border-border">
        Memory
      </h2>

      <p className="text-sm text-muted leading-relaxed">
        Audric builds a picture of your financial style as you chat — personalising advice,
        response length, and proactive suggestions over time.
      </p>

      {/* Financial profile */}
      <div className="space-y-2">
        <h3 className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
          Financial Profile
        </h3>
        {profileLoading ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : financialProfile?.style ? (
          <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground font-medium capitalize">
                  {financialProfile.style}
                </span>
                <span className="font-mono text-[9px] tracking-wider text-muted uppercase bg-background px-1.5 py-0.5 rounded">
                  Self-reported
                </span>
              </div>
            </div>
            {financialProfile.notes && (
              <p className="text-xs text-muted leading-relaxed">{financialProfile.notes}</p>
            )}
            <p className="text-xs text-dim leading-relaxed">
              Set during onboarding. Agent inferences will appear below as you use Audric.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
            <p className="text-sm text-foreground">Building profile&hellip;</p>
            <p className="text-xs text-muted leading-relaxed">
              After a few sessions you&apos;ll see inferences here — things like
              &ldquo;prefers brief responses&rdquo; or &ldquo;intermediate DeFi literacy.&rdquo;
              You can correct any that are wrong.
            </p>
          </div>
        )}
      </div>

      {/* Episodic memories */}
      <div className="space-y-2">
        <h3 className="font-mono text-[10px] tracking-[0.12em] text-dim uppercase">
          Remembered Context
        </h3>
        {memoriesLoading ? (
          <p className="text-sm text-muted">Loading memories...</p>
        ) : memories.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 flex flex-col items-center text-center space-y-2">
            <span className="text-2xl">🧠</span>
            <p className="text-sm text-muted">No memories yet.</p>
            <p className="text-xs text-dim leading-relaxed max-w-xs">
              Audric will remember things you tell it — preferences, facts, goals — and
              surface them automatically across sessions.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {memories.map((m) => {
              const age = formatMemoryAge(m.extractedAt);
              return (
                <div
                  key={m.id}
                  className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[9px] tracking-wider text-muted uppercase bg-background px-1.5 py-0.5 rounded">
                        {m.memoryType}
                      </span>
                      <span className="text-[10px] text-dim">{age}</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{m.content}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    disabled={deletingMemory === m.id}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-error text-xs p-1"
                    title="Remove memory"
                  >
                    {deletingMemory === m.id ? '...' : '✕'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Data controls */}
      <div className="pt-1 space-y-2">
        <button
          onClick={handleClearAllMemories}
          disabled={clearingMemories || memories.length === 0}
          className={`rounded-md border border-border px-4 py-2 font-mono text-[10px] tracking-[0.1em] uppercase transition ${
            clearingMemories || memories.length === 0
              ? 'text-dim opacity-50 cursor-not-allowed'
              : 'text-muted hover:text-error hover:border-error/20'
          }`}
        >
          {clearingMemories ? 'Clearing...' : 'Clear All Memory'}
        </button>
        <p className="text-xs text-dim">
          Removes all remembered context. Audric will rebuild memories from future conversations.
        </p>
      </div>
    </section>
  );
}
