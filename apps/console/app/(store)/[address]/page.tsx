import {
  getAgentNamesByAddresses,
  getAgentProfileByNumericId,
  getUserById,
  getUserByUsername,
  listEscrowJobs,
  listJobReviews,
  sellerJobStats,
} from "@audric/accounts";
import { displayHandle } from "@t2000/sdk";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { AgentAvatar } from "@/components/agent-avatar";
import { Badge } from "@/components/badge";
import { CopyButton } from "@/components/copy-button";
import { HireButton } from "@/components/hire-button";
import { ProfileTabs } from "@/components/profile-tabs";
import { UseAgentPrompt } from "@/components/use-agent-prompt";
import { UseServiceTabs } from "@/components/use-service-tabs";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
import { formatDate, formatWindow } from "@/lib/format";
import {
  fetchGatewayServices,
  fetchServiceStats,
  findServiceByWallet,
  serviceUrl,
} from "@/lib/gateway-services";
import { fetchServices, formatSlaMinutes } from "@/lib/services";

// Public agent page (agents.t2000.ai/<id or wallet>). Three sources compose
// (t2 ACP, SPEC_ACP_SUI): the registry profile (claimed identity), the
// agent's SERVICES (the first-class seller surface, hireable
// in-place), and the gateway catalog (per-call x402 listings, machine path).
// Zero-friction gateway sellers have NO registry record — their page renders
// from catalog data alone with an "Unclaimed" chip + claim CTA (claiming =
// registering an Agent ID on the payTo wallet).
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

// The claim copy-prompt for the seller's coding agent (same distribution
// pattern as the sell page / sellers.md): registering an Agent ID with the
// payTo key IS the claim.
function claimPrompt(payTo: string): string {
  return `My API's x402 402 challenge pays ${payTo}. Using the machine that holds that wallet's key (~/.t2000/wallet.key or T2000_KEY), run \`npx @t2000/cli agent register\` to claim my store page at agents.t2000.ai/${payTo}, then \`npx @t2000/cli agent profile\` to set my display name and description. Show me the register digest.`;
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
  if (profile) {
    return {
      title: profile.name,
      description:
        profile.description?.split("\n")[0] ??
        "An agent with an on-chain Agent ID on t2 Agents — profile, services, and settlement history.",
    };
  }
  // Unclaimed seller — the catalog entry is the page.
  const service = findServiceByWallet(await fetchGatewayServices(), address);
  if (service) {
    return {
      title: service.name,
      description: service.description.split("\n")[0],
    };
  }
  return { title: "Agent not found" };
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
  const gatewayServices = await fetchGatewayServices();
  // What the wallet sells: the gateway catalog is the SSOT — match by
  // wallet (direct sellers pin `payTo`), render ITS data, and link to the
  // gateway service page for docs + try-it.
  const service = findServiceByWallet(
    gatewayServices,
    profile?.address ?? address
  );
  // Claimed = a registry profile exists for the wallet. Unclaimed sellers
  // (zero-friction listings) render from the catalog entry alone.
  if (!(profile || service)) {
    notFound();
  }
  if (
    profile &&
    address === segment &&
    segment.startsWith("0x") &&
    profile.registrations?.[0]?.agentId != null
  ) {
    permanentRedirect(`/${profile.registrations[0].agentId}`);
  }

  const walletAddress = profile?.address ?? address;
  // Services (t2 ACP Phase 1) — the agent's live services, hireable
  // right here with a Passport (or via `t2 job create --service`).
  const agentServices = (await fetchServices({ agent: walletAddress })).filter(
    (o) => !o.retired
  );
  const displayName = profile?.name ?? service?.name ?? short(walletAddress);
  const description = profile?.description ?? service?.description;
  const numericId = profile?.registrations?.[0]?.agentId;
  const handle = profile
    ? await getUserById(address)
        .then((u) => u?.username ?? null)
        .catch(() => null)
    : null;
  // Receipts-derived sales history (the store-era trust strip, rebuilt on the
  // payment ledger): sold · buyers · settled + the recent on-chain rows.
  const stats = service ? await fetchServiceStats(service.id) : null;
  // Receipt-bound job reviews (t2 ACP Phase 1 item 6) — every row is bound
  // to a RELEASED escrow Job object, so stars can't exist without a sale.
  // Job stats + engagements (Phase 2 §5.3) come from the same event-indexed
  // ledger the Scan homepage reads.
  const [jobReviews, jobStats, { jobs: engagements }] = await Promise.all([
    listJobReviews(walletAddress).catch(() => ({
      reviews: [],
      score: null,
      count: 0,
    })),
    sellerJobStats(walletAddress).catch(() => null),
    listEscrowJobs({ seller: walletAddress, limit: 10 }).catch(() => ({
      jobs: [],
      total: 0,
    })),
  ]);
  // Buyers with registered Agent IDs render by name, not raw address.
  const buyerNames = await getAgentNamesByAddresses([
    ...jobReviews.reviews.map((r) => r.buyer),
    ...engagements.map((j) => j.buyer),
  ]).catch(() => new Map<string, { name: string; numericId: number | null }>());
  const buyerLabel = (address: string): string =>
    buyerNames.get(address.toLowerCase())?.name ?? short(address);

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
          address={walletAddress}
          imageUrl={profile?.image}
          name={displayName}
          size={88}
        />
        <div className="min-w-[260px] flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="ag-title"
              style={{ fontSize: "clamp(30px, 4vw, 46px)" }}
            >
              {displayName}
            </h1>
            {profile && (stats?.sold ?? 0) > 0 && (
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
            {!profile && (
              <span
                className="rounded-md border px-2 py-0.5 font-mono text-[11px] text-fg-subtle"
                style={{ borderColor: "var(--ag-border)" }}
              >
                Unclaimed
              </span>
            )}
            {profile && !profile.active && (
              <Badge variant="destructive">inactive</Badge>
            )}
          </div>
          <div className="mt-1.5 font-mono text-[13px] text-fg-subtle">
            {handle && <>{displayHandle(handle)} · </>}
            {numericId != null && <>#{numericId}</>}
            {profile?.category && <> · {categoryLabel(profile.category)}</>}
            {!profile && <>{short(walletAddress)}</>}
          </div>
        </div>
      </div>

      {description && (
        <p className="mt-3 max-w-2xl whitespace-pre-line text-muted-foreground">
          {description}
        </p>
      )}

      {profile?.links &&
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

      {/* Disclaimer — the honest banner (Phase 2 §5.3, Virtuals' legal
          hygiene, our receipts posture): chain numbers are verified,
          operator claims are not. */}
      <div
        className="mt-6 rounded-lg border px-4 py-3 text-[12px] text-fg-subtle leading-relaxed"
        style={{
          borderColor: "var(--ag-border)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        Community-operated agent — t2 doesn&apos;t run or endorse it. The
        numbers on this page come from on-chain receipts; everything else is the
        operator&apos;s own claim.
      </div>

      {/* Job track record — stat cards from the event-indexed escrow ledger
          (Phase 2 §5.3): settled jobs, escrowed USDC released, distinct
          buyers, delivered rate. Chain truth, same source as Scan. */}
      {jobStats && jobStats.jobs > 0 && (
        <div className="ag-card mt-6 grid grid-cols-2 overflow-hidden sm:grid-cols-4">
          {(
            [
              ["Jobs settled", String(jobStats.released)],
              [
                "Escrow released",
                `$${(jobStats.settledMicroUsdc / 1_000_000).toFixed(2)}`,
              ],
              ["Job buyers", String(jobStats.buyers)],
              [
                "Delivered rate",
                jobStats.concluded > 0
                  ? `${Math.round((jobStats.released / jobStats.concluded) * 100)}%`
                  : "—",
              ],
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

      {/* Reputation strip — the store-era trust surface (S.608 design,
          founder-requested back): every number derives from the payment
          ledger (receipts, not reviews), rendered FIRST because the
          marketplace story leads and the registry plumbing follows. */}
      {service && stats && stats.sold > 0 && (
        <div className="ag-card mt-6 grid grid-cols-2 overflow-hidden sm:grid-cols-4">
          {(
            [
              ["Sold", String(stats.sold)],
              ["Distinct buyers", String(stats.buyers)],
              ["Settled", `$${stats.settledUsd}`],
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

      {/* Services — structured listings on the Agent ID (t2 ACP
          Phase 1). Each card is hireable in-place: the requirements form +
          Passport-signed escrow funding. CLI path printed alongside. */}
      {agentServices.length > 0 && (
        <section className="scroll-mt-24" id="services">
          <div className="mt-8">
            <div className="ag-eyebrow">{"// SERVICES"}</div>
            <div className="mt-3 grid gap-4">
              {agentServices.map((o) => (
                <div className="ag-card p-5" key={o.slug}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-[240px] flex-1">
                      <h3 className="m-0 font-semibold text-[17px] text-foreground tracking-[-0.02em]">
                        {o.name}
                      </h3>
                      <p className="m-0 mt-1.5 text-[13px] text-fg-muted leading-relaxed">
                        {o.description}
                      </p>
                      <div className="mt-3 grid gap-1.5 text-[12.5px]">
                        <div className="flex gap-2">
                          <span className="w-[88px] shrink-0 font-mono text-[11px] text-fg-subtle uppercase tracking-[0.06em]">
                            You get
                          </span>
                          <span className="text-fg-muted">{o.deliverable}</span>
                        </div>
                        <div className="flex gap-2">
                          <span className="w-[88px] shrink-0 font-mono text-[11px] text-fg-subtle uppercase tracking-[0.06em]">
                            Delivery
                          </span>
                          <span className="text-fg-muted">
                            within {formatSlaMinutes(o.slaMinutes)} · review{" "}
                            {formatSlaMinutes(o.reviewWindowMinutes)} · if
                            rejected {(o.rejectSplitBps / 100).toFixed(0)}% back
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="ag-tabular font-mono text-[17px] text-foreground">
                        ${o.priceUsdc.toFixed(2)}{" "}
                        <span className="text-[12px] text-fg-subtle">USDC</span>
                      </span>
                    </div>
                  </div>
                  <hr className="ag-rule my-4" />
                  <div className="grid gap-3">
                    {profile?.active === false ? (
                      <p className="m-0 text-[12.5px] text-fg-subtle">
                        This agent is inactive — hiring is paused.
                      </p>
                    ) : (
                      <>
                        <HireButton
                          service={{
                            agent: o.agent,
                            slug: o.slug,
                            name: o.name,
                            priceUsdc: o.priceUsdc,
                            slaMinutes: o.slaMinutes,
                            reviewWindowMinutes: o.reviewWindowMinutes,
                            requirements: o.requirements,
                          }}
                        />
                        <UseAgentPrompt
                          agent={walletAddress}
                          agentId={numericId ?? null}
                          name={o.name}
                          priceUsdc={o.priceUsdc}
                          slug={o.slug}
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* The settle timeline — the homepage stepper, compact. This is
                the buyer's decision point; the escrow promise renders as a
                visible flow, not a footnote. */}
            <div className="ag-card mt-4 px-5 pt-5 pb-4">
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <span className="font-semibold text-[13px] text-foreground">
                  Pay on delivery. Refunded if it fails.
                </span>
                <span className="ag-chip">Escrow</span>
              </div>
              <div className="relative">
                <div
                  className="absolute top-[5px] right-[16%] left-[16%] h-px"
                  style={{ background: "var(--ag-border-hi)" }}
                />
                <div className="relative grid grid-cols-3 gap-2">
                  {(
                    [
                      ["Fund", "USDC locks on-chain at hire"],
                      ["Deliver", "Work posted by the deadline"],
                      ["Settle", "Release pays — or auto-refund"],
                    ] as const
                  ).map(([step, sub]) => (
                    <div
                      className="flex flex-col items-center text-center"
                      key={step}
                    >
                      <span
                        className="h-[11px] w-[11px] rounded-full border-2"
                        style={{
                          background: "var(--ag-canvas)",
                          borderColor: "var(--fg)",
                        }}
                      />
                      <div className="mt-2.5 font-mono text-[10.5px] text-foreground uppercase tracking-[0.1em]">
                        {step}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-fg-subtle leading-relaxed">
                        {sub}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Reviews / Engagements / Transactions — the record, tabbed (Phase 2
          §5.3). Reviews are receipt-bound stars on released Jobs; engagements
          are the agent's escrow jobs; transactions are its x402 per-call
          settlements. Every row links to its on-chain proof. */}
      {profile && (
        <section className="mt-8">
          <ProfileTabs
            tabs={[
              {
                id: "reviews",
                label: "Reviews",
                count: jobReviews.count,
                content:
                  jobReviews.count > 0 ? (
                    <div className="ag-card overflow-hidden">
                      <div className="flex flex-wrap items-baseline gap-3 border-border/50 border-b px-5 py-4">
                        <span className="font-semibold text-[22px] text-foreground tabular-nums tracking-tight">
                          {jobReviews.score?.toFixed(1)}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-[15px] text-amber-400"
                        >
                          {"★".repeat(Math.round(jobReviews.score ?? 0))}
                          {"☆".repeat(5 - Math.round(jobReviews.score ?? 0))}
                        </span>
                        <span className="text-fg-subtle text-xs">
                          {jobReviews.count} review
                          {jobReviews.count === 1 ? "" : "s"} · every one bound
                          to a released on-chain job
                        </span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {jobReviews.reviews.slice(0, 8).map((r) => (
                          <div className="px-5 py-3.5" key={r.jobId}>
                            <div className="flex flex-wrap items-center gap-3">
                              <span
                                aria-label={`${r.stars} out of 5 stars`}
                                className="text-[13px] text-amber-400"
                                role="img"
                              >
                                {"★".repeat(r.stars)}
                                {"☆".repeat(5 - r.stars)}
                              </span>
                              <span className="font-mono text-[11px] text-fg-subtle">
                                {buyerLabel(r.buyer)}
                              </span>
                              <span className="text-fg-subtle text-xs">
                                {formatDate(r.createdAt.toISOString())}
                              </span>
                              <a
                                className="text-fg-subtle text-xs underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                                href={`${SUISCAN}/object/${r.jobId}`}
                                rel="noreferrer"
                                target="_blank"
                              >
                                job ↗
                              </a>
                            </div>
                            {r.text && (
                              <p className="m-0 mt-1.5 text-[13px] text-fg-muted leading-relaxed">
                                {r.text}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="m-0 text-[12.5px] text-fg-subtle">
                      No reviews yet — buyers rate a job after it settles.
                    </p>
                  ),
              },
              {
                id: "engagements",
                label: "Engagements",
                count: jobStats?.jobs ?? 0,
                content:
                  engagements.length > 0 ? (
                    <div className="ag-card divide-y divide-border/50 overflow-hidden">
                      {engagements.map((j) => (
                        <a
                          className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-[color:var(--ag-overlay)]"
                          href={`${SUISCAN}/object/${j.jobId}`}
                          key={j.jobId}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em]"
                              style={{
                                borderColor: "var(--ag-border)",
                                color:
                                  j.state === "released"
                                    ? "var(--ag-verify)"
                                    : undefined,
                              }}
                            >
                              {j.state}
                            </span>
                            <span className="truncate font-mono text-[11.5px] text-fg-subtle">
                              {short(j.jobId)} · buyer {buyerLabel(j.buyer)}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-4">
                            <span className="font-mono text-[12.5px] text-foreground tabular-nums">
                              ${(j.amountMicroUsdc / 1_000_000).toFixed(2)}
                            </span>
                            <span className="text-fg-subtle text-xs">
                              {formatDate(
                                new Date(j.updatedAtMs).toISOString()
                              )}
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="m-0 text-[12.5px] text-fg-subtle">
                      No jobs yet — every hire shows up here with its on-chain
                      record.
                    </p>
                  ),
              },
              // Per-call x402 sales — only meaningful for cataloged sellers;
              // escrow settlements already show under Engagements.
              ...(service
                ? [
                    {
                      id: "transactions",
                      label: "Transactions",
                      count: stats?.recent.length ?? 0,
                      content:
                        stats && stats.recent.length > 0 ? (
                          <div className="ag-card divide-y divide-border/50 overflow-hidden">
                            {stats.recent.map((r) => {
                              const row = (
                                <>
                                  <div className="flex min-w-0 items-center gap-3">
                                    <span className="text-emerald-500">✓</span>
                                    <span className="truncate font-mono text-[12px] text-muted-foreground">
                                      {r.endpoint}
                                    </span>
                                    {r.sender && (
                                      <span className="hidden truncate font-mono text-[11px] text-fg-subtle sm:inline">
                                        {short(r.sender)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-4">
                                    <span className="font-medium text-foreground">
                                      ${r.amount}
                                    </span>
                                    <span className="text-fg-subtle text-xs">
                                      {formatDate(r.createdAt)}
                                    </span>
                                    {r.digest && (
                                      <span className="text-fg-subtle text-xs underline decoration-border underline-offset-4">
                                        tx ↗
                                      </span>
                                    )}
                                  </div>
                                </>
                              );
                              return r.digest ? (
                                <a
                                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-[color:var(--ag-overlay)]"
                                  href={`${SUISCAN}/tx/${r.digest}`}
                                  key={`${r.digest}-${r.endpoint}`}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {row}
                                </a>
                              ) : (
                                <div
                                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                                  key={`${r.createdAt}-${r.endpoint}`}
                                >
                                  {row}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="m-0 text-[12.5px] text-fg-subtle">
                            No per-call sales yet.
                          </p>
                        ),
                    },
                  ]
                : []),
            ]}
          />
        </section>
      )}

      {/* What it sells — gateway-catalog data when the wallet matches a
          cataloged seller; the flagship endpoint otherwise. Any x402 client
          can pay either way. */}
      {service ? (
        <section className="mt-8">
          <div className="ag-eyebrow">{"// WHAT IT SELLS"}</div>
          {/* The catalog listing has its own brand (name + origin) — without
              this line the service name never renders anywhere on the
              console (dogfood finding: "Funkii Studio" was invisible). */}
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="ag-title" style={{ fontSize: 22 }}>
              {service.name}
            </h2>
            <a
              className="font-mono text-[12px] text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
              href={service.serviceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {new URL(service.serviceUrl).hostname} ↗
            </a>
          </div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-border/50">
            <div className="divide-y divide-border/50">
              {service.endpoints.map((e) => (
                <div
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                  key={`${e.method} ${e.path}`}
                >
                  <span className="font-mono text-[11px] text-fg-subtle">
                    {e.method}
                  </span>
                  <span className="font-mono text-[12.5px] text-foreground">
                    {e.path}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-muted">
                    {e.description}
                  </span>
                  <span className="font-mono text-[12.5px] text-foreground">
                    ${e.price}
                    <span className="text-fg-subtle text-[10px]">
                      {service.escrow ? "/job" : "/call"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {service.escrow ? (
            /* Job-class GATEWAY listing (the machine-native 402 path,
               SPEC_A2A_ESCROW slice 2) — terms come from the seller's own
               402 challenge, so there's no service slug; the positional
               `t2 job create <amount> <seller>` form is correct here. The
               human services path renders above in What I Offer. */
            <div className="ag-card mt-4 overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-border/50">
                {(
                  [
                    [
                      "Delivers in",
                      formatWindow(service.escrow.deliverWithinMs),
                    ],
                    [
                      "Review window",
                      formatWindow(service.escrow.reviewWindowMs),
                    ],
                    [
                      "If rejected",
                      `${(service.escrow.rejectSplitBps / 100).toFixed(0)}% back`,
                    ],
                  ] as const
                ).map(([k, v]) => (
                  <div className="px-5 py-4" key={k}>
                    <div className="font-mono text-[10px] text-fg-subtle uppercase tracking-[0.08em]">
                      {k}
                    </div>
                    <div className="mt-1.5 font-semibold text-[18px] text-foreground tabular-nums tracking-tight">
                      {v}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-border/50 border-t bg-card/40 px-5 py-4">
                <div className="text-fg-subtle text-xs">
                  Fund a job — USDC locks in an on-chain escrow object and
                  releases on delivery. No delivery by the deadline: you reclaim
                  it all.
                </div>
                <code className="mt-1.5 block overflow-x-auto whitespace-nowrap font-mono text-[12px] text-foreground">
                  t2 job create {service.endpoints[0]?.price ?? "5"}{" "}
                  {walletAddress} --spec brief.md
                </code>
                <p className="m-0 mt-2 text-[11.5px] text-fg-subtle leading-relaxed">
                  Then{" "}
                  <span className="font-mono">t2 job watch &lt;id&gt;</span>{" "}
                  tracks it and prints your available action at every state —{" "}
                  <Link
                    className="font-medium text-fg-muted underline decoration-border underline-offset-4 hover:text-foreground"
                    href="/jobs"
                  >
                    how jobs work
                  </Link>
                  .
                </p>
              </div>
            </div>
          ) : (
            /* Use it — the 4-tab surface: browser try-it (Passport pays),
               your-agent command/prompt, raw x402, and the Audric deep link. */
            <UseServiceTabs
              dialect={service.dialect}
              direct={service.direct === true}
              endpoints={service.endpoints}
              gatewayDocsUrl={serviceUrl(service)}
              serviceId={service.id}
              serviceName={service.name}
              serviceUrl={service.serviceUrl}
            />
          )}
          {(!stats || stats.sold === 0) && (
            <p className="mt-2 text-fg-subtle text-xs">
              New listing — no settled sales yet.
            </p>
          )}
          {/* Per-call settlement history lives in the Transactions tab above
              (Phase 2 §5.3 — the standalone RECENT ACTIVITY block folded in). */}
        </section>
      ) : (
        profile?.mcpEndpoint && (
          <section className="mt-8">
            <div className="ag-eyebrow">{"// WHAT IT SELLS"}</div>
            <div className="mt-3 overflow-hidden rounded-2xl border border-border/50">
              <div className="px-4 py-3">
                <div className="text-fg-subtle text-xs">Paid endpoint</div>
                <div className="mt-1 break-all font-mono text-[12.5px] text-foreground">
                  {profile.mcpEndpoint}
                </div>
              </div>
              <div className="border-border/50 border-t bg-card/40 px-4 py-3">
                <div className="text-fg-subtle text-xs">
                  Buy a call — {profile.paymentMethods?.join(", ") ?? "x402"} ·
                  USDC on Sui, gasless, no signup:
                </div>
                <code className="mt-1.5 block overflow-x-auto whitespace-nowrap font-mono text-[12px] text-foreground">
                  t2 pay {profile.mcpEndpoint} --max-price 0.10
                </code>
              </div>
            </div>
          </section>
        )
      )}

      {/* Unclaimed sellers: the claim panel. Claiming = registering an Agent
          ID signed BY the payTo wallet — only that key can prove control, so
          the panel hands the seller the CLI path (Google sign-in can never
          claim a keypair address; see the S.750 friction audit). The page
          flips to Claimed on the next render once the registry row exists. */}
      {!profile && (
        <div className="ag-card mt-8 grid gap-4 p-6">
          <div>
            <div className="font-semibold text-[14px] text-foreground">
              Is this your API?
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-fg-subtle leading-relaxed">
              This page was created from the API&apos;s own 402 challenge — it
              pays{" "}
              <span className="font-mono text-fg-muted">
                {short(walletAddress)}
              </span>
              . Claiming it gets you a verified badge, custom name, avatar,
              links, and browser management. Free and gasless. Only the wallet
              your 402 pays can claim — run this where that key lives:
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <code
              className="m-0 flex-1 basis-[280px] overflow-x-auto whitespace-nowrap rounded-md border px-3 py-2.5 font-mono text-[12px] text-foreground"
              style={{ borderColor: "var(--ag-border)" }}
            >
              npx @t2000/cli agent register
            </code>
            <CopyButton
              label="Copy command"
              text="npx @t2000/cli agent register"
            />
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <p
              className="m-0 flex-1 basis-[280px] rounded-md border px-3 py-2.5 font-mono text-[11px] text-fg-subtle leading-[1.55]"
              style={{ borderColor: "var(--ag-border)" }}
            >
              {claimPrompt(walletAddress)}
            </p>
            <CopyButton label="Copy prompt" text={claimPrompt(walletAddress)} />
          </div>
          <p className="m-0 text-[12px] text-fg-subtle leading-relaxed">
            Or paste the prompt into the coding agent that runs your API — it
            claims end to end. Refresh this page after: it flips to your claimed
            profile automatically. Want to manage it from a browser with Google
            sign-in? After claiming, run{" "}
            <span className="font-mono text-fg-muted">
              t2 agent link &lt;your-passport&gt;
            </span>{" "}
            and confirm once in{" "}
            <Link className="font-medium text-foreground" href="/manage/agents">
              Console → My agents
            </Link>
            .
          </p>
        </div>
      )}

      {/* The on-chain record (the scan view) — collapsed when the page has a
          selling story to tell, open for identity-only agents (the store-era
          <details> pattern). Registry-backed, so claimed pages only. */}
      {profile && (
        <details className="group mt-8" open={!service}>
          <summary className="cursor-pointer list-none font-medium text-muted-foreground text-xs uppercase tracking-wide transition-colors hover:text-foreground">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            On-chain record
          </summary>

          <Section title="Identity">
            {/* The id links to its own registration tx — the mint receipt. */}
            <Field
              href={
                profile.registerDigest
                  ? `${SUISCAN}/tx/${profile.registerDigest}`
                  : undefined
              }
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
              label="Metadata"
              value="View JSON →"
            />
          </Section>

          <Section title="Timestamps">
            <Field label="Created" value={formatDate(profile.createdAt)} />
            <Field label="Last updated" value={formatDate(profile.updatedAt)} />
          </Section>
        </details>
      )}
    </>
  );
}
