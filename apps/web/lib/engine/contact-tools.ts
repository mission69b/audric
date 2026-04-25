import { buildTool } from '@t2000/engine';
import type { ToolContext } from '@t2000/engine';
import { z } from 'zod';
import type { Prisma } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';

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
 * authoritative writer/reader of `userPreferences.contacts`. They mirror
 * the `savings_goal_*` pattern (see goal-tools.ts) — Prisma-backed `call()`,
 * `permissionLevel: 'auto'` (no funds move, no need to gate), schema
 * validated by Zod.
 */

const ADDRESS_REGEX = /^0x[0-9a-fA-F]{64}$/;
const MAX_CONTACTS = 100;
const MAX_NAME_LENGTH = 50;

interface StoredContact {
  name: string;
  address: string;
}

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

function readStoredContacts(value: unknown): StoredContact[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): StoredContact[] => {
    if (!item || typeof item !== 'object') return [];
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string' || typeof rec.address !== 'string') return [];
    return [{ name: rec.name, address: rec.address }];
  });
}

export const audricSaveContactTool = buildTool({
  name: 'save_contact',
  description:
    'Save a Sui address as a named contact in the user\'s address book. ' +
    'After saving, the user can send to them by name in future requests ' +
    '(e.g. "send 5 USDC to Alex"). Idempotent on address — a second call ' +
    'with the same address updates the existing contact\'s name.',
  inputSchema: z.object({
    name: z
      .string()
      .min(1)
      .max(MAX_NAME_LENGTH)
      .describe('Friendly name for the contact (e.g. "Alex", "Mom")'),
    address: z
      .string()
      .regex(ADDRESS_REGEX, 'Must be a 0x-prefixed 64-hex Sui address')
      .describe('Full Sui address (0x followed by 64 hex chars)'),
  }),
  jsonSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Friendly name for the contact' },
      address: { type: 'string', description: 'Full Sui address (0x...)' },
    },
    required: ['name', 'address'],
  },
  isReadOnly: false,
  permissionLevel: 'auto',

  call: async (input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error('No wallet address in tool context');

    const trimmedName = input.name.trim();
    if (!trimmedName) throw new Error('Contact name cannot be empty');

    const normalizedAddr = normalizeAddress(input.address);

    const existingPrefs = await prisma.userPreferences.findUnique({
      where: { address: walletAddress },
      select: { contacts: true },
    });

    const current = readStoredContacts(existingPrefs?.contacts);

    if (current.length >= MAX_CONTACTS) {
      const sameAddrIndex = current.findIndex(
        (c) => normalizeAddress(c.address) === normalizedAddr,
      );
      if (sameAddrIndex === -1) {
        throw new Error(
          `Contact list is full (${MAX_CONTACTS} max). Remove one first.`,
        );
      }
    }

    let action: 'created' | 'updated' | 'unchanged';
    const sameAddrIndex = current.findIndex(
      (c) => normalizeAddress(c.address) === normalizedAddr,
    );

    let next: StoredContact[];
    if (sameAddrIndex >= 0) {
      const existing = current[sameAddrIndex];
      if (existing.name === trimmedName) {
        action = 'unchanged';
        next = current;
      } else {
        action = 'updated';
        next = current.map((c, i) =>
          i === sameAddrIndex ? { name: trimmedName, address: existing.address } : c,
        );
      }
    } else {
      action = 'created';
      next = [...current, { name: trimmedName, address: input.address }];
    }

    if (action !== 'unchanged') {
      await prisma.userPreferences.upsert({
        where: { address: walletAddress },
        create: {
          address: walletAddress,
          contacts: next as unknown as Prisma.InputJsonValue,
        },
        update: {
          contacts: next as unknown as Prisma.InputJsonValue,
        },
      });
    }

    const friendlyMsg =
      action === 'created'
        ? `Saved "${trimmedName}" as a contact. You can now send to them by name.`
        : action === 'updated'
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

export const audricListContactsTool = buildTool({
  name: 'list_contacts',
  description:
    'List all the contacts the user has saved in their address book. ' +
    'Use when the user asks "show me my contacts", "who do I have saved", ' +
    'or before suggesting a recipient. Returns name + address pairs.',
  inputSchema: z.object({}),
  jsonSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  isReadOnly: true,
  permissionLevel: 'auto',

  call: async (_input, context: ToolContext) => {
    const walletAddress = context.walletAddress;
    if (!walletAddress) throw new Error('No wallet address in tool context');

    const prefs = await prisma.userPreferences.findUnique({
      where: { address: walletAddress },
      select: { contacts: true },
    });

    const contacts = readStoredContacts(prefs?.contacts);

    return {
      data: {
        contacts,
        count: contacts.length,
      },
    };
  },
});
