/**
 * POST /api/contacts/save — Phase 4 server route for `save_contact`
 *
 * --- WHY THIS FILE EXISTS (v0.7c Phase 4) ---
 *
 * `save_contact` is the ONE write tool in the audric tool set that
 * has no on-chain transaction. It writes the user's contact list
 * (`userPreferences.contacts`) in NeonDB. The engine tool returns
 * synthetic data; the audric host owns the actual Prisma write.
 *
 * Legacy audric/web wires this via a `defineTool` override at
 * `apps/web/lib/engine/contact-tools.ts` that runs server-side during
 * the engine's auto-execute flow. In v0.7c we re-route through
 * AI SDK's HITL: the engine yields `tool-approval-request`, the user
 * taps Approve, and the client posts to THIS route to persist.
 *
 * The Contact-list unified shape (`{id, name, resolvedAddress, addedAt,
 * source, audricUsername?}`) is owned by `apps/web/lib/identity/
 * contact-schema.ts` — we cross-import it via the same relative-path
 * pattern as `lib/prisma.ts` (audric/web owns the schema lifecycle;
 * web-v2 consumes during the migration window).
 *
 * Idempotent on address — second call with same address updates the
 * existing contact's name. Mirrors legacy `addRecipientTool.call`
 * behavior at `contact-tools.ts` L89-180.
 *
 * Traceability: BENEFITS_SPEC_v07c.md §"Phase 4 — Mechanical write
 * tool migration"; legacy reference: audric/apps/web/lib/engine/
 * contact-tools.ts.
 */

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/audric-auth";
import {
  type Contact,
  contactFromSaveInput,
  parseContactList,
  serializeContactList,
} from "@/lib/identity/contact-schema";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "../../../../../web/lib/generated/prisma/client";

export const maxDuration = 10;

const MAX_CONTACTS = 100;

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  address: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "address must be a 0x-prefixed 32-byte hex"),
});

type SaveContactBody = z.infer<typeof bodySchema>;

export async function POST(request: NextRequest) {
  // 1. Auth gate.
  const session = await getCurrentUser();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }
  const walletAddress = session.user.id;

  // 2. Parse body.
  let body: SaveContactBody;
  try {
    const json = await request.json();
    body = bodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  // 3. Read existing contact list. parseContactList handles legacy row
  // shapes transparently — anything written by either audric/web or
  // web-v2 round-trips through the same unified validator.
  const existing = await prisma.userPreferences.findUnique({
    where: { address: walletAddress },
    select: { contacts: true },
  });
  const current = parseContactList(existing?.contacts);

  const trimmedName = body.name.trim();
  const sameAddrIndex = current.findIndex((c) => {
    // contactFromSaveInput normalizes the address; compare resolved.
    const candidate = contactFromSaveInput({
      name: trimmedName,
      address: body.address,
    });
    return c.resolvedAddress === candidate.resolvedAddress;
  });

  // 4. Apply capacity gate ONLY for genuinely new contacts.
  if (sameAddrIndex === -1 && current.length >= MAX_CONTACTS) {
    return NextResponse.json(
      {
        error: `Contact list is full (${MAX_CONTACTS} max). Remove one first.`,
      },
      { status: 400 }
    );
  }

  let action: "created" | "updated" | "unchanged";
  let next: Contact[];

  if (sameAddrIndex >= 0) {
    const existingContact = current[sameAddrIndex];
    if (existingContact.name === trimmedName) {
      action = "unchanged";
      next = current;
    } else {
      action = "updated";
      next = current.map((c, i) =>
        i === sameAddrIndex ? { ...c, name: trimmedName } : c
      );
    }
  } else {
    action = "created";
    next = [
      ...current,
      contactFromSaveInput({ name: trimmedName, address: body.address }),
    ];
  }

  // 5. Persist when content changed.
  if (action !== "unchanged") {
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
      ? `Saved "${trimmedName}" as a contact.`
      : action === "updated"
        ? `Updated contact name to "${trimmedName}".`
        : `"${trimmedName}" is already saved — no change.`;

  return NextResponse.json({
    success: true,
    action,
    name: trimmedName,
    address: body.address,
    displayText: friendlyMsg,
  });
}
