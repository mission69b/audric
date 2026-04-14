'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { truncateAddress } from '@/lib/format';
import type { Contact } from '@/hooks/useContacts';
import { Skeleton } from '@/components/ui/Skeleton';

interface SessionSummary {
  id: string;
  preview: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  address: string;
  email: string | null;
  network: string;
  sessionExpiresAt: number;
  contacts: Contact[];
  onRemoveContact: (address: string) => void;
  onSignOut: () => void;
  onRefreshSession: () => void;
  jwt?: string;
  activeSessionId?: string | null;
  onLoadSession?: (sessionId: string) => void;
  onNewConversation?: () => void;
}

const DEFAULT_LIMITS = { maxTx: 1000, maxDaily: 5000, agentBudget: 0.50, dailyAuto: 200 };

const PRESET_DISPLAY: Record<string, Array<{ op: string; auto: number; confirm: number }>> = {
  conservative: [
    { op: 'save', auto: 5, confirm: 100 },
    { op: 'send', auto: 5, confirm: 100 },
    { op: 'borrow', auto: 0, confirm: 100 },
    { op: 'withdraw', auto: 5, confirm: 100 },
    { op: 'pay', auto: 1, confirm: 25 },
  ],
  balanced: [
    { op: 'save', auto: 50, confirm: 1000 },
    { op: 'send', auto: 10, confirm: 200 },
    { op: 'borrow', auto: 0, confirm: 500 },
    { op: 'withdraw', auto: 25, confirm: 500 },
    { op: 'pay', auto: 1, confirm: 50 },
  ],
  aggressive: [
    { op: 'save', auto: 100, confirm: 2000 },
    { op: 'send', auto: 25, confirm: 500 },
    { op: 'borrow', auto: 10, confirm: 1000 },
    { op: 'withdraw', auto: 50, confirm: 1000 },
    { op: 'pay', auto: 5, confirm: 100 },
  ],
};

export function SettingsPanel({
  open,
  onClose,
  address,
  email,
  network,
  sessionExpiresAt,
  contacts,
  onRemoveContact,
  onSignOut,
  onRefreshSession,
  jwt,
  activeSessionId,
  onLoadSession,
  onNewConversation,
}: SettingsPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [editingLimit, setEditingLimit] = useState<'maxTx' | 'maxDaily' | 'agentBudget' | 'dailyAuto' | null>(null);
  const [permissionPreset, setPermissionPreset] = useState<'conservative' | 'balanced' | 'aggressive'>('balanced');
  const [editValue, setEditValue] = useState('');
  const [now] = useState(() => Date.now());
  const [chatSessions, setChatSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!address || !jwt) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`/api/engine/sessions?address=${address}&limit=10`, {
        headers: { 'x-zklogin-jwt': jwt },
      });
      if (res.ok) {
        const data = await res.json();
        setChatSessions(data.sessions ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setSessionsLoading(false);
    }
  }, [address, jwt]);

  useEffect(() => {
    if (open) loadSessions();
  }, [open, loadSessions]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/user/preferences?address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.limits && typeof data.limits === 'object') {
          setLimits({ ...DEFAULT_LIMITS, ...data.limits });
        }
        if (data.permissionPreset) {
          setPermissionPreset(data.permissionPreset);
        }
      })
      .catch(() => {});
  }, [address]);

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;
  const expiryDate = new Date(sessionExpiresAt);
  const daysLeft = Math.max(0, Math.ceil((sessionExpiresAt - now) / (24 * 60 * 60 * 1000)));

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveLimit = (key: keyof typeof limits, parser: (v: string) => number, validator: (n: number) => boolean) => {
    const val = parser(editValue);
    if (validator(val)) {
      const next = { ...limits, [key]: val };
      setLimits(next);
      fetch('/api/user/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, limits: next }),
      }).catch(() => {});
    }
    setEditingLimit(null);
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 w-full max-w-sm bg-background border-l border-border z-50 flex flex-col outline-none shadow-[var(--shadow-drawer)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 id="settings-title" className="font-mono text-xs tracking-[0.12em] text-foreground uppercase">
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted hover:text-foreground hover:bg-surface transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">
          {/* Account */}
          <section className="space-y-3">
            <SectionLabel>Account</SectionLabel>
            <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2.5">
              {email && (
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <svg className="h-3.5 w-3.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <span>{email}</span>
                </div>
              )}
              <InfoRow label="Address" value={truncateAddress(address)} mono />
              <InfoRow label="Network" value={network} />
            </div>
            <button
              onClick={handleCopy}
              className="min-h-[36px] rounded-md border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
            >
              {copied ? '\u2713 Copied' : 'Copy Address'}
            </button>
          </section>

          {/* Session */}
          <section className="space-y-3">
            <SectionLabel>Sign-in Session</SectionLabel>
            <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2.5">
              <InfoRow
                label="Expires"
                value={`${expiryDate.toLocaleDateString()} (${daysLeft}d)`}
              />
              {daysLeft <= 1 && (
                <div className="flex items-center gap-1.5 text-xs text-warning">
                  <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                  Session expiring soon
                </div>
              )}
            </div>
            <button
              onClick={onRefreshSession}
              className="min-h-[36px] rounded-md border border-border px-3 py-1.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
            >
              Refresh Session
            </button>
          </section>

          {/* Chat History */}
          {onLoadSession && (
            <section className="space-y-3">
              <SectionLabel>Conversations</SectionLabel>
              {onNewConversation && (
                <button
                  onClick={() => { onNewConversation(); onClose(); }}
                  className="w-full min-h-[40px] rounded-md bg-foreground text-background font-mono text-[10px] tracking-[0.1em] uppercase hover:opacity-80 transition"
                >
                  + New Conversation
                </button>
              )}
              {sessionsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} variant="block" height={48} width="100%" />
                  ))}
                </div>
              ) : chatSessions.length === 0 ? (
                <p className="text-sm text-muted py-2">No previous conversations.</p>
              ) : (
                <div className="space-y-1">
                  {chatSessions.map((s) => {
                    const isActive = s.id === activeSessionId;
                    const timeAgo = formatTimeAgo(s.updatedAt);
                    return (
                      <div
                        key={s.id}
                        className={`flex items-center rounded-lg px-3 py-2.5 -mx-1 transition group ${
                          isActive
                            ? 'bg-foreground/[0.04] border border-border'
                            : 'hover:bg-surface'
                        }`}
                      >
                        <button
                          onClick={() => { onLoadSession(s.id); onClose(); }}
                          className="flex-1 text-left min-w-0 min-h-[36px]"
                        >
                          <p className="text-sm text-foreground truncate leading-snug">
                            {s.preview}
                          </p>
                          <p className="font-mono text-[10px] tracking-wider text-muted uppercase mt-0.5">
                            {s.messageCount} msgs &middot; {timeAgo}
                          </p>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!jwt) return;
                            setChatSessions((prev) => prev.filter((cs) => cs.id !== s.id));
                            fetch(`/api/engine/sessions/${encodeURIComponent(s.id)}`, {
                              method: 'DELETE',
                              headers: { 'x-zklogin-jwt': jwt },
                            }).catch(() => {});
                          }}
                          className="flex items-center justify-center h-7 w-7 rounded text-dim hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition shrink-0 ml-1"
                          title="Delete conversation"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Contacts */}
          <section className="space-y-3">
            <SectionLabel>Contacts</SectionLabel>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted">
                No saved contacts yet. Send to an address and you&apos;ll be prompted to save it.
              </p>
            ) : (
              <div className="space-y-1">
                {contacts.map((c) => (
                  <div
                    key={c.address}
                    className="flex items-center justify-between py-2.5 px-3 -mx-1 rounded-lg hover:bg-surface transition group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{c.name}</p>
                      <p className="font-mono text-[10px] tracking-wider text-muted truncate mt-0.5">
                        {truncateAddress(c.address)}
                      </p>
                    </div>
                    <button
                      onClick={() => onRemoveContact(c.address)}
                      className="flex items-center justify-center h-7 w-7 rounded text-dim hover:text-error hover:bg-error/10 opacity-0 group-hover:opacity-100 transition shrink-0"
                      title="Remove contact"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Safety Limits */}
          <section className="space-y-3">
            <SectionLabel>Safety Limits</SectionLabel>
            <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2">
              <EditableLimit
                label="Max per tx"
                value={limits.maxTx}
                editing={editingLimit === 'maxTx'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('maxTx'); setEditValue(String(limits.maxTx)); }}
                onEditChange={setEditValue}
                onSave={() => saveLimit('maxTx', parseInt, (n) => n > 0)}
                onCancel={() => setEditingLimit(null)}
              />
              <div className="border-t border-border" />
              <EditableLimit
                label="Max daily send"
                value={limits.maxDaily}
                editing={editingLimit === 'maxDaily'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('maxDaily'); setEditValue(String(limits.maxDaily)); }}
                onEditChange={setEditValue}
                onSave={() => saveLimit('maxDaily', parseInt, (n) => n > 0)}
                onCancel={() => setEditingLimit(null)}
              />
              <div className="border-t border-border" />
              <EditableLimit
                label="Agent budget"
                value={limits.agentBudget}
                editing={editingLimit === 'agentBudget'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('agentBudget'); setEditValue(String(limits.agentBudget)); }}
                onEditChange={setEditValue}
                onSave={() => saveLimit('agentBudget', parseFloat, (n) => n >= 0)}
                onCancel={() => setEditingLimit(null)}
              />
              <div className="border-t border-border" />
              <EditableLimit
                label="Daily autonomous"
                value={limits.dailyAuto}
                editing={editingLimit === 'dailyAuto'}
                editValue={editValue}
                onEdit={() => { setEditingLimit('dailyAuto'); setEditValue(String(limits.dailyAuto)); }}
                onEditChange={setEditValue}
                onSave={() => saveLimit('dailyAuto', parseInt, (n) => n >= 0)}
                onCancel={() => setEditingLimit(null)}
              />
            </div>
            <p className="font-mono text-[10px] tracking-wider text-dim uppercase leading-relaxed">
              Tap a limit to customize. Agent budget is the max auto-approved spend per session.
            </p>
          </section>

          {/* Permission Presets */}
          <section className="space-y-3">
            <SectionLabel>Auto-approve Permissions</SectionLabel>
            <div className="flex gap-2">
              {(['conservative', 'balanced', 'aggressive'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => {
                    setPermissionPreset(preset);
                    fetch('/api/user/preferences', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ address, permissionPreset: preset }),
                    }).catch(() => {});
                  }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs font-mono uppercase tracking-wider transition ${
                    permissionPreset === preset
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border bg-surface/50 text-muted hover:border-border-bright hover:text-foreground'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-surface/50 p-3">
              <div className="grid grid-cols-3 gap-y-1 text-[10px] font-mono text-muted">
                <span className="text-dim">Operation</span>
                <span className="text-dim text-center">Auto</span>
                <span className="text-dim text-center">Confirm</span>
                {PRESET_DISPLAY[permissionPreset].map(({ op, auto, confirm }) => (
                  <div key={op} className="contents">
                    <span className="text-foreground/80 capitalize">{op}</span>
                    <span className="text-center">&lt;${auto}</span>
                    <span className="text-center">&lt;${confirm}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="font-mono text-[10px] tracking-wider text-dim uppercase leading-relaxed">
              Controls how much Audric can auto-execute without asking. Conservative asks more, aggressive trusts more.
            </p>
          </section>

          {/* Links */}
          <section className="space-y-3">
            <SectionLabel>Links</SectionLabel>
            <a
              href={`https://suiscan.xyz/${network}/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 min-h-[36px] font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground transition"
            >
              View on Suiscan
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            </a>
          </section>

          {/* Security */}
          <section className="space-y-3">
            <SectionLabel>Security</SectionLabel>
            {!showEmergencyConfirm ? (
              <button
                onClick={() => setShowEmergencyConfirm(true)}
                className="w-full min-h-[40px] rounded-md border border-error/30 bg-error/5 font-mono text-[10px] tracking-[0.1em] text-error uppercase hover:bg-error/10 transition flex items-center justify-center gap-2"
              >
                <span className="h-1.5 w-1.5 bg-error rounded-full" />
                Emergency Lock
              </button>
            ) : (
              <div className="rounded-lg border border-error/30 bg-error/5 p-4 space-y-3">
                <p className="text-sm text-error leading-relaxed">
                  This will sign you out and clear all local data. You can sign back in anytime with Google.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowEmergencyConfirm(false);
                      onSignOut();
                    }}
                    className="flex-1 min-h-[36px] rounded-md bg-error text-white font-mono text-[10px] tracking-[0.1em] uppercase hover:opacity-90 transition"
                  >
                    Confirm Lock
                  </button>
                  <button
                    onClick={() => setShowEmergencyConfirm(false)}
                    className="flex-1 min-h-[36px] rounded-md border border-border font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border space-y-2">
          <a
            href="/settings"
            className="block w-full min-h-[40px] rounded-md bg-foreground text-background font-mono text-[10px] tracking-[0.1em] uppercase hover:opacity-80 transition text-center leading-[40px]"
          >
            All Settings
          </a>
          <button
            onClick={onSignOut}
            className="w-full min-h-[40px] rounded-md border border-border font-mono text-[10px] tracking-[0.1em] text-muted uppercase hover:text-foreground hover:border-foreground/20 transition"
          >
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-mono text-[10px] tracking-[0.12em] text-muted uppercase">
      {children}
    </h3>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted">{label}</span>
      <span className={`text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
    </div>
  );
}

function EditableLimit({
  label,
  value,
  editing,
  editValue,
  onEdit,
  onEditChange,
  onSave,
  onCancel,
}: {
  label: string;
  value: number;
  editing: boolean;
  editValue: string;
  onEdit: () => void;
  onEditChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (editing) {
    return (
      <div className="flex items-center justify-between gap-2 py-1">
        <span className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-muted text-sm">$</span>
          <input
            type="number"
            value={editValue}
            onChange={(e) => onEditChange(e.target.value)}
            autoFocus
            className="w-20 rounded-md border border-foreground bg-background px-2 py-1.5 text-sm text-foreground font-mono outline-none"
            onKeyDown={(e) => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
          />
          <button onClick={onSave} className="font-mono text-[10px] tracking-wider text-foreground uppercase px-1.5 py-1 hover:opacity-70 transition">Save</button>
          <button onClick={onCancel} className="text-dim text-sm px-1 hover:text-foreground transition">&times;</button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={onEdit} className="flex justify-between items-center w-full group py-1">
      <span className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">{label}</span>
      <span className="text-sm text-foreground font-mono group-hover:opacity-60 transition">
        ${value.toLocaleString()}
      </span>
    </button>
  );
}
