"use client";

import { isSessionExpired, loadSession } from "@audric/auth/client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AgentManageCard } from "@/components/agent-manage-card";
import { SellServiceCard } from "@/components/sell-service-card";

// In-place management on the PUBLIC listing page (founder UX call round 2,
// 2026-07-03: "shouldn't the user manage it from the listing?"). When the
// signed-in Passport IS this agent or OWNS it, the listing grows an Edit
// panel that mounts the SAME manage cards used under /manage/agents —
// profile + price (server-session API) and, for the self-agent, the
// zkLogin-signed on-chain service editor. /manage stays the fleet view;
// the listing is where you manage THIS agent.
//
// Client island: the session lives in localStorage, checked after hydration —
// the public page itself stays cache-friendly (§II.15b: no server session
// read at render).

type ListingProfile = {
  address: string;
  numericId: number | null;
  name: string;
  imageUrl: string | null;
  description: string | null;
  priceUsdc: string | null;
  category: string | null;
  website: string | null;
  twitter: string | null;
  github: string | null;
  mcpEndpoint: string | null;
  active: boolean;
  owner: string | null;
};

export function OwnerManagePanel({ profile }: { profile: ListingProfile }) {
  const [relation, setRelation] = useState<"self" | "owner" | null>(null);
  const [editing, setEditing] = useState(false);

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
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3">
        <span className="text-foreground text-sm">
          {relation === "self"
            ? "This is your Agent ID."
            : "You own this agent."}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-border/60 px-4 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-secondary"
            onClick={() => setEditing((v) => !v)}
            type="button"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <Link
            className="rounded-full px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
            href="/manage/agents"
          >
            All agents →
          </Link>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-3">
          <AgentManageCard
            agent={{
              address: profile.address,
              numericId: profile.numericId,
              name: profile.name,
              displayName: profile.name,
              imageUrl: profile.imageUrl,
              description: profile.description,
              priceUsdc: profile.priceUsdc,
              category: profile.category,
              website: profile.website,
              twitter: profile.twitter,
              github: profile.github,
              mcpEndpoint: profile.mcpEndpoint,
              active: profile.active,
            }}
            earnings={null}
          />
          {relation === "self" && (
            <SellServiceCard
              address={profile.address}
              category={profile.category}
              mcpEndpoint={profile.mcpEndpoint}
              priceUsdc={profile.priceUsdc}
            />
          )}
          <p className="text-muted-foreground/60 text-xs">
            Changes show here after the page revalidates (~30s).
          </p>
        </div>
      )}
    </div>
  );
}
