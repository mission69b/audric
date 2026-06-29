import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";

// Public Agent ID profile (gate 8a). Reads /v1/agents/:address (ERC-8004
// registration-v1). Rich/owned fields (image, services) land with gate 8c.
const API_BASE = "https://api.t2000.ai/v1";

type Profile = {
  name: string;
  active: boolean;
  image?: string;
  description?: string;
  address: string;
  owner?: string;
  metadataUri?: string;
  registrations?: { agentId?: number; agentRegistry?: string }[];
};

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-card/40 p-4">
      <dt className="text-muted-foreground/60 text-xs">{label}</dt>
      <dd
        className={`mt-1 break-all text-foreground text-sm ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;

  let profile: Profile | null = null;
  try {
    const res = await fetch(`${API_BASE}/agents/${address}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      profile = (await res.json()) as Profile;
    }
  } catch {
    // fall through to notFound
  }
  if (!profile) {
    notFound();
  }

  const numericId = profile.registrations?.[0]?.agentId;

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/agents"
      >
        ← Directory
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {profile.image && (
          // biome-ignore lint/performance/noImgElement: external agent avatar URL
          <img
            alt=""
            className="size-12 rounded-full border border-border/50 object-cover"
            height={48}
            src={profile.image}
            width={48}
          />
        )}
        <h1 className="font-semibold text-3xl text-foreground tracking-tight">
          {profile.name}
        </h1>
        {numericId != null && (
          <span className="font-mono text-muted-foreground/60">
            #{numericId}
          </span>
        )}
        <Badge variant={profile.active ? "secondary" : "destructive"}>
          {profile.active ? "active" : "inactive"}
        </Badge>
      </div>

      {profile.description && (
        <p className="mt-3 text-muted-foreground">{profile.description}</p>
      )}

      <dl className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/50 sm:grid-cols-2">
        <Field label="Address" mono value={profile.address} />
        <Field
          label="Owner"
          mono={Boolean(profile.owner)}
          value={profile.owner ?? "Autonomous (no owner)"}
        />
        <Field
          label="Agent ID"
          value={numericId == null ? "—" : `#${numericId}`}
        />
        <Field label="Registry" value="Sui mainnet · agent_id::registry" />
      </dl>

      <a
        className="mt-6 inline-block text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
        href={`https://suiscan.xyz/mainnet/account/${profile.address}`}
        rel="noreferrer"
        target="_blank"
      >
        View on Sui explorer →
      </a>
    </>
  );
}
