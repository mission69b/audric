import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { categoryLabel } from "@/components/storefront";
import { formatDate } from "@/lib/format";

// Public agent listing (agents.t2000.ai/<address>). Service-first when the
// agent sells something: price + receipt-backed stats + a copy-paste "use it"
// panel (humans get the CLI, machines get the raw x402 endpoint). The full
// on-chain record (the scan view) stays below in a disclosure.
// Reads /v1/agents/:address (ERC-8004 registration-v1).
const API_BASE = "https://api.t2000.ai/v1";
// The public x402 rail alias — any x402 client can buy through this URL
// (gateway-mediated: collect → deliver → forward).
const RAIL_BASE = "https://x402.t2000.ai";

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
  category?: string;
  links?: { website?: string; twitter?: string; github?: string };
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

function CommandBlock({
  title,
  lines,
  note,
}: {
  title: string;
  lines: [string, string?][];
  note?: string;
}) {
  return (
    <div>
      <div className="font-medium text-foreground text-sm">{title}</div>
      <div className="mt-2 overflow-x-auto rounded-xl bg-background/60 p-4 font-mono text-muted-foreground text-xs leading-relaxed">
        {lines.map(([cmd, comment]) => (
          <div key={cmd}>
            <span className="text-muted-foreground/50">$ </span>
            <span className="text-foreground">{cmd}</span>
            {comment && (
              <span className="text-muted-foreground/50"> # {comment}</span>
            )}
          </div>
        ))}
      </div>
      {note && <p className="mt-2 text-muted-foreground/60 text-xs">{note}</p>}
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
  const hasX402 = profile.paymentMethods?.includes("x402") ?? false;
  const sells = Boolean(profile.mcpEndpoint || profile.priceUsdc);
  const rep = profile.reputation;

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Agents
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
        {profile.category && (
          <Badge variant="outline">{categoryLabel(profile.category)}</Badge>
        )}
        {!profile.active && <Badge variant="destructive">inactive</Badge>}
        {profile.mcpEndpoint && <Badge variant="outline">MCP</Badge>}
        {hasX402 && <Badge variant="secondary">x402</Badge>}
      </div>

      {profile.description && (
        <p className="mt-3 max-w-2xl text-muted-foreground">
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

      {/* The offer — price + receipt-backed proof, then how to buy. */}
      {sells && (
        <div className="mt-6 rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              {profile.priceUsdc ? (
                <div className="font-semibold text-2xl text-foreground tracking-tight">
                  ${profile.priceUsdc}
                  <span className="ml-1.5 font-normal text-muted-foreground/60 text-sm">
                    USDC / call
                  </span>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  Price on request (no declared price)
                </div>
              )}
              {rep ? (
                <div className="mt-1 text-muted-foreground/70 text-xs">
                  <span className="text-emerald-500">✓</span> Verified on the
                  rail — {rep.sales} sale{rep.sales === 1 ? "" : "s"} · $
                  {rep.volumeUsd.toFixed(4)} settled · {rep.buyers} buyer
                  {rep.buyers === 1 ? "" : "s"} · last{" "}
                  {formatDate(rep.lastSaleAt)}
                </div>
              ) : (
                <div className="mt-1 text-muted-foreground/50 text-xs">
                  New listing — no settled sales yet.
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <CommandBlock
              lines={[
                ["npm i -g @t2000/cli", "once"],
                [`t2 agent pay ${profile.address}`],
              ]}
              note="Pays the declared price from your funded wallet, delivers the response, settles on Sui. Add --data '{…}' to pass input."
              title="Buy it — CLI"
            />
            <CommandBlock
              lines={[[`curl ${RAIL_BASE}/commerce/pay/${profile.address}`]]}
              note="Returns HTTP 402 + payment requirements — any x402 client can pay and get the response in one round-trip."
              title="Buy it — x402 (agents)"
            />
          </div>
          {rep && (
            <p className="mt-4 text-muted-foreground/60 text-xs">
              Sold counts come from on-chain settlement receipts — not
              self-reported.
            </p>
          )}
        </div>
      )}

      {/* Service wiring — the machine-readable endpoints. */}
      {sells && (
        <Section title="Service">
          {profile.mcpEndpoint && (
            <Field label="Endpoint" mono value={profile.mcpEndpoint} />
          )}
          <Field
            label="x402 buy URL"
            mono
            value={`${RAIL_BASE}/commerce/pay/${profile.address}`}
          />
          {profile.paymentMethods && profile.paymentMethods.length > 0 && (
            <Field
              label="Payment methods"
              value={profile.paymentMethods.join(", ")}
            />
          )}
          {profile.category && (
            <Field label="Category" value={categoryLabel(profile.category)} />
          )}
        </Section>
      )}

      {/* The on-chain record (the scan view). Leads for registry-only agents;
          folds behind a disclosure when a service leads the page. */}
      <details className="group mt-8" open={!sells}>
        <summary className="cursor-pointer list-none font-medium text-muted-foreground text-xs uppercase tracking-wide transition-colors hover:text-foreground">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">
            ›
          </span>
          On-chain record
        </summary>

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
          <Field
            label="Status"
            value={profile.active ? "Active" : "Inactive"}
          />
        </Section>

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
      </details>
    </>
  );
}
