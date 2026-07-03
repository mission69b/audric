import Link from "next/link";
import { notFound } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { BuyFlowRail } from "@/components/buy-flow-rail";
import { CopyButton } from "@/components/copy-button";
import { OwnerManagePanel } from "@/components/owner-manage-panel";
import { TryItButton } from "@/components/try-it-button";
import { UseInAudric } from "@/components/use-in-audric";
import { buildAgentPrompt } from "@/lib/agent-prompt";
import { categoryLabel } from "@/lib/categories";
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
  // Copy target = the commands only (no $ prompts / # comments).
  const copyText = lines.map(([cmd]) => cmd).join("\n");
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-foreground text-sm">{title}</div>
        <CopyButton text={copyText} />
      </div>
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

async function fetchProfile(address: string): Promise<Profile | null> {
  try {
    // Same URL + revalidate as generateMetadata → Next dedupes the fetch.
    const res = await fetch(`${API_BASE}/agents/${address}`, {
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

// Per-listing tab title + share description (the store's SEO surface).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const profile = await fetchProfile(address);
  if (!profile) {
    return { title: "Agent not found" };
  }
  const price = profile.priceUsdc ? ` — $${profile.priceUsdc}/call` : "";
  return {
    title: `${profile.name}${price}`,
    description:
      profile.description?.split("\n")[0] ??
      "An autonomous agent with on-chain identity on the t2000 rail.",
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const profile = await fetchProfile(address);
  if (!profile) {
    notFound();
  }

  const numericId = profile.registrations?.[0]?.agentId;
  // A purchasable service needs a DELIVERY endpoint. Price-without-endpoint is
  // the rail's payment-only mode (money forwards, no service response) — never
  // dress that as "pay on delivery".
  const sells = Boolean(profile.mcpEndpoint);
  const priceOnly = Boolean(!profile.mcpEndpoint && profile.priceUsdc);
  const rep = profile.reputation;
  const buyUrl = `${RAIL_BASE}/commerce/pay/${profile.address}`;

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
      </div>

      <OwnerManagePanel
        profile={{
          address: profile.address,
          numericId: numericId ?? null,
          name: profile.name,
          imageUrl: profile.image ?? null,
          description: profile.description ?? null,
          priceUsdc: profile.priceUsdc ?? null,
          category: profile.category ?? null,
          website: profile.links?.website ?? null,
          twitter: profile.links?.twitter ?? null,
          github: profile.links?.github ?? null,
          mcpEndpoint: profile.mcpEndpoint ?? null,
          active: profile.active,
          owner: profile.owner ?? null,
        }}
      />

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

      {/* The offer — price + the receipt-backed trust card, then how to buy. */}
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
              {rep && rep.sales > 0 && (
                <div className="mt-1 text-muted-foreground/70 text-xs">
                  <span className="text-emerald-500">✓</span> Verified on the
                  rail
                </div>
              )}
              {rep && rep.sales === 0 && (
                <div className="mt-1 text-muted-foreground/70 text-xs">
                  <span className="text-destructive">⚠</span> No successful
                  deliveries yet
                </div>
              )}
              {!rep && (
                <div className="mt-1 text-muted-foreground/50 text-xs">
                  New listing — no settled sales yet.
                </div>
              )}
            </div>
          </div>

          {/* Trust card — every number derives from settlement receipts. */}
          {rep && (
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/50 bg-border/50 sm:grid-cols-4">
              <div className="bg-card/60 p-3">
                <div className="text-muted-foreground/60 text-xs">
                  Delivered
                </div>
                <div className="mt-0.5 font-medium text-foreground">
                  {typeof rep.deliveredRate === "number"
                    ? `${Math.round(rep.deliveredRate * 100)}%`
                    : "100%"}
                  <span className="ml-1 text-muted-foreground/50 text-xs">
                    of {rep.sales + (rep.refunds ?? 0)} paid
                  </span>
                </div>
              </div>
              <div className="bg-card/60 p-3">
                <div className="text-muted-foreground/60 text-xs">Sales</div>
                <div className="mt-0.5 font-medium text-foreground">
                  {rep.sales}
                  <span className="ml-1 text-muted-foreground/50 text-xs">
                    ${rep.volumeUsd.toFixed(2)} settled
                  </span>
                </div>
              </div>
              <div className="bg-card/60 p-3">
                <div className="text-muted-foreground/60 text-xs">Buyers</div>
                <div className="mt-0.5 font-medium text-foreground">
                  {rep.buyers}
                  {(rep.repeatBuyers ?? 0) > 0 && (
                    <span className="ml-1 text-muted-foreground/50 text-xs">
                      {rep.repeatBuyers} repeat
                    </span>
                  )}
                </div>
              </div>
              <div className="bg-card/60 p-3">
                <div className="text-muted-foreground/60 text-xs">
                  Last sale
                </div>
                <div className="mt-0.5 font-medium text-foreground">
                  {formatDate(rep.lastSaleAt)}
                </div>
              </div>
            </div>
          )}

          <BuyFlowRail />

          {/* In-browser checkout — Passport signs the x402 payment (stage 4).
              Client island: the public page never reads the session. */}
          {profile.priceUsdc && (
            <TryItButton
              name={profile.name}
              priceUsdc={profile.priceUsdc}
              seller={profile.address}
            />
          )}

          {/* Need-first Audric deep link (§II.12 C2) — prefills the QUESTION;
              Audric offers the service + price and confirms on its own card. */}
          {profile.priceUsdc && (
            <UseInAudric
              address={profile.address}
              name={profile.name}
              priceUsdc={profile.priceUsdc}
            />
          )}

          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <CommandBlock
              lines={[
                ["npm i -g @t2000/cli", "once"],
                [`t2 agent pay ${profile.address}`],
              ]}
              note="Pays the declared price from your funded wallet, delivers the response, settles on Sui. Add --data '{…}' to pass input."
              title="Buy it — CLI"
            />
            <CommandBlock
              lines={[[`curl ${buyUrl}`]]}
              note="Returns HTTP 402 + payment requirements. Any client that speaks the Sui x402 scheme (the t2000 CLI and SDK do) pays and gets the response in one round-trip."
              title="Buy it — x402 (agents)"
            />
          </div>

          {/* Prompt-first onboarding — paste the whole ask into YOUR agent. */}
          <div className="mt-5 rounded-xl bg-background/60 p-4">
            <div className="font-medium text-foreground text-sm">
              Or use it from your agent
            </div>
            <p className="mt-1 text-muted-foreground/70 text-xs">
              Copy a ready-made prompt (service, address, price, pay
              instructions) and paste it into Claude Code, Cursor, or any agent
              with the t2000 CLI or skills installed.
            </p>
            <div className="mt-3">
              <CopyButton
                full
                label="Copy the prompt for your agent"
                text={buildAgentPrompt({
                  name: profile.name,
                  numericId,
                  address: profile.address,
                  priceUsdc: profile.priceUsdc,
                  description: profile.description,
                })}
              />
            </div>
          </div>

          <p className="mt-4 text-muted-foreground/60 text-xs">
            Pay on delivery — a failed delivery refunds you automatically. You
            pay exactly the listed price; the rail's 2.5% platform fee comes out
            of the seller's side at settlement.
            {rep &&
              " Every number above derives from on-chain settlement receipts, not self-reports."}{" "}
            Reviews can only be left by verified buyers — none yet.
          </p>
        </div>
      )}

      {/* Recent activity — the last paid attempts, straight from the ledger. */}
      {rep?.recent && rep.recent.length > 0 && (
        <section className="mt-8">
          <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Recent activity
          </h2>
          <div className="mt-3 divide-y divide-border/50 overflow-hidden rounded-2xl border border-border/50 bg-card/40">
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
                    <span className="text-muted-foreground/60 text-xs">
                      {formatDate(r.at)}
                    </span>
                    {r.tx && (
                      <span className="text-muted-foreground/60 text-xs underline decoration-border underline-offset-4">
                        tx ↗
                      </span>
                    )}
                  </div>
                </>
              );
              return r.tx ? (
                <a
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
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
          <p className="mt-2 text-muted-foreground/60 text-xs">
            From the on-chain settlement ledger — every row links to its Sui
            transaction.
          </p>
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

      {/* Service wiring — buyer-facing only. The buy URL is the ONLY address a
          buyer ever needs (the seller's hosting endpoint is plumbing — it lives
          in the registration JSON for machines, not on the product page). */}
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
