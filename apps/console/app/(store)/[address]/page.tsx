import {
  getAgentProfileByNumericId,
  getUserById,
  getUserByUsername,
} from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
import { formatDate } from "@/lib/format";

// Public agent profile (agents.t2000.ai/<id>) — identity-only (S.701): who
// the agent is and its on-chain record. Reads /v1/agents/:address
// (ERC-8004 registration-v1).
const API_BASE = "https://api.t2000.ai/v1";

type Profile = {
  name: string;
  active: boolean;
  image?: string;
  description?: string;
  address: string;
  creator?: string;
  chain?: string;
  registry?: string;
  registerDigest?: string;
  owner?: string;
  metadataUri?: string;
  mcpEndpoint?: string;
  paymentMethods?: string[];
  category?: string;
  links?: { website?: string; twitter?: string; github?: string };
  createdAt?: string;
  updatedAt?: string;
  registrations?: { agentId?: number; agentRegistry?: string }[];
};

const SUISCAN = "https://suiscan.xyz/mainnet";
const NUMERIC_SEGMENT_RE = /^\d{1,10}$/;

function short(v: string): string {
  return v.length > 16 ? `${v.slice(0, 8)}…${v.slice(-6)}` : v;
}

function Field({
  label,
  value,
  mono,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  const cls = `mt-1 break-all text-foreground text-sm ${mono ? "font-mono" : ""}`;
  return (
    <div className="bg-card/40 p-4">
      <dt className="text-fg-subtle text-xs">{label}</dt>
      {href ? (
        <dd className={cls}>
          <a
            className="underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {value}
          </a>
        </dd>
      ) : (
        <dd className={cls}>{value}</dd>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {title}
      </h2>
      <dl className="mt-3 grid gap-px overflow-hidden rounded-2xl border border-border/50 bg-border/50 sm:grid-cols-2">
        {children}
      </dl>
    </section>
  );
}

async function fetchProfile(address: string): Promise<Profile | null> {
  try {
    const res = await fetchRetry(`${API_BASE}/agents/${address}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      return (await res.json()) as Profile;
    }
  } catch {
    // fall through to null
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: seg } = await params;
  let address = decodeURIComponent(seg);
  if (NUMERIC_SEGMENT_RE.test(address)) {
    const byId = await getAgentProfileByNumericId(Number(address)).catch(
      () => undefined
    );
    if (!byId) {
      return { title: "Agent not found" };
    }
    address = byId.address;
  }
  const profile = await fetchProfile(address);
  if (!profile) {
    return { title: "Agent not found" };
  }
  return {
    title: profile.name,
    description:
      profile.description?.split("\n")[0] ??
      "An autonomous agent with on-chain identity on t2 Agents.",
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: segment } = await params;

  // Vanity URLs: agents.t2000.ai/@handle → the canonical profile.
  const decoded = decodeURIComponent(segment);
  if (decoded.startsWith("@")) {
    const owner = await getUserByUsername(decoded.slice(1));
    if (!owner) {
      notFound();
    }
    redirect(`/${owner.id}`);
  }

  // Numeric URLs are canonical (permanent on-chain ids): /2 = agent #2.
  let address = segment;
  if (NUMERIC_SEGMENT_RE.test(decoded)) {
    const byId = await getAgentProfileByNumericId(Number(decoded)).catch(
      () => undefined
    );
    if (!byId) {
      notFound();
    }
    address = byId.address;
  }

  const profile = await fetchProfile(address);
  if (!profile) {
    notFound();
  }
  if (
    address === segment &&
    segment.startsWith("0x") &&
    profile.registrations?.[0]?.agentId != null
  ) {
    permanentRedirect(`/${profile.registrations[0].agentId}`);
  }

  const numericId = profile.registrations?.[0]?.agentId;
  const handle = await getUserById(address)
    .then((u) => u?.username ?? null)
    .catch(() => null);

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← t2 Agents
      </Link>

      {/* Header — monogram tile + display name + status. */}
      <div className="mt-6 flex flex-wrap items-start gap-5">
        <AgentAvatar
          address={profile.address}
          imageUrl={profile.image}
          name={profile.name}
          size={88}
        />
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="ag-title"
              style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
            >
              {profile.name}
            </h1>
            {!profile.active && <Badge variant="destructive">inactive</Badge>}
          </div>
          <div className="mt-1.5 font-mono text-[13px] text-fg-subtle">
            {handle && <>{displayHandle(handle)} · </>}
            {numericId != null && <>#{numericId}</>}
            {profile.category && <> · {categoryLabel(profile.category)}</>}
          </div>
        </div>
      </div>

      {profile.description && (
        <p className="mt-3 max-w-2xl whitespace-pre-line text-muted-foreground">
          {profile.description}
        </p>
      )}

      {profile.links &&
        (profile.links.website ||
          profile.links.twitter ||
          profile.links.github) && (
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            {profile.links.website && (
              <a
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                href={profile.links.website}
                rel="noreferrer"
                target="_blank"
              >
                Website
              </a>
            )}
            {profile.links.twitter && (
              <a
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                href={profile.links.twitter}
                rel="noreferrer"
                target="_blank"
              >
                X
              </a>
            )}
            {profile.links.github && (
              <a
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                href={profile.links.github}
                rel="noreferrer"
                target="_blank"
              >
                GitHub
              </a>
            )}
          </div>
        )}

      {/* The on-chain record (the scan view). */}
      <Section title="Identity">
        <Field
          label="Agent ID"
          value={numericId == null ? "—" : `#${numericId}`}
        />
        <Field
          label="Chain"
          value={profile.chain === "sui:mainnet" ? "Sui · mainnet" : "Sui"}
        />
        <Field
          href={`${SUISCAN}/account/${profile.address}`}
          label="Agent wallet"
          mono
          value={short(profile.address)}
        />
        {profile.owner ? (
          <Field
            href={`${SUISCAN}/account/${profile.owner}`}
            label="Owner (Passport)"
            mono
            value={short(profile.owner)}
          />
        ) : (
          <Field label="Owner" value="Autonomous (no linked owner)" />
        )}
        <Field
          href={`${SUISCAN}/account/${profile.creator ?? profile.address}`}
          label="Creator"
          mono
          value={short(profile.creator ?? profile.address)}
        />
        {profile.registry && (
          <Field
            href={`${SUISCAN}/object/${profile.registry}`}
            label="Registry"
            mono
            value={short(profile.registry)}
          />
        )}
        {profile.registerDigest && (
          <Field
            href={`${SUISCAN}/tx/${profile.registerDigest}`}
            label="Created tx"
            mono
            value={short(profile.registerDigest)}
          />
        )}
        <Field label="Status" value={profile.active ? "Active" : "Inactive"} />
      </Section>

      {(profile.mcpEndpoint ||
        (profile.paymentMethods && profile.paymentMethods.length > 0)) && (
        <Section title="Service metadata">
          {profile.mcpEndpoint && (
            <Field label="Endpoint" mono value={profile.mcpEndpoint} />
          )}
          {profile.paymentMethods && profile.paymentMethods.length > 0 && (
            <Field
              label="Payment methods"
              value={profile.paymentMethods.join(", ")}
            />
          )}
        </Section>
      )}

      <Section title="Metadata">
        <Field
          href={`${API_BASE}/agents/${profile.address}`}
          label="Off-chain (registration-v1)"
          value="View JSON →"
        />
        {profile.metadataUri ? (
          <Field
            label="On-chain metadata URI"
            mono
            value={profile.metadataUri}
          />
        ) : (
          <Field
            label="On-chain metadata URI"
            value="— (DB-indexed; Walrus-pinned later)"
          />
        )}
      </Section>

      <Section title="Timestamps">
        <Field label="Created" value={formatDate(profile.createdAt)} />
        <Field label="Last updated" value={formatDate(profile.updatedAt)} />
      </Section>
    </>
  );
}
