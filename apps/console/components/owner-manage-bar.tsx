"use client";

import { isSessionExpired, loadSession } from "@audric/auth/client";
import Link from "next/link";
import { useEffect, useState } from "react";

// Ownership affordance on the PUBLIC listing page (founder UX call,
// 2026-07-03): when the signed-in Passport IS this agent (self-agent) or OWNS
// it, surface "manage it" right here instead of making the owner dig through
// manage → agents → find-the-card. Client island — the session lives in
// localStorage, so the public page stays cache-friendly (the §II.15a.4 guard:
// no server session read at render) and this bar decides its own state after
// hydration. Deep-links to the agent's own card via the address anchor.
export function OwnerManageBar({
  agentAddress,
  owner,
}: {
  agentAddress: string;
  owner?: string | null;
}) {
  const [relation, setRelation] = useState<"self" | "owner" | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      return;
    }
    const me = session.address.toLowerCase();
    if (me === agentAddress.toLowerCase()) {
      setRelation("self");
    } else if (owner && me === owner.toLowerCase()) {
      setRelation("owner");
    }
  }, [agentAddress, owner]);

  if (!relation) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3">
      <span className="text-foreground text-sm">
        {relation === "self"
          ? "This is your Agent ID — you're signed in as this agent."
          : "You own this agent."}
      </span>
      <Link
        className="rounded-full border border-border/60 px-4 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary"
        href={`/manage/agents#${agentAddress}`}
      >
        Manage it →
      </Link>
    </div>
  );
}
