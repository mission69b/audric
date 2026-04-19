'use client';

// [PHASE 10] Memory sub-section — re-skinned to match
// `design_handoff_audric/.../settings.jsx` Memory block.
//
// Layout:
//   • Description paragraph
//   • FINANCIAL PROFILE eyebrow + sunken card (real profile when present,
//     "Building profile…" empty state otherwise)
//   • REMEMBERED CONTEXT eyebrow + stack of memory cards. Each card has a
//     tone-mapped Tag (FACT=neutral, GOAL=green, PATTERN=blue, etc.) +
//     mono age label + memory body.
//   • Data controls (Clear All Memory)
//
// Behavior preserved:
//   • All existing fetch endpoints + state machinery untouched
//     (`/api/user/preferences`, `/api/user/memories`, DELETE handlers)
//   • Per-row delete affordance preserved (hover-revealed × control)

import { useState, useEffect, useCallback } from 'react';
import { Tag, type TagTone } from '@/components/ui/Tag';

interface MemorySectionProps {
  address: string | null;
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

// Map memoryType to Tag tone — mirrors the design's FACT=neutral,
// GOAL=green, PATTERN=blue mapping. Unknown types fall back to neutral.
function tagTone(memoryType: string): TagTone {
  const t = memoryType.toUpperCase();
  if (t === 'GOAL') return 'green';
  if (t === 'PATTERN') return 'blue';
  if (t === 'PREFERENCE') return 'yellow';
  return 'neutral';
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
    } catch {
      /* ignore */
    } finally {
      setMemoriesLoading(false);
    }
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
    } catch {
      /* ignore */
    } finally {
      setDeletingMemory(null);
    }
  };

  const handleClearAllMemories = async () => {
    if (!address) return;
    setClearingMemories(true);
    try {
      const res = await fetch(`/api/user/memories?address=${address}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories([]);
      }
    } catch {
      /* ignore */
    } finally {
      setClearingMemories(false);
    }
  };

  return (
    <div className="flex flex-col">
      <p className="text-[13px] text-fg-secondary mb-4 leading-[1.6]">
        Audric builds a picture of your financial style as you chat &mdash; personalising advice,
        response length, and proactive suggestions over time.
      </p>

      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
        Financial profile
      </p>
      <div className="rounded-md border border-border-subtle bg-surface-sunken p-4 mb-5">
        {profileLoading ? (
          <p className="text-[14px] text-fg-secondary">Loading&hellip;</p>
        ) : financialProfile?.style ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[14px] text-fg-primary font-medium capitalize">
                {financialProfile.style}
              </span>
              <Tag tone="neutral">Self-reported</Tag>
            </div>
            {financialProfile.notes && (
              <p className="text-[12px] text-fg-secondary leading-[1.6]">{financialProfile.notes}</p>
            )}
            <p className="text-[12px] text-fg-muted leading-[1.6]">
              Set during onboarding. Agent inferences will appear below as you use Audric.
            </p>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-fg-primary">Building profile&hellip;</p>
            <p className="text-[12px] text-fg-muted mt-2 leading-[1.6]">
              After a few sessions you&apos;ll see inferences here &mdash; things like
              &ldquo;prefers brief responses&rdquo; or &ldquo;intermediate DeFi literacy.&rdquo; You
              can correct any that are wrong.
            </p>
          </>
        )}
      </div>

      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-fg-muted mb-2.5">
        Remembered context
      </p>
      {memoriesLoading ? (
        <p className="text-[13px] text-fg-secondary">Loading memories&hellip;</p>
      ) : memories.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 flex flex-col items-center text-center gap-2">
          <span aria-hidden="true" className="text-2xl">🧠</span>
          <p className="text-[13px] text-fg-secondary">No memories yet.</p>
          <p className="text-[11px] text-fg-muted leading-[1.6] max-w-xs">
            Audric will remember things you tell it &mdash; preferences, facts, goals &mdash; and
            surface them automatically across sessions.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {memories.map((m) => {
            const age = formatMemoryAge(m.extractedAt);
            return (
              <div
                key={m.id}
                className="group rounded-md border border-border-subtle bg-surface-sunken p-3.5 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Tag tone={tagTone(m.memoryType)}>{m.memoryType}</Tag>
                    <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
                      {age}
                    </span>
                  </div>
                  <p className="text-[13px] text-fg-primary leading-[1.5]">{m.content}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteMemory(m.id)}
                  disabled={deletingMemory === m.id}
                  className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity text-fg-muted hover:text-error-fg text-xs p-1"
                  aria-label="Remove memory"
                  title="Remove memory"
                >
                  {deletingMemory === m.id ? '\u2026' : '\u2715'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-5 mt-5 border-t border-border-subtle flex flex-col gap-2">
        <button
          type="button"
          onClick={handleClearAllMemories}
          disabled={clearingMemories || memories.length === 0}
          className={[
            'self-start rounded-sm border px-4 py-2 font-mono text-[10px] tracking-[0.1em] uppercase transition focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]',
            clearingMemories || memories.length === 0
              ? 'border-border-subtle text-fg-muted opacity-50 cursor-not-allowed'
              : 'border-border-strong text-fg-secondary hover:text-error-fg hover:border-error-border',
          ].join(' ')}
        >
          {clearingMemories ? 'Clearing\u2026' : 'Clear all memory'}
        </button>
        <p className="text-[12px] text-fg-muted">
          Removes all remembered context. Audric will rebuild memories from future conversations.
        </p>
      </div>
    </div>
  );
}
