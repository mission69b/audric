// [PHASE 9] Contacts panel — NOTES tab mock stub.
//
// The new design shows a NOTES tab on each contact's detail pane with the
// empty state copy "No notes — click to add." There is no notes column on
// the saved-contacts model today (`useContacts` only stores name + address)
// and no API for per-contact freeform notes.
//
// Per Hard Rule 10 of IMPLEMENTATION_PLAN.md ("If the design shows a UI
// element that has no current data source, it gets a typed mock stub with
// `// TODO: wire to real source`"), `getMockContactNotes()` is wired up so
// the tab renders the empty state from a typed mock instead of inline
// constants. When notes get a real backend, replace this stub and delete
// the mock.
//
// TODO: wire to real source. Likely shape: `Note { id, contactAddress,
// body, createdAt, updatedAt }` + per-contact CRUD via
// `/api/user/contacts/[address]/notes`.

export interface ContactNote {
  id: string;
  body: string;
  createdAt: number;
}

export function getMockContactNotes(_contactAddress: string): ContactNote[] {
  // Intentionally empty so every contact renders the design's "No notes —
  // click to add." empty state. When the real backend exists, swap this for
  // a hook that returns real notes.
  return [];
}
