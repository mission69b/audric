import { defineTool } from "@t2000/engine";
import type { ToolContext } from "@t2000/engine";
import { z } from "zod";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  type Contact,
  contactFromSaveInput,
  parseContactList,
  serializeContactList,
} from "@/lib/identity/contact-schema";

/**
 * Server-owned contact tools.
 *
 * Background — why these live in audric, not in `@t2000/engine`:
 *
 * The previous implementation stubbed `save_contact` server-side (returning
 * `{saved: true}` with no persistence) and delegated the actual write to a
 * client-side `useContacts.addContact` callback that POSTed to
 * `/api/user/preferences`. Two failure modes followed from that split:
 *
 *   1. The client `addContact` did `await fetch(...)` without checking
 *      `res.ok`. Any 4xx/5xx returned from the API silently succeeded from
 *      the LLM's perspective — the in-session React state updated, the LLM
 *      narrated "Saved", but the row never made it to Postgres. Next
 *      session: empty contacts.
 *
 *   2. There was no `list_contacts` tool, so when the user later asked
 *      "show me my contacts", the LLM either (a) recited what it remembered
 *      from the in-conversation tool result (correct in-session, useless in
 *      a new session) or (b) admitted "I don't have a list contacts tool
 *      available" and gave up.
 *
 * These tools eliminate both failures by making the server the single
 * authoritative writer/reader of `userPreferences.contacts`. They follow
 * the standard server-tool pattern — Prisma-backed `call()`,
 * `permissionLevel: 'auto'` (no funds move, no need to gate), schema
 * validated by Zod.
 *
 * SPEC 10 v0.2.1 Phase A.2 — Contact persistence now goes through the
 * unified Zod schema in `apps/web/lib/identity/contact-schema.ts`. Reads
 * normalize legacy `{name, address}` rows into the unified shape on the
 * fly; writes always emit the unified shape. Behavior preservation: the
 * tool's input schema and external response shape are unchanged (the LLM
 * still sees `{name, address}` round-trip). The unified internal shape is
 * additive enrichment for downstream consumers (UI, profile pages, send
 * autocomplete) — see SPEC 10 build-plan addendum B-5.
 */

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;
const MAX_CONTACTS = 100;
const MAX_NAME_LENGTH = 50;

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

/**
 * Project the unified Contact shape down to the `{name, address}` pair the
 * `list_contacts` tool returns to the LLM. Done at the response boundary so
 * the LLM-facing surface stays unchanged across the SPEC 10 schema migration.
 */
function projectToToolShape(c: Contact): { name: string; address: string } {
  return { name: c.name, address: c.identifier };
}

export const audricSaveContactTool = defineTool({
  name: "save_contact",
  description:
    "Save a Sui address as a named contact in the user's address book. " +
    "After saving, the user can send to them by name in future requests " +
    '(e.g. "send 5 USDC to Alex"). Idempotent on address — a second call ' +
    "with the same address updates the existing contact's name.",
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(MAX_NAME_LENGTH)
      .describe('Friendly name for the contact (e.g. "Alex", "Mom")'),
    address: z
      .string()
      .regex(ADDRESS_REGEX, "Must be a 0x-prefixed 64-hex Sui address")
      .describe("Full Sui address (0x followed by 64 hex chars)"),
  }),
  isReadOnly: false,
  permissionLevel: "auto",

  call: async (input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error("No wallet address in tool context");

    const trimmedName = input.name.trim();
    if (!trimmedName) throw new Error("Contact name cannot be empty");

    const normalizedAddr = normalizeAddress(input.address);

    const existingPrefs = await prisma.userPreferences.findUnique({
      where: { address: walletAddress },
      select: { contacts: true },
    });

    // Reads pass through the unified Zod boundary — handles legacy
    // {name, address} rows transparently (auto-migrated to unified shape).
    const current = parseContactList(existingPrefs?.contacts);

    if (current.length >= MAX_CONTACTS) {
      const sameAddrIndex = current.findIndex(
        (c) => c.resolvedAddress === normalizedAddr,
      );
      if (sameAddrIndex === -1) {
        throw new Error(
          `Contact list is full (${MAX_CONTACTS} max). Remove one first.`,
        );
      }
    }

    let action: "created" | "updated" | "unchanged";
    const sameAddrIndex = current.findIndex(
      (c) => c.resolvedAddress === normalizedAddr,
    );

    let next: Contact[];
    if (sameAddrIndex >= 0) {
      const existing = current[sameAddrIndex];
      if (existing.name === trimmedName) {
        action = "unchanged";
        next = current;
      } else {
        action = "updated";
        // Preserve everything except the name (identifier, resolvedAddress,
        // audricUsername enrichment, addedAt, source all stay as-is).
        next = current.map((c, i) =>
          i === sameAddrIndex ? { ...c, name: trimmedName } : c,
        );
      }
    } else {
      action = "created";
      next = [
        ...current,
        contactFromSaveInput({ name: trimmedName, address: input.address }),
      ];
    }

    if (action !== "unchanged") {
      // serializeContactList re-validates every row going to disk — guards
      // against programming errors elsewhere in the codebase silently
      // writing malformed contacts.
      const serialized = serializeContactList(next);
      await prisma.userPreferences.upsert({
        where: { address: walletAddress },
        create: {
          address: walletAddress,
          contacts: serialized as unknown as Prisma.InputJsonValue,
        },
        update: {
          contacts: serialized as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const friendlyMsg =
      action === "created"
        ? `Saved "${trimmedName}" as a contact. You can now send to them by name.`
        : action === "updated"
          ? `Updated contact name to "${trimmedName}".`
          : `"${trimmedName}" is already saved — no change.`;

    return {
      data: {
        saved: true,
        action,
        name: trimmedName,
        address: input.address,
        totalContacts: next.length,
        message: friendlyMsg,
      },
      displayText: friendlyMsg,
    };
  },
});

export const audricListContactsTool = defineTool({
  name: "list_contacts",
  description:
    "List all the contacts the user has saved in their address book. " +
    'Use when the user asks "show me my contacts", "who do I have saved", ' +
    "or before suggesting a recipient. Returns name + address pairs.",
  inputSchema: z.object({}),
  isReadOnly: true,
  permissionLevel: "auto",

  call: async (_input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error("No wallet address in tool context");

    const prefs = await prisma.userPreferences.findUnique({
      where: { address: walletAddress },
      select: { contacts: true },
    });

    // Project the unified Contact shape down to the tool's stable
    // {name, address} response shape — the LLM-facing surface stays
    // backward-compatible across the SPEC 10 schema migration. The richer
    // unified fields (audricUsername, source, addedAt) surface to UI
    // consumers via /api/user/preferences instead.
    const contacts = parseContactList(prefs?.contacts).map(projectToToolShape);

    return {
      data: {
        contacts,
        count: contacts.length,
      },
    };
  },
});
