'use client';

// [PHASE 10] Settings → Contacts sub-section.
//
// Per per-panel notes in IMPLEMENTATION_PLAN.md: "CONTACTS sub-section is
// a thinner list view of existing contacts." Differs from the full
// `ContactsPanel` by being a flat row list with REMOVE affordances and
// no detail pane.
//
// Layout (matches `settings.jsx` ContactsSub block):
//   • Description paragraph + link to the full Contacts screen
//   • Row per contact: 28px gradient avatar, name + truncated mono
//     address, REMOVE mono link on the right
//   • Hairline divider between rows
//   • Empty state when no contacts exist
//
// Behavior:
//   • Wired to existing `useContacts` hook — same shape as full panel
//   • Remove uses `removeContact` from the same hook (single source)

import { useState } from 'react';
import Link from 'next/link';
import { useContacts } from '@/hooks/useContacts';
import { truncateAddress } from '@/lib/format';

interface ContactsSectionProps {
  address: string | null;
}

const AVATAR_GRADIENT = 'linear-gradient(135deg, var(--n400), var(--n500))';

function getInitial(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

export function ContactsSection({ address }: ContactsSectionProps) {
  const { contacts, loaded, removeContact } = useContacts(address);
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);

  const handleRemove = async (addr: string) => {
    setRemovingAddress(addr);
    try {
      await removeContact(addr);
    } finally {
      setRemovingAddress(null);
    }
  };

  return (
    <div className="flex flex-col">
      <p className="text-[13px] text-fg-secondary mb-4">
        Manage saved recipients &mdash; or{' '}
        <Link
          href="/contacts"
          className="text-fg-primary underline decoration-border-strong hover:decoration-fg-primary transition"
        >
          open the full Contacts screen
        </Link>
        .
      </p>

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
            Send to a new address and Audric will offer to save it.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {contacts.map((c, i) => (
            <div
              key={c.address}
              className={[
                'flex items-center gap-3 py-3.5',
                i < contacts.length - 1 ? 'border-b border-border-subtle' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div
                className="shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-semibold text-fg-inverse"
                style={{ background: AVATAR_GRADIENT }}
                aria-hidden="true"
              >
                {getInitial(c.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-fg-primary truncate">{c.name}</div>
                <div className="font-mono text-[10px] text-fg-muted mt-0.5 truncate">
                  {truncateAddress(c.address)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(c.address)}
                disabled={removingAddress === c.address}
                className="font-mono text-[9px] tracking-[0.1em] uppercase text-fg-muted hover:text-error-fg transition disabled:opacity-50 focus-visible:outline-none focus-visible:underline"
                aria-label={`Remove ${c.name}`}
              >
                {removingAddress === c.address ? 'Removing\u2026' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
