'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * [SPEC 10 D.4] Widened Contact shape — now exposes the SPEC 10 D7
 * unified fields: `audricUsername` (lazy reverse-SuiNS enrichment) +
 * `resolvedAddress` (canonical lowercased 0x). `address` mirrors
 * `identifier` for backward-compat with consumers (PermissionCard,
 * ContactsPanel, SendRecipientInput) that read `c.address`.
 *
 * Tri-state for `audricUsername`:
 *   - `string`  — confirmed Audric handle (e.g. `alice.audric.sui`)
 *   - `null`    — checked, no Audric handle for this address
 *   - `undefined` — never checked yet (transient; D.4 backfill will
 *                   populate within ~250-500ms of useContacts mount)
 */
export interface Contact {
  name: string;
  address: string;
  identifier?: string;
  resolvedAddress?: string;
  audricUsername?: string | null;
  addedAt?: string | null;
  source?: string | null;
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
 *
 * [SPEC 10 D.4] After the initial GET, if any contacts have
 * `audricUsername === null` (= unchecked or previously checked-no-handle),
 * fire `POST /api/user/preferences/contacts/backfill` once per session
 * to enrich them. Latency-decoupled from GET so the contact list renders
 * immediately and 🪪 badges populate ~250-500ms later.
 */
export function useContacts(userAddress: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inFlightRef = useRef<Promise<Contact[]> | null>(null);
  // Per-session debounce for the D.4 backfill — guarantees we only fire
  // it once even if useContacts mounts multiple times (panel switch +
  // dashboard nav re-mount). Resets on full page reload.
  const backfillDoneRef = useRef(false);

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

  // [SPEC 10 D.4] Lazy reverse-SuiNS backfill, fired once per session
  // after first GET if any contact lacks a confirmed audricUsername
  // string. The endpoint persists results so subsequent sessions see
  // pre-enriched contacts immediately.
  useEffect(() => {
    if (!userAddress || !loaded) return;
    if (backfillDoneRef.current) return;
    const needsBackfill = contacts.some((c) => typeof c.audricUsername !== 'string');
    if (!needsBackfill) {
      backfillDoneRef.current = true;
      return;
    }
    backfillDoneRef.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/user/preferences/contacts/backfill', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.contacts) && data.changed) {
          setContacts(data.contacts as Contact[]);
        }
      } catch {
        // Backfill is best-effort. If RPC degrades or rate-limit hits,
        // the next session retries automatically.
      }
    })();
  }, [userAddress, loaded, contacts]);

  const addContact = useCallback(
    async (name: string, address: string) => {
      if (!userAddress) return;

      const existing = contacts.find(
        (c) => c.address.toLowerCase() === address.toLowerCase(),
      );
      if (existing) return;

      // [B3 polish] Name-collision check. Without this, saving "Mom"
      // again pointed at a different address silently produced two
      // "Mom" rows in the list — confusing later when the user types
      // "send to Mom" and `resolveContact` returns the FIRST match
      // arbitrarily. Throwing here surfaces the conflict at save
      // time (caller renders to the user) instead of letting it
      // bake into the saved list. Match is case-insensitive +
      // trimmed because users routinely type "Alice" then "alice"
      // and don't expect those to be different contacts.
      const trimmedName = name.trim();
      const nameTaken = contacts.some(
        (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      );
      if (nameTaken) {
        throw new Error(
          `You already have a contact named "${trimmedName}". Pick a different nickname.`,
        );
      }

      const updated = [...contacts, { name: trimmedName, address }];
      // Optimistic; reverted on POST failure.
      setContacts(updated);

      try {
        const res = await fetch('/api/user/preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress, contacts: updated }),
        });
        if (!res.ok) {
          setContacts(contacts);
          throw new Error(`Failed to save contact (HTTP ${res.status})`);
        }
        // Re-trigger backfill for the new row on next render — clearing
        // the per-session flag is safe because the backfill endpoint is
        // idempotent and only RPCs unchecked rows.
        backfillDoneRef.current = false;
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

  // [SPEC 10 D.5] Rename a saved contact — re-POSTs the entire list with
  // the row's `name` updated. Match by address (case-insensitive). No-ops
  // if the contact doesn't exist (defensive). The backend re-canonicalises
  // through `parseContactList`, so ancillary fields (audricUsername,
  // resolvedAddress, etc.) survive the round-trip.
  const renameContact = useCallback(
    async (address: string, newName: string) => {
      if (!userAddress) return;
      const trimmed = newName.trim();
      if (!trimmed) throw new Error('Name cannot be empty');
      const target = address.toLowerCase();
      const existing = contacts.find((c) => c.address.toLowerCase() === target);
      if (!existing) return;
      // [B3 polish] Same name-collision check as addContact, but
      // ignoring the row being renamed (otherwise renaming "Mom" → "Mom"
      // would block itself). Catches the case where the user renames
      // "Old Mom" → "Mom" while a different "Mom" already exists.
      const nameTaken = contacts.some(
        (c) =>
          c.address.toLowerCase() !== target &&
          c.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (nameTaken) {
        throw new Error(
          `You already have another contact named "${trimmed}". Pick a different nickname.`,
        );
      }
      const updated = contacts.map((c) =>
        c.address.toLowerCase() === target ? { ...c, name: trimmed } : c,
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
          throw new Error(`Failed to rename contact (HTTP ${res.status})`);
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
    renameContact,
    isKnownAddress,
    resolveContact,
    refetch: fetchContacts,
  };
}
