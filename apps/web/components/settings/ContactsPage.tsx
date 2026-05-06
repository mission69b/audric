'use client';

/**
 * SPEC 10 D.5 — Full contacts CRUD page (rendered at `/settings/contacts`).
 *
 * Differs from `ContactsSection` (the slim summary at `/settings?section=
 * contacts`):
 *   • Polymorphic ADD form (Audric handle, SuiNS, or 0x address — same
 *     field) using `resolveIdentifier` from `lib/contacts/resolve-
 *     identifier.ts`
 *   • Inline RENAME via the `renameContact` hook method (D.5)
 *   • REMOVE per row (same primitive as the summary)
 *   • Per-row 🪪 badge for confirmed Audric handles (sourced from D.4
 *     reverse-SuiNS backfill — populated lazily ~250-500ms after mount)
 *
 * Layout follows the same column shell as the other settings sub-pages
 * (max-w 640, sunken cards, semantic tokens — see design-system.mdc).
 */

import { useState } from 'react';
import { useContacts, type Contact } from '@/hooks/useContacts';
import { truncateAddress } from '@/lib/format';
import {
  IdentifierResolutionError,
  resolveIdentifier,
} from '@/lib/contacts/resolve-identifier';

interface ContactsPageProps {
  address: string | null;
}

const AVATAR_GRADIENT = 'linear-gradient(135deg, var(--n400), var(--n500))';
const MAX_NAME_LENGTH = 50;

function getInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

interface ContactRowProps {
  contact: Contact;
  onRemove: (address: string) => Promise<void>;
  onRename: (address: string, newName: string) => Promise<void>;
}

function ContactRow({ contact, onRemove, onRename }: ContactRowProps) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(contact.name);
  const [busy, setBusy] = useState<null | 'rename' | 'remove'>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = contact.audricUsername;
  const showHandleBadge = typeof handle === 'string' && handle.length > 0;

  const startEdit = () => {
    setNameDraft(contact.name);
    setEditing(true);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const submitRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError('Name cannot be empty');
      return;
    }
    if (trimmed === contact.name) {
      setEditing(false);
      return;
    }
    setBusy('rename');
    setError(null);
    try {
      await onRename(contact.address, trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setBusy(null);
    }
  };

  const submitRemove = async () => {
    setBusy('remove');
    try {
      await onRemove(contact.address);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
      setBusy(null);
    }
  };

  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-border-subtle last:border-b-0">
      <div
        className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-semibold text-white mt-0.5"
        style={{ background: AVATAR_GRADIENT }}
        aria-hidden="true"
      >
        {getInitial(contact.name)}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename();
                if (e.key === 'Escape') cancelEdit();
              }}
              maxLength={MAX_NAME_LENGTH}
              autoFocus
              className="flex-1 min-w-0 bg-surface-input border border-border-subtle rounded px-2 py-1 text-[13px] text-fg-primary focus:outline-none focus:border-border-strong"
              aria-label={`Rename ${contact.name}`}
            />
            <button
              type="button"
              onClick={() => void submitRename()}
              disabled={busy === 'rename'}
              className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-primary hover:text-success-fg transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
            >
              {busy === 'rename' ? 'Saving\u2026' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={busy === 'rename'}
              className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="text-[14px] text-fg-primary truncate">
              {contact.name}
            </div>
            {showHandleBadge ? (
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span aria-hidden="true">🪪</span>
                <span className="font-mono text-[10px] text-fg-secondary truncate">
                  {handle}
                </span>
              </div>
            ) : null}
            <div className="font-mono text-[10px] text-fg-muted mt-0.5 truncate">
              {truncateAddress(contact.address)}
            </div>
          </>
        )}
        {error ? (
          <div className="text-[11px] text-error-fg mt-1.5">{error}</div>
        ) : null}
      </div>
      {!editing ? (
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={startEdit}
            className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted hover:text-fg-primary transition focus-visible:outline-none focus-visible:underline"
            aria-label={`Rename ${contact.name}`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => void submitRemove()}
            disabled={busy === 'remove'}
            className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted hover:text-error-fg transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
            aria-label={`Remove ${contact.name}`}
          >
            {busy === 'remove' ? 'Removing\u2026' : 'Remove'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface AddContactFormProps {
  isKnownAddress: (addr: string) => boolean;
  onAdd: (name: string, address: string) => Promise<void>;
}

function AddContactForm({ isKnownAddress, onAdd }: AddContactFormProps) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const reset = () => {
    setNickname('');
    setIdentifier('');
    setError(null);
    setHint(null);
    setResolving(false);
    setOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    const id = identifier.trim();
    if (!name) {
      setError('Pick a nickname for this contact');
      return;
    }
    if (!id) {
      setError('Enter an Audric handle, SuiNS name, or 0x address');
      return;
    }
    setResolving(true);
    setError(null);
    setHint(null);
    try {
      const resolved = await resolveIdentifier(id);
      if (isKnownAddress(resolved.resolvedAddress)) {
        setError('This address is already in your contacts');
        setResolving(false);
        return;
      }
      await onAdd(name, resolved.resolvedAddress);
      reset();
    } catch (err) {
      if (err instanceof IdentifierResolutionError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to add contact');
      }
      setResolving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3.5 py-3.5 rounded-md border border-border-strong bg-transparent font-mono text-[10px] tracking-[0.1em] uppercase text-fg-primary hover:bg-surface-sunken transition mb-3.5 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
      >
        + Add contact
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-md border border-border-strong bg-surface-sunken p-3.5 mb-3.5 flex flex-col gap-2.5"
    >
      <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
        New contact
      </div>
      <input
        type="text"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="Nickname (e.g. Mom, Alice)"
        maxLength={MAX_NAME_LENGTH}
        disabled={resolving}
        autoFocus
        className="bg-surface-input border border-border-subtle rounded px-2.5 py-2 text-[13px] text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-border-strong"
      />
      <input
        type="text"
        value={identifier}
        onChange={(e) => {
          setIdentifier(e.target.value);
          const v = e.target.value.trim();
          if (!v) setHint(null);
          else if (v.startsWith('0x')) setHint('Sui address');
          else if (v.endsWith('.audric.sui')) setHint('Audric handle');
          else if (v.endsWith('.sui')) setHint('SuiNS name');
          else setHint('Audric handle');
        }}
        placeholder="alice, alice.audric.sui, alex.sui, or 0x..."
        disabled={resolving}
        className="bg-surface-input border border-border-subtle rounded px-2.5 py-2 text-[13px] text-fg-primary placeholder:text-fg-muted font-mono focus:outline-none focus:border-border-strong"
      />
      {hint ? (
        <div className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted">
          Detected: {hint}
        </div>
      ) : null}
      {error ? (
        <div className="text-[12px] text-error-fg">{error}</div>
      ) : null}
      <div className="flex items-center gap-2 mt-1">
        <button
          type="submit"
          disabled={resolving}
          className="font-mono text-[10px] tracking-[0.1em] uppercase px-3.5 py-2 rounded border border-border-strong text-fg-primary hover:bg-surface-card disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-[var(--shadow-focus-ring)]"
        >
          {resolving ? 'Resolving\u2026' : 'Save contact'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={resolving}
          className="font-mono text-[10px] tracking-[0.1em] uppercase px-3.5 py-2 rounded text-fg-muted hover:text-fg-primary disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ContactsPage({ address }: ContactsPageProps) {
  const {
    contacts,
    loaded,
    addContact,
    removeContact,
    renameContact,
    isKnownAddress,
  } = useContacts(address);

  return (
    <div className="flex flex-col">
      <p className="text-[13px] text-fg-secondary mb-4 leading-relaxed">
        People you can pay by name. Audric handles are detected
        automatically &mdash; saved with the
        <span aria-hidden="true"> 🪪 </span>
        badge so you know who&rsquo;s who.
      </p>

      <AddContactForm
        isKnownAddress={isKnownAddress}
        onAdd={addContact}
      />

      {!loaded ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[58px] rounded-md border border-border-subtle bg-surface-sunken animate-pulse"
            />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center">
          <p className="text-[13px] text-fg-secondary">No contacts yet.</p>
          <p className="text-[11px] text-fg-muted mt-1.5 leading-relaxed">
            Add someone above, or send to a new address and Audric will
            offer to save it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {contacts.map((c) => (
            <ContactRow
              key={c.address}
              contact={c}
              onRemove={removeContact}
              onRename={renameContact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
