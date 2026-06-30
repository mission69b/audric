import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { formatDate } from "@/lib/format";

// Public Agent ID profile. Reads /v1/agents/:address (ERC-8004 registration-v1).
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
  priceUsdc?: string;
  reputation?: {
    sales: number;
    volumeUsd: number;
    buyers: number;
    lastSaleAt: string | null;
  };
  createdAt?: string;
  updatedAt?: string;
  registrations?: { agentId?: number; agentRegistry?: string }[];
};

const SUISCAN = "https://suiscan.xyz/mainnet";

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
      <dt className="text-muted-foreground/60 text-xs">{label}</dt>
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
  const hasX402 = profile.paymentMethods?.includes("x402") ?? false;

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Directory
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <AgentAvatar
          address={profile.address}
          imageUrl={profile.image}
          size={48}
        />
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
        {profile.mcpEndpoint && <Badge variant="outline">MCP</Badge>}
        {hasX402 && <Badge variant="secondary">x402</Badge>}
      </div>

      {profile.description && (
        <p className="mt-3 text-muted-foreground">{profile.description}</p>
      )}

      {profile.reputation && (
        <div className="mt-6 rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="flex items-center gap-2">
            <span className="text-foreground text-sm">
              ✓ Verified on the rail
            </span>
            <Badge variant="secondary">
              {profile.reputation.sales} sale
              {profile.reputation.sales === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <div className="text-muted-foreground/60 text-xs">
                Settled volume
              </div>
              <div className="font-medium text-foreground">
                ${profile.reputation.volumeUsd.toFixed(4)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground/60 text-xs">Buyers</div>
              <div className="font-medium text-foreground">
                {profile.reputation.buyers}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground/60 text-xs">Last sale</div>
              <div className="font-medium text-foreground">
                {formatDate(profile.reputation.lastSaleAt)}
              </div>
            </div>
          </div>
          <p className="mt-3 text-muted-foreground/60 text-xs">
            From real on-chain settlement receipts — not self-reported.
          </p>
        </div>
      )}

      {/* Identity — the on-chain anchor (everything Suiscan-verifiable). */}
      <Section title="Identity">
        <Field label="Agent ID" value={numericId == null ? "—" : `#${numericId}`} />
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
        <Field
          label="Status"
          value={profile.active ? "Active" : "Inactive"}
        />
      </Section>

      {/* Service — only when the agent has declared something sellable. */}
      {(profile.mcpEndpoint ||
        profile.priceUsdc ||
        (profile.paymentMethods && profile.paymentMethods.length > 0)) && (
        <Section title="Service">
          {profile.mcpEndpoint && (
            <Field label="Endpoint" mono value={profile.mcpEndpoint} />
          )}
          {profile.priceUsdc && (
            <Field label="Price" value={`$${profile.priceUsdc} USDC / call`} />
          )}
          {profile.paymentMethods && profile.paymentMethods.length > 0 && (
            <Field
              label="Payment methods"
              value={profile.paymentMethods.join(", ")}
            />
          )}
        </Section>
      )}

      {/* Metadata — on-chain pointer vs off-chain registration-v1 JSON. */}
      <Section title="Metadata">
        <Field
          href={`${API_BASE}/agents/${profile.address}`}
          label="Off-chain (registration-v1)"
          value="View JSON →"
        />
        {profile.metadataUri ? (
          <Field label="On-chain metadata URI" mono value={profile.metadataUri} />
        ) : (
          <Field
            label="On-chain metadata URI"
            value="— (DB-indexed; Walrus-pinned later)"
          />
        )}
      </Section>

      {/* Timestamps. */}
      <Section title="Timestamps">
        <Field label="Created" value={formatDate(profile.createdAt)} />
        <Field label="Last updated" value={formatDate(profile.updatedAt)} />
      </Section>
    </>
  );
}
