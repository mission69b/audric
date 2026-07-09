import { getAgentProfile, setAgentArchived } from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { type NextRequest, NextResponse } from "next/server";

// POST /api/agent/archive — owner-side "remove from my console" (S.690).
// Off-chain display state only: hides the agent from My agents / earnings
// (or dismisses an unwanted ownership proposal). The on-chain record persists
// — the registry has no delete — and restore is one tap. Allowed for the
// agent's confirmed owner OR its proposed owner (dismissing a proposal);
// NOT for the self-agent (deactivate is the right verb there).

export async function POST(request: NextRequest) {
  const session = await getCurrentUser();
  if (!session) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { agent?: string; archived?: boolean };
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
  const archived = body.archived !== false;

  if (agent === session.user.id) {
    return NextResponse.json(
      { error: "You can't remove your own Passport — deactivate it instead." },
      { status: 400 }
    );
  }

  const profile = await getAgentProfile(agent);
  if (!profile) {
    return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  }
  const isOwner = profile.owner === session.user.id;
  // A PROPOSED owner may dismiss only while no OTHER confirmed owner exists —
  // `archivedAt` is one flag on the row, so letting a proposee archive an
  // agent that someone else owns would hide it from the real owner's console
  // (cross-user griefing via a complicit agent's proposal; S.691 hardening).
  const isProposed =
    profile.pendingOwner === session.user.id &&
    (!profile.owner || profile.owner === session.user.id);
  if (!(isOwner || isProposed)) {
    return NextResponse.json(
      { error: "You don't own this agent." },
      { status: 403 }
    );
  }

  await setAgentArchived(agent, archived);
  return NextResponse.json({ ok: true, archived });
}
