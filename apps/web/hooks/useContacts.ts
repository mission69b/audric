'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface Contact {
  name: string;
  address: string;
}

/**
 * Contacts state for the dashboard.
 *
 * The LLM-driven `save_contact` tool now persists server-side directly via
 * `apps/web/lib/engine/contact-tools.ts` (Prisma-backed). This hook is
 * therefore the *reader* of that source of truth, plus a manual editor for
 * the contacts tab. `addContact` (manual UI) and `removeContact` still POST
 * to `/api/user/preferences` and now check `res.ok` so failures surface
 * instead of vanishing into a "saved but not really" state — that exact
 * silent-failure mode is what bit us when save_contact also went through
 * here.
 *
 * `refetch()` is exposed so the dashboard can resync after a chat turn that
 * called `save_contact`. Without it the contacts tab would stay stale until
 * the page reloaded.
 */
export function useContacts(userAddress: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Used to dedupe concurrent refetches and let callbacks read the freshest
  // server snapshot without taking a stale `contacts` closure dep.
  const inFlightRef = useRef<Promise<Contact[]> | null>(null);

  const fetchContacts = useCallback(async (): Promise<Contact[]> => {
    if (!userAddress) return [];
    if (inFlightRef.current) return inFlightRef.current;

    const promise = (async () => {
      try {
        const res = await fetch(`/api/user/preferences?address=${userAddress}`);
        if (!res.ok) return contacts;
        const data = await res.json();
        const next: Contact[] = Array.isArray(data.contacts) ? (data.contacts as Contact[]) : [];
        setContacts(next);
        setLoaded(true);
        return next;
      } catch {
        setLoaded(true);
        return contacts;
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = promise;
    return promise;
    // `contacts` intentionally omitted — we only fall back to it when the
    // network request fails, and the function is otherwise stateless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress) return;
    void fetchContacts();
  }, [userAddress, fetchContacts]);

  const addContact = useCallback(
    async (name: string, address: string) => {
      if (!userAddress) return;

      const existing = contacts.find(
        (c) => c.address.toLowerCase() === address.toLowerCase(),
      );
      if (existing) return;

      const updated = [...contacts, { name, address }];
      // Optimistic; reverted on POST failure.
      setContacts(updated);

      try {
        const res = await fetch('/api/user/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress, contacts: updated }),
        });
        if (!res.ok) {
          // Roll back so the UI doesn't lie about persistence.
          setContacts(contacts);
          throw new Error(`Failed to save contact (HTTP ${res.status})`);
        }
      } catch (err) {
        setContacts(contacts);
        throw err;
      }
    },
    [userAddress, contacts],
  );

  const removeContact = useCallback(
    async (addressToRemove: string) => {
      if (!userAddress) return;
      const updated = contacts.filter(
        (c) => c.address.toLowerCase() !== addressToRemove.toLowerCase(),
      );
      const previous = contacts;
      setContacts(updated);
      try {
        const res = await fetch('/api/user/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress, contacts: updated }),
        });
        if (!res.ok) {
          setContacts(previous);
          throw new Error(`Failed to remove contact (HTTP ${res.status})`);
        }
      } catch (err) {
        setContacts(previous);
        throw err;
      }
    },
    [userAddress, contacts],
  );

  const isKnownAddress = useCallback(
    (addr: string) =>
      contacts.some((c) => c.address.toLowerCase() === addr.toLowerCase()),
    [contacts],
  );

  const resolveContact = useCallback(
    (nameOrAddress: string): string | null => {
      const match = contacts.find(
        (c) => c.name.toLowerCase() === nameOrAddress.toLowerCase(),
      );
      return match?.address ?? null;
    },
    [contacts],
  );

  return {
    contacts,
    loaded,
    addContact,
    removeContact,
    isKnownAddress,
    resolveContact,
    refetch: fetchContacts,
  };
}
