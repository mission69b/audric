"use client";

/**
 * `useContacts` — port from `apps/web/hooks/useContacts.ts`.
 *
 * Reads contacts from apps/web's `/api/user/preferences` (cross-app
 * fetch until v0.7e migration) and writes back to the same route.
 * Save_contact tool persists via the engine path; this hook is the
 * reader for settings + manual-add UI.
 *
 * Two diffs from legacy:
 *   - URLs go through `audricWebUrl()` for cross-app preview testing
 *   - Adds use eslint-disable for the intentional `contacts` omit
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { audricWebUrl } from "@/lib/audric-web-url";
import { authFetch } from "@/lib/auth-fetch";

export interface Contact {
  addedAt?: string | null;
  address: string;
  audricUsername?: string | null;
  identifier?: string;
  name: string;
  resolvedAddress?: string;
  source?: string | null;
}

export function useContacts(userAddress: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inFlightRef = useRef<Promise<Contact[]> | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `contacts` is an intentional fallback returned only when the network request fails; not a state-driven dep
  const fetchContacts = useCallback((): Promise<Contact[]> => {
    if (!userAddress) {
      return Promise.resolve([]);
    }
    if (inFlightRef.current) {
      return inFlightRef.current;
    }

    const promise = (async () => {
      try {
        const res = await authFetch(
          audricWebUrl(`/api/user/preferences?address=${userAddress}`)
        );
        if (!res.ok) {
          return contacts;
        }
        const data = await res.json();
        const next: Contact[] = Array.isArray(data.contacts)
          ? (data.contacts as Contact[])
          : [];
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
  }, [userAddress]);

  useEffect(() => {
    if (!userAddress) {
      return;
    }
    fetchContacts().catch(() => {
      // best-effort hydration; failures are surfaced via the hook's `loaded` flag
    });
  }, [userAddress, fetchContacts]);

  const addContact = useCallback(
    async (name: string, address: string) => {
      if (!userAddress) {
        return;
      }
      const existing = contacts.find(
        (c) => c.address.toLowerCase() === address.toLowerCase()
      );
      if (existing) {
        return;
      }

      const trimmedName = name.trim();
      const nameTaken = contacts.some(
        (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );
      if (nameTaken) {
        throw new Error(
          `You already have a contact named "${trimmedName}". Pick a different nickname.`
        );
      }

      const updated = [...contacts, { name: trimmedName, address }];
      setContacts(updated);

      try {
        const res = await authFetch(audricWebUrl("/api/user/preferences"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: userAddress, contacts: updated }),
        });
        if (!res.ok) {
          setContacts(contacts);
          throw new Error(`Failed to save contact (HTTP ${res.status})`);
        }
      } catch (err) {
        setContacts(contacts);
        throw err;
      }
    },
    [userAddress, contacts]
  );

  const removeContact = useCallback(
    async (addressToRemove: string) => {
      if (!userAddress) {
        return;
      }
      const updated = contacts.filter(
        (c) => c.address.toLowerCase() !== addressToRemove.toLowerCase()
      );
      const previous = contacts;
      setContacts(updated);
      try {
        const res = await authFetch(audricWebUrl("/api/user/preferences"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    [userAddress, contacts]
  );

  const renameContact = useCallback(
    async (address: string, newName: string) => {
      if (!userAddress) {
        return;
      }
      const trimmed = newName.trim();
      if (!trimmed) {
        throw new Error("Name cannot be empty");
      }
      const target = address.toLowerCase();
      const existing = contacts.find((c) => c.address.toLowerCase() === target);
      if (!existing) {
        return;
      }

      const nameTaken = contacts.some(
        (c) =>
          c.address.toLowerCase() !== target &&
          c.name.trim().toLowerCase() === trimmed.toLowerCase()
      );
      if (nameTaken) {
        throw new Error(
          `You already have another contact named "${trimmed}". Pick a different nickname.`
        );
      }
      const updated = contacts.map((c) =>
        c.address.toLowerCase() === target ? { ...c, name: trimmed } : c
      );
      const previous = contacts;
      setContacts(updated);
      try {
        const res = await authFetch(audricWebUrl("/api/user/preferences"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: userAddress, contacts: updated }),
        });
        if (!res.ok) {
          setContacts(previous);
          throw new Error(`Failed to rename contact (HTTP ${res.status})`);
        }
      } catch (err) {
        setContacts(previous);
        throw err;
      }
    },
    [userAddress, contacts]
  );

  return {
    contacts,
    loaded,
    addContact,
    removeContact,
    renameContact,
    refetch: fetchContacts,
  };
}
