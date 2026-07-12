import {
  AGENT_CATEGORIES,
  getAgentProfile,
  setAgentProfileFields,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/agent/profile — owner-side edit of an agent's OFF-CHAIN fields
// (displayName · imageUrl · description · category · links). Session-authed
// (the owner's Passport) + ownership-gated (the agent's confirmed on-chain
// owner must equal the session user). This is the human "manage my agent"
// path for the directory display fields.

const MAX_NAME = 80;
const MAX_DESC = 600;

function validImageUrl(url: string): boolean {
  if (url.length > 512) {
    return false;
  }
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: {
    agent?: string;
    displayName?: string | null;
    imageUrl?: string | null;
    description?: string | null;
    category?: string | null;
    website?: string | null;
    twitter?: string | null;
    github?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  let agent: string;
  try {
    agent = normalizeSuiAddress(String(body.agent ?? "").trim());
  } catch {
    return NextResponse.json({ error: "Invalid agent." }, { status: 400 });
  }

  // Ownership gate: the session user must be the agent's confirmed owner —
  // OR the agent itself (the SELF-agent: owner == agent == the Passport,
  // §II.15a stage 3).
  const profile = await getAgentProfile(agent);
  if (!profile) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  if (profile.owner !== session.user.id && agent !== session.user.id) {
    return NextResponse.json(
      { error: "You don't own this agent." },
      { status: 403 }
    );
  }

  // Build the field set — only what's provided (empty string = clear).
  const fields: {
    displayName?: string | null;
    imageUrl?: string | null;
    description?: string | null;
    category?: string | null;
    website?: string | null;
    twitter?: string | null;
    github?: string | null;
  } = {};

  // Each link: provided + non-empty must be a valid https URL; "" clears it.
  for (const key of ["website", "twitter", "github"] as const) {
    if (body[key] !== undefined) {
      const v = String(body[key] ?? "").trim();
      if (v && !validImageUrl(v)) {
        return NextResponse.json(
          { error: `${key} must be a valid https URL.` },
          { status: 400 }
        );
      }
      fields[key] = v || null;
    }
  }

  if (body.displayName !== undefined) {
    const v = String(body.displayName).trim();
    if (v.length > MAX_NAME) {
      return NextResponse.json({ error: "Name too long." }, { status: 400 });
    }
    fields.displayName = v || null;
  }
  if (body.imageUrl !== undefined) {
    const v = String(body.imageUrl).trim();
    if (v && !validImageUrl(v)) {
      return NextResponse.json(
        { error: "Image must be a valid https URL." },
        { status: 400 }
      );
    }
    fields.imageUrl = v || null;
  }
  if (body.description !== undefined) {
    const v = String(body.description).trim();
    if (v.length > MAX_DESC) {
      return NextResponse.json(
        { error: "Description too long." },
        { status: 400 }
      );
    }
    fields.description = v || null;
  }
  if (body.category !== undefined && body.category !== null) {
    const v = String(body.category).trim().toLowerCase();
    if (v && !(AGENT_CATEGORIES as readonly string[]).includes(v)) {
      return NextResponse.json(
        { error: `Category must be one of: ${AGENT_CATEGORIES.join(", ")}.` },
        { status: 400 }
      );
    }
    fields.category = v || null;
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await setAgentProfileFields(agent, fields);
  return NextResponse.json({ ok: true });
}
