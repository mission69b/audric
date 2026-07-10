import {
  getAgentProfileByNumericId,
  getUserById,
  getUserByUsername,
  meetsSettleFloor,
} from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { CopyButton } from "@/components/copy-button";
import { buildAgentPrompt } from "@/lib/agent-prompt";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
import { formatDate } from "@/lib/format";

// Public agent profile (agents.t2000.ai/<id>) — identity-first (SPEC_HUB_V1):
// who the agent is, what it sells (as copyable commands — machine-first, no
// in-browser checkout), and the receipt-backed record. Reads
// /v1/agents/:address (ERC-8004 registration-v1).
const API_BASE = "https://api.t2000.ai/v1";
// The public x402 rail alias — any x402 client can buy through this URL.
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
  services?: {
    slug: string;
    title: string;
    description: string;
    priceUsdc: string;
    input?: string | null;
    active?: boolean;
  }[];
  links?: { website?: string; twitter?: string; github?: string };
  reputation?: {
    sales: number;
    volumeUsd: number;
    buyers: number;
    repeatBuyers?: number;
    refunds?: number;
    deliveredRate?: number | null;
    lastSaleAt: string | null;
    recent?: {
      at: string;
      buyer: string;
      amountUsd: number;
      delivered: boolean;
      tx?: string;
    }[];
  };
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
  const price = profile.priceUsdc ? ` — $${profile.priceUsdc}/call` : "";
  return {
    title: `${profile.name}${price}`,
    description:
      profile.description?.split("\n")[0] ??
      "An autonomous agent with on-chain identity on the t2000 hub.",
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: segment } = await params;

  // Vanity URLs: agents.t2000.ai/@handle → the canonical listing.
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
  // A purchasable service needs a DELIVERY endpoint; sub-floor prices are
  // unbuyable (every settle 400s) and self-delist (S.677).
  const catalog = (profile.services ?? []).filter(
    (s) => s.active !== false && meetsSettleFloor(s.priceUsdc)
  );
  const defaultPriceOk = meetsSettleFloor(profile.priceUsdc);
  const hasDefaultListing = Boolean(
    profile.mcpEndpoint && profile.priceUsdc && defaultPriceOk
  );
  const sells =
    catalog.length > 0 || Boolean(profile.mcpEndpoint && defaultPriceOk);
  const priceOnly = Boolean(
    !profile.mcpEndpoint && profile.priceUsdc && defaultPriceOk
  );
  const rep = profile.reputation;
  const buyUrl = `${RAIL_BASE}/commerce/pay/${profile.address}`;

  const serviceRows =
    catalog.length > 0
      ? catalog.map((svc) => ({
          slug: svc.slug as string | null,
          title: svc.title,
          rowDescription: svc.description.split("\n")[0] ?? null,
          priceUsdc: svc.priceUsdc as string | null,
          input: svc.input ?? null,
          rowBuyUrl: `${buyUrl}/${svc.slug}`,
        }))
      : hasDefaultListing || profile.mcpEndpoint
        ? [
            {
              slug: null as string | null,
              title: profile.name,
              rowDescription: profile.description?.split("\n")[0] ?? null,
              priceUsdc: (profile.priceUsdc ?? null) as string | null,
              input: null as string | null,
              rowBuyUrl: buyUrl,
            },
          ]
        : [];

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Hub
      </Link>

      {/* Header — monogram tile + display name + the receipt-backed pill. */}
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
            {(rep?.sales ?? 0) > 0 && (
              <span className="ag-verified">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="12"
                  viewBox="0 0 16 16"
                  width="12"
                >
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
                Verified
              </span>
            )}
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

      {/* Reputation strip — every number derives from settlement receipts. */}
      {sells && rep && (
        <div className="ag-card mt-6 grid grid-cols-2 overflow-hidden sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ["Sold", String(rep.sales)],
              ["Distinct buyers", String(rep.buyers)],
              ["Settled", `$${rep.volumeUsd.toFixed(2)}`],
              [
                "Delivered",
                typeof rep.deliveredRate === "number"
                  ? `${Math.round(rep.deliveredRate * 100)}%`
                  : rep.sales > 0
                    ? "100%"
                    : "—",
              ],
              ["Agent ID", numericId == null ? "—" : `#${numericId}`],
            ] as const
          ).map(([k, v], i) => (
            <div
              className={`px-5 py-4 ${i > 0 ? "border-border/50 border-l" : ""}`}
              key={k}
            >
              <div className="font-mono text-[10px] text-fg-subtle uppercase tracking-[0.08em]">
                {k}
              </div>
              <div className="mt-1.5 font-semibold text-[22px] text-foreground tabular-nums tracking-tight">
                {v}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Services — machine-first: the paste-prompt + the commands. */}
      {sells && serviceRows.length > 0 && (
        <>
          <div className="ag-eyebrow mt-8">{"// SERVICES"}</div>
          <div className="mt-4 grid gap-4">
            {serviceRows.map((row) => {
              const agentPrompt = buildAgentPrompt({
                name: profile.name,
                numericId,
                address: profile.address,
                priceUsdc: row.priceUsdc,
                description: row.rowDescription,
                slug: row.slug,
                serviceTitle: row.slug ? row.title : null,
                input: row.input,
              });
              const cliCmd = `t2 agent pay ${profile.address}${row.slug ? ` --service ${row.slug}` : ""}`;
              return (
                <div className="ag-card p-5" key={row.slug ?? "default"}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold text-[16px] text-foreground tracking-[-0.016em]">
                      {row.title}
                      {row.slug && (
                        <span className="ml-2 font-mono text-[11px] text-fg-subtle">
                          /{row.slug}
                        </span>
                      )}
                    </div>
                    {row.priceUsdc && (
                      <div className="font-mono text-[14px] text-foreground">
                        ${row.priceUsdc}
                        <span className="text-fg-subtle text-xs">/call</span>
                      </div>
                    )}
                  </div>
                  {row.rowDescription && (
                    <p className="mt-1.5 mb-0 text-[13.5px] text-muted-foreground leading-relaxed">
                      {row.rowDescription}
                    </p>
                  )}
                  {row.input && (
                    <p className="mt-1.5 mb-0 text-fg-subtle text-xs">
                      Input: <span className="font-mono">{row.input}</span>
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-3">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-[12.5px] text-foreground">
                          Paste into your agent
                        </div>
                        <CopyButton text={agentPrompt} />
                      </div>
                      <pre
                        className="mt-1.5 mb-0 max-h-44 overflow-auto whitespace-pre-wrap rounded-[10px] border p-3 font-mono text-[11.5px] text-muted-foreground leading-relaxed"
                        style={{
                          background: "#0d0d0d",
                          borderColor: "var(--ag-border)",
                        }}
                      >
                        {agentPrompt}
                      </pre>
                    </div>
                    <div className="grid gap-2 text-[11.5px] sm:grid-cols-2">
                      <div
                        className="overflow-x-auto rounded-[10px] border p-3 font-mono text-muted-foreground"
                        style={{
                          background: "#0d0d0d",
                          borderColor: "var(--ag-border)",
                        }}
                      >
                        <span className="text-fg-subtle">$ </span>
                        {cliCmd}
                      </div>
                      <div
                        className="overflow-x-auto rounded-[10px] border p-3 font-mono text-muted-foreground"
                        style={{
                          background: "#0d0d0d",
                          borderColor: "var(--ag-border)",
                        }}
                      >
                        <span className="text-fg-subtle">$ </span>
                        curl {row.rowBuyUrl}
                        <span className="text-fg-subtle">
                          {"  # → 402 terms"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {!rep && (
            <p className="mt-2 text-fg-subtle text-xs">
              New listing — no settled sales yet.
            </p>
          )}
          {rep && rep.sales === 0 && (
            <p className="mt-2 text-fg-muted text-xs">
              <span className="text-destructive">⚠</span> No successful
              deliveries yet.
            </p>
          )}
          <p className="mt-4 text-fg-subtle text-xs">
            Pay on delivery — a failed delivery refunds you automatically. You
            pay exactly the listed price; the 2.5% platform fee comes out of the
            seller&apos;s side at settlement.
            {rep &&
              " Every number above derives from on-chain settlement receipts, not self-reports."}
          </p>
        </>
      )}

      {/* Recent activity — the last paid attempts, straight from the ledger. */}
      {rep?.recent && rep.recent.length > 0 && (
        <section className="mt-10">
          <div className="ag-eyebrow">{"// RECENT ACTIVITY"}</div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2
              className="ag-title"
              style={{ fontSize: "clamp(26px, 3vw, 36px)" }}
            >
              Every sale, on-chain.
            </h2>
            <p className="m-0 max-w-[320px] text-fg-subtle text-xs leading-relaxed">
              The reputation above is computed from these settlements — each
              delivered row links to its Sui transaction.
            </p>
          </div>
          <div className="ag-card mt-3 divide-y divide-border/50 overflow-hidden">
            {rep.recent.map((r) => {
              const row = (
                <>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={
                        r.delivered ? "text-emerald-500" : "text-destructive"
                      }
                    >
                      {r.delivered ? "✓" : "↩"}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {r.delivered ? "Delivered to" : "Auto-refunded"}{" "}
                      <span className="font-mono text-foreground text-xs">
                        {r.buyer}
                      </span>
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="font-medium text-foreground">
                      ${r.amountUsd.toFixed(2)}
                    </span>
                    <span className="text-fg-subtle text-xs">
                      {formatDate(r.at)}
                    </span>
                    {r.tx && (
                      <span className="text-fg-subtle text-xs underline decoration-border underline-offset-4">
                        tx ↗
                      </span>
                    )}
                  </div>
                </>
              );
              return r.tx ? (
                <a
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-[color:var(--ag-overlay)]"
                  href={`${SUISCAN}/tx/${r.tx}`}
                  key={`${r.at}-${r.buyer}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {row}
                </a>
              ) : (
                <div
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                  key={`${r.at}-${r.buyer}`}
                >
                  {row}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Price-only agents: honest framing — a payment target, not a service. */}
      {priceOnly && (
        <div className="mt-6 rounded-2xl border border-border/50 bg-card/40 p-5">
          <div className="font-medium text-foreground text-sm">
            Not selling a deliverable service
          </div>
          <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
            This agent has declared a price (${profile.priceUsdc}) but no
            delivery endpoint. Paying it transfers USDC to the agent (minus the
            2.5% fee) with an on-chain receipt — you will NOT receive a service
            response. Sellers: add an endpoint with{" "}
            <span className="font-mono text-xs">t2 agent deploy</span> or{" "}
            <span className="font-mono text-xs">
              t2 agent service --mcp-endpoint
            </span>
            .
          </p>
        </div>
      )}

      {/* Service wiring — buyer-facing only. */}
      {sells && (
        <Section title="Service">
          <Field label="x402 buy URL" mono value={buyUrl} />
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

      {/* The on-chain record (the scan view). */}
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
