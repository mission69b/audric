"use client";

/**
 * Contacts settings — flat list with REMOVE affordance per row.
 *
 * Ported from `apps/web/components/settings/ContactsSection.tsx`. Wires to
 * the v2 `useContacts` hook which reads/writes apps/web's
 * `/api/user/preferences` via cross-app fetch (`audricWebUrl()`).
 *
 * v0.7c Phase 6 Session 2: this is the standard contacts surface in v2.
 * The legacy `apps/web/components/panels/ContactsPanel.tsx` (787 LoC full
 * picker UI) is not ported — that panel was reachable via a
 * `/settings/contacts` detail link from the legacy sub-section, which we
 * fold into this single page.
 */

import { useState } from "react";
import { useContacts } from "@/hooks/use-contacts";
import { truncateAddress } from "@/lib/format";

interface ContactsSectionProps {
  address: string | null;
}

const AVATAR_GRADIENT = "linear-gradient(135deg, var(--n400), var(--n500))";

function getInitial(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
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
      <p className="mb-4 text-[13px] text-fg-secondary">
        Manage saved recipients. Send to a new address from chat and Audric will
        offer to save it for you.
      </p>

      {loaded ? (
        contacts.length === 0 ? (
          <div className="rounded-md border border-border-subtle bg-surface-sunken p-6 text-center">
            <p className="text-[13px] text-fg-secondary">No contacts yet.</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-fg-muted">
              Send to a new address and Audric will offer to save it.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {contacts.map((c, i) => (
              <div
                className={[
                  "flex items-center gap-3 py-3.5",
                  i < contacts.length - 1
                    ? "border-b border-border-subtle"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={c.address}
              >
                <div
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: AVATAR_GRADIENT }}
                >
                  {getInitial(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] text-fg-primary">
                    {c.name}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[10px] text-fg-muted">
                    {truncateAddress(c.address)}
                  </div>
                </div>
                <button
                  aria-label={`Remove ${c.name}`}
                  className="font-mono text-[9px] uppercase tracking-[0.1em] text-fg-muted transition hover:text-error-fg focus-visible:underline focus-visible:outline-none disabled:opacity-50"
                  disabled={removingAddress === c.address}
                  onClick={() => handleRemove(c.address)}
                  type="button"
                >
                  {removingAddress === c.address ? "Removing\u2026" : "Remove"}
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              className="h-[58px] animate-pulse rounded-md border border-border-subtle bg-surface-sunken"
              key={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
