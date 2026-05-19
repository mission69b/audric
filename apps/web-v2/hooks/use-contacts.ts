"use client";

/**
 * `useContacts` — SWR-backed reader/writer for the user's address book.
 *
 * Reads come from the canonical `usePreferences` cache (one shared slot
 * for `/api/user/preferences`). Writes post a PARTIAL payload (`contacts`
 * only) and optimistically patch the shared cache, so the safety preset
 * sitting in the same slot stays untouched.
 *
 * Replaces the raw `useState/useEffect/useRef` port from `apps/web/hooks/
 * useContacts.ts`. The in-flight-promise dedup the original used via a
 * `useRef` is now provided by SWR's `dedupingInterval`.
 */

import { useCallback } from "react";
import { audricWebUrl } from "@/lib/audric-web-url";
import { authFetch } from "@/lib/auth-fetch";
import { type Contact, usePreferences } from "@/lib/swr/user-preferences";

export type { Contact } from "@/lib/swr/user-preferences";

export function useContacts(userAddress: string | null) {
  const { data, isLoading, mutate } = usePreferences(userAddress);
  const contacts = data?.contacts ?? [];

  const writeContacts = useCallback(
    async (next: Contact[], rollbackErrorMsg: string) => {
      if (!userAddress) {
        return;
      }
      await mutate(
        async (current) => {
          const res = await authFetch(audricWebUrl("/api/user/preferences"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: userAddress, contacts: next }),
          });
          if (!res.ok) {
            throw new Error(`${rollbackErrorMsg} (HTTP ${res.status})`);
          }
          return current
            ? { ...current, contacts: next }
            : { contacts: next, permissionPreset: "balanced" as const };
        },
        {
          optimisticData: (current) =>
            current
              ? { ...current, contacts: next }
              : { contacts: next, permissionPreset: "balanced" as const },
          rollbackOnError: true,
          revalidate: false,
        }
      );
    },
    [userAddress, mutate]
  );

  const addContact = useCallback(
    async (name: string, address: string) => {
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

      await writeContacts(
        [...contacts, { name: trimmedName, address }],
        "Failed to save contact"
      );
    },
    [contacts, writeContacts]
  );

  const removeContact = useCallback(
    async (addressToRemove: string) => {
      const next = contacts.filter(
        (c) => c.address.toLowerCase() !== addressToRemove.toLowerCase()
      );
      await writeContacts(next, "Failed to remove contact");
    },
    [contacts, writeContacts]
  );

  const renameContact = useCallback(
    async (address: string, newName: string) => {
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
      const next = contacts.map((c) =>
        c.address.toLowerCase() === target ? { ...c, name: trimmed } : c
      );
      await writeContacts(next, "Failed to rename contact");
    },
    [contacts, writeContacts]
  );

  return {
    contacts,
    loaded: !isLoading && data !== undefined,
    addContact,
    removeContact,
    renameContact,
    refetch: mutate,
  };
}
