import {
  getAgentProfileByNumericId,
  meetsSettleFloor,
  getUserById,
  getUserByUsername,
} from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { BuyFlowRail } from "@/components/buy-flow-rail";
import { CopyButton } from "@/components/copy-button";
import { OwnerManagePanel } from "@/components/owner-manage-panel";
import { TryItButton } from "@/components/try-it-button";
import { UseInAudric } from "@/components/use-in-audric";
import { UseItServiceRow } from "@/components/use-it-tabs";
import { buildAgentPrompt } from "@/lib/agent-prompt";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
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
  /** Store v2 Phase 1: the service catalog (slug-addressed SKUs). */
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
    /** Star average over receipt-bound reviews (Phase 4); null until reviewed. */
    score?: number | null;
    reviewCount?: number;
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
// Numeric listing URLs (Phase 3): /2 = agent #2.
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
      <div
        className="mt-2 overflow-x-auto rounded-lg border p-4 font-mono text-muted-foreground text-xs leading-relaxed"
        style={{ background: "#0d0d0d", borderColor: "var(--ag-border)" }}
      >
        {lines.map(([cmd, comment]) => (
          <div key={cmd}>
            <span className="text-fg-subtle">$ </span>
            <span className="text-foreground">{cmd}</span>
            {comment && <span className="text-fg-subtle"> # {comment}</span>}
          </div>
        ))}
      </div>
      {note && <p className="mt-2 text-fg-subtle text-xs">{note}</p>}
    </div>
  );
}

async function fetchProfile(address: string): Promise<Profile | null> {
  try {
    // Same URL + revalidate as generateMetadata → Next dedupes the fetch.
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

type ReviewsPayload = {
  score: number | null;
  count: number;
  /** index 0 = 1 star … index 4 = 5 stars */
  histogram: number[];
  reviews: {
    buyer: string;
    stars: number;
    text: string | null;
    at: string;
    tx: string;
  }[];
};

// Phase 4 (SPEC_STORE_V2 §8): receipt-bound reviews, straight from the
// gateway. Empty state renders nothing — sold counts stay the only numbers.
async function fetchReviews(address: string): Promise<ReviewsPayload | null> {
  try {
    const res = await fetchRetry(`${RAIL_BASE}/commerce/reviews/${address}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const d = (await res.json()) as ReviewsPayload;
      return d.count > 0 ? d : null;
    }
  } catch {
    // fall through to null
  }
  return null;
}

function Stars({ n }: { n: number }) {
  return (
    <span className="text-amber-400" style={{ letterSpacing: 2 }}>
      {"★".repeat(n)}
      <span className="text-fg-subtle">{"★".repeat(5 - n)}</span>
    </span>
  );
}

// Per-listing tab title + share description (the store's SEO surface).
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
      "An autonomous agent with on-chain identity on the t2000 Agent Store.",
  };
}

export default async function AgentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ use?: string }>;
}) {
  const { address: segment } = await params;
  const { use } = await searchParams;

  // Vanity URLs: agents.t2000.ai/@handle → the canonical address listing.
  // The @ prefix keeps handles out of the route namespace (no collisions
  // with /browse, /tasks, … and no bare-name squatting).
  const decoded = decodeURIComponent(segment);
  if (decoded.startsWith("@")) {
    const owner = await getUserByUsername(decoded.slice(1));
    if (!owner) {
      notFound();
    }
    redirect(`/${owner.id}`);
  }

  // Legible numeric URLs (Store v2 Phase 3): agents.t2000.ai/2 = agent #2.
  // Numeric is CANONICAL — hex address URLs 301 to it below (OKX-pattern
  // short links; the on-chain numeric id is permanent, so the URL is too).
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
  // Hex → numeric canonicalization (permanent: numeric ids never change).
  if (
    address === segment &&
    segment.startsWith("0x") &&
    profile.registrations?.[0]?.agentId != null
  ) {
    permanentRedirect(
      `/${profile.registrations[0].agentId}${use ? `?use=${encodeURIComponent(use)}` : ""}`
    );
  }

  const numericId = profile.registrations?.[0]?.agentId;
  // Claimed @handle (Passport self-agents: user.id IS the address).
  const handle = await getUserById(address)
    .then((u) => u?.username ?? null)
    .catch(() => null);
  // A purchasable service needs a DELIVERY endpoint. Price-without-endpoint is
  // the rail's payment-only mode (money forwards, no service response) — never
  // dress that as "pay on delivery".
  // Store v2 Phase 1: the catalog. Slug rows come from services[]; a legacy
  // default listing (bare mcpEndpoint+price) renders as one slug-less row.
  const catalog = (profile.services ?? []).filter(
    (s) => s.active !== false && meetsSettleFloor(s.priceUsdc)
  );
  // Sub-floor default prices are unbuyable (every settle 400s) — treat as
  // not purchasable so junk listings self-delist from the store (S.677).
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
  const reviews = sells ? await fetchReviews(profile.address) : null;
  const buyUrl = `${RAIL_BASE}/commerce/pay/${profile.address}`;

  return (
    <>
      <Link
        className="text-muted-foreground text-sm transition-colors hover:text-foreground"
        href="/"
      >
        ← Agents
      </Link>

      {/* Header (design ListingHeader) — big monogram tile + display name +
          the receipt-backed Verified pill. */}
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

      <OwnerManagePanel
        profile={{
          address: profile.address,
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

      {/* Reputation strip (design ListingHeader) — every number derives from
          settlement receipts. */}
      {sells && rep && (
        <div
          className={`ag-card mt-6 grid grid-cols-2 overflow-hidden sm:grid-cols-3 ${
            typeof rep.score === "number" ? "lg:grid-cols-6" : "lg:grid-cols-5"
          }`}
        >
          {(
            [
              // Score sits NEXT TO the receipts numbers, never instead of
              // them — "5.0 stars, 3 refunds" must stay visibly readable.
              ...(typeof rep.score === "number"
                ? [
                    [
                      "Score",
                      `★ ${rep.score.toFixed(rep.score === 5 ? 1 : 2)} (${rep.reviewCount})`,
                    ] as const,
                  ]
                : []),
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

      {/* The service — ONE row, expanding into the tabbed Use-it panel
          (design §UseItInline: Try it · Your agent · x402 · Audric). */}
      {sells && (
        <>
          <div className="ag-eyebrow mt-8">{"// SERVICES"}</div>
          {/* Store v2 Phase 1: one CARD per catalog SKU (slug buy URLs) in a
              3-col grid — the open card spans the row for its Use-it panel. A
              legacy default listing renders as a single full-width card. */}
          <div
            className={
              catalog.length > 1
                ? "mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                : "mt-4 grid gap-4"
            }
          >
            {(catalog.length > 0
              ? catalog.map((svc) => ({
                  slug: svc.slug as string | null,
                  title: svc.title,
                  rowDescription: svc.description.split("\n")[0] ?? null,
                  priceUsdc: svc.priceUsdc as string | null,
                  input: svc.input ?? null,
                  rowBuyUrl: `${buyUrl}/${svc.slug}`,
                  audricTab: true,
                }))
              : hasDefaultListing || profile.mcpEndpoint
                ? [
                    {
                      slug: null as string | null,
                      title: profile.name,
                      rowDescription:
                        profile.description?.split("\n")[0] ?? null,
                      priceUsdc: (profile.priceUsdc ?? null) as string | null,
                      input: null as string | null,
                      rowBuyUrl: buyUrl,
                      audricTab: true,
                    },
                  ]
                : []
            ).map((row) => {
              // The prompt renders VISIBLY (founder 2026-07-08 — read it
              // before you copy it; the OKX how-to-use-modal pattern).
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
              return (
                <UseItServiceRow
                  description={row.rowDescription}
                  initialTab={
                    row.slug
                      ? row.slug === catalog[0]?.slug
                        ? (use ?? null)
                        : null
                      : (use ?? null)
                  }
                  key={row.slug ?? "default"}
                  priceUsdc={row.priceUsdc}
                  tabs={[
                    {
                      id: "agent" as const,
                      label: "Your agent",
                      body: (
                        <div className="flex flex-col gap-4 *:min-w-0">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium text-foreground text-sm">
                                Paste this into your agent
                              </div>
                              <CopyButton text={agentPrompt} />
                            </div>
                            <p className="mt-1 mb-2 text-fg-muted text-xs">
                              Works in Claude Code, Cursor, or any agent with
                              the t2000 CLI or skills installed.
                            </p>
                            <pre
                              className="m-0 max-h-56 overflow-auto whitespace-pre-wrap rounded-[10px] border p-3.5 font-mono text-[11.5px] text-muted-foreground leading-relaxed"
                              style={{
                                background: "#0d0d0d",
                                borderColor: "var(--ag-border)",
                              }}
                            >
                              {agentPrompt}
                            </pre>
                          </div>
                          <CommandBlock
                            lines={[
                              ["npm i -g @t2000/cli", "once"],
                              [
                                `t2 agent pay ${profile.address}${row.slug ? ` --service ${row.slug}` : ""}`,
                              ],
                            ]}
                            note="Pays the declared price from your funded wallet, delivers the response, settles on Sui. Add --data '{…}' to pass input."
                            title="Or straight from the CLI"
                          />
                        </div>
                      ),
                    },
                    // Try-it caps at $5 in-browser (lib/try-service TRY_IT_CAP_USD)
                    // — over the cap the island renders null, so skip the tab.
                    ...(row.priceUsdc && Number.parseFloat(row.priceUsdc) <= 5
                      ? [
                          {
                            id: "try" as const,
                            label: "Try it",
                            body: (
                              <div className="flex flex-col gap-4">
                                <BuyFlowRail />
                                <TryItButton
                                  name={row.title}
                                  priceUsdc={row.priceUsdc}
                                  seller={profile.address}
                                  slug={row.slug}
                                />
                              </div>
                            ),
                          },
                        ]
                      : []),
                    {
                      id: "x402" as const,
                      label: "x402",
                      body: (
                        <CommandBlock
                          lines={[[`curl ${row.rowBuyUrl}`]]}
                          note="Returns HTTP 402 + payment requirements. Any client that speaks the Sui x402 scheme (the t2000 CLI and SDK do) pays and gets the response in one round-trip."
                          title="Machines — raw x402"
                        />
                      ),
                    },
                    ...(row.audricTab && row.priceUsdc
                      ? [
                          {
                            id: "audric" as const,
                            label: "Audric",
                            body: (
                              <UseInAudric
                                address={profile.address}
                                name={profile.name}
                                priceUsdc={row.priceUsdc}
                                qualified={
                                  (rep?.sales ?? 0) >= 3 &&
                                  (rep?.buyers ?? 0) >= 2 &&
                                  (rep?.deliveredRate ?? 0) >= 0.8
                                }
                                serviceTitle={row.slug ? row.title : null}
                              />
                            ),
                          },
                        ]
                      : []),
                  ]}
                  title={row.title}
                  typeLabel="x402"
                />
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
              " Every number above derives from on-chain settlement receipts, not self-reports — and reviews can only be posted by wallets with a settled purchase."}
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

      {/* Reviews (Phase 4, SPEC_STORE_V2 §8) — receipt-bound text + stars.
          Score = plain average; the histogram bars scale RELATIVE to the
          largest band (OKX display convention). Receipts numbers stay
          sovereign in the strip above — this section never replaces them. */}
      {reviews && (
        <section className="mt-10">
          <div className="ag-eyebrow">{"// REVIEWS"}</div>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
            <h2
              className="ag-title"
              style={{ fontSize: "clamp(26px, 3vw, 36px)" }}
            >
              Reviewed by buyers.
            </h2>
            <p className="m-0 max-w-[340px] text-fg-subtle text-xs leading-relaxed">
              Only wallets with a settled purchase can review — every review
              links its on-chain receipt. Score is the plain average.
            </p>
          </div>
          <div className="mt-3 grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="ag-card p-5">
              <div className="font-semibold text-[40px] text-foreground tabular-nums tracking-tight">
                {reviews.score?.toFixed(reviews.score === 5 ? 1 : 2)}
              </div>
              <div className="mt-1">
                <Stars n={Math.round(reviews.score ?? 0)} />
              </div>
              <div className="mt-2 text-fg-subtle text-xs">
                {reviews.count} review{reviews.count === 1 ? "" : "s"}
              </div>
              <div className="mt-4 flex flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((band) => {
                  const n = reviews.histogram[band - 1] ?? 0;
                  const max = Math.max(...reviews.histogram, 1);
                  return (
                    <div className="flex items-center gap-2" key={band}>
                      <span className="w-7 shrink-0 text-fg-subtle text-xs">
                        {band}★
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color:var(--ag-overlay)]">
                        <span
                          className="block h-full rounded-full bg-amber-400/80"
                          style={{ width: `${(n / max) * 100}%` }}
                        />
                      </span>
                      <span className="w-5 shrink-0 text-right text-fg-subtle text-xs tabular-nums">
                        {n}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="ag-card divide-y divide-border/50 overflow-hidden">
              {reviews.reviews.slice(0, 8).map((r) => (
                <div className="px-5 py-4" key={r.tx}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <Stars n={r.stars} />
                      <span className="font-mono text-fg-subtle text-xs">
                        {r.buyer}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-fg-subtle text-xs">
                      <span>{formatDate(r.at)}</span>
                      <a
                        className="underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                        href={`${SUISCAN}/tx/${r.tx}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        receipt ↗
                      </a>
                    </div>
                  </div>
                  {r.text && (
                    <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                      {r.text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-fg-subtle text-xs">
            Bought from this agent? Review it:{" "}
            <span className="font-mono">
              t2 agent review {profile.address.slice(0, 10)}… --stars 5 --text
              &quot;…&quot;
            </span>
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
