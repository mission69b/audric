'use client';

import { useCallback, useEffect, useState } from 'react';

interface ContactToastProps {
  address: string;
  onSave: (name: string) => void;
  onDismiss: () => void;
  /**
   * [B4 polish] Pre-fill for the contact-name input. Set when the
   * spawn site knows a canonical name for this recipient (today:
   * the bare Audric handle for `@username` recipients). Eliminates
   * the typing step on the SPEC 10 happy path.
   */
  defaultName?: string;
  /**
   * [B4 polish] Fires only when the user EXPLICITLY clicks Skip
   * (NOT on the 8s auto-dismiss timeout). Distinguishing the two
   * matters: explicit Skip means "don't ask again for this address"
   * (parent persists per-address skip flag); auto-dismiss means
   * "user looked away" (parent does NOT persist the flag — they
   * may want to save next time). Without this distinction, walking
   * away from the toast would silently delete the future prompt.
   */
  onSkip?: () => void;
}

export function ContactToast({
  address,
  onSave,
  onDismiss,
  defaultName,
  onSkip,
}: ContactToastProps) {
  // [B4 polish] When defaultName is set we open in expanded form
  // straight away — the user's only remaining action is Save (or
  // edit-then-save), so a collapsed "Save … as a contact?" question
  // would just add an extra tap before the editable name field
  // appears. The Save button is now one tap, not two.
  const [expanded, setExpanded] = useState(Boolean(defaultName));
  const [name, setName] = useState(defaultName ?? '');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!expanded) {
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  useEffect(() => {
    if (!visible) {
      const fade = setTimeout(onDismiss, 300);
      return () => clearTimeout(fade);
    }
  }, [visible, onDismiss]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
  }, [name, onSave]);

  const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div
      className={`rounded-lg border border-border-subtle bg-surface-card p-4 transition-all duration-300 feed-row shadow-[var(--shadow-flat)] ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      {!expanded ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-secondary">
            Save <span className="font-mono text-fg-primary">{truncated}</span> as a contact?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setExpanded(true)}
              className="bg-fg-primary rounded-lg px-3 py-1.5 text-xs font-medium text-fg-inverse tracking-[0.05em] uppercase transition hover:opacity-80"
            >
              Save
            </button>
            <button
              onClick={() => {
                onSkip?.();
                setVisible(false);
              }}
              className="rounded-lg border border-border-subtle bg-surface-page px-3 py-1.5 text-xs font-medium text-fg-secondary hover:text-fg-primary transition"
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-fg-secondary">
            Name for <span className="font-mono text-fg-primary">{truncated}</span>
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Alice, Rent, Exchange"
              autoFocus
              className="flex-1 rounded-lg border border-border-subtle bg-surface-page px-3 py-2 text-sm text-fg-primary placeholder:text-fg-muted outline-none focus:border-border-strong"
            />
            <button
              onClick={handleSave}
              disabled={!name.trim()}
              className="bg-fg-primary rounded-lg px-4 py-2 text-sm font-medium text-fg-inverse tracking-[0.05em] uppercase transition hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
