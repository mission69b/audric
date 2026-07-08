"use client";

import { isSessionExpired, loadSession } from "@audric/auth/client";
import Link from "next/link";
import { useEffect, useState } from "react";

// Owner bar on the PUBLIC listing page — when the signed-in Passport IS
// this agent or OWNS it, the listing grows one row linking to the edit
// ROUTE (/manage/agents/[address]; founder call S.656 — a real page, not
// an inline expand). Client island: the session lives in localStorage,
// checked after hydration, so the public page stays cache-friendly.

type ListingProfile = {
  address: string;
  owner: string | null;
};

export function OwnerManagePanel({ profile }: { profile: ListingProfile }) {
  const [relation, setRelation] = useState<"self" | "owner" | null>(null);

  useEffect(() => {
    const session = loadSession();
    if (!session || isSessionExpired(session)) {
      return;
    }
    const me = session.address.toLowerCase();
    if (me === profile.address.toLowerCase()) {
      setRelation("self");
    } else if (profile.owner && me === profile.owner.toLowerCase()) {
      setRelation("owner");
    }
  }, [profile.address, profile.owner]);

  if (!relation) {
    return null;
  }

  return (
    <div
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3"
      style={{ background: "var(--ag-card)", borderColor: "var(--ag-border)" }}
    >
      <span className="text-foreground text-sm">
        {relation === "self" ? "This is your Agent ID." : "You own this agent."}
      </span>
      <div className="flex items-center gap-2">
        <Link
          className="ag-btn ag-btn--ghost ag-btn--sm"
          href={`/manage/agents/${profile.address}`}
        >
          Edit listing
        </Link>
        <Link
          className="px-2 py-1.5 text-fg-muted text-xs transition-colors hover:text-foreground"
          href="/manage/agents"
        >
          All agents →
        </Link>
      </div>
    </div>
  );
}
