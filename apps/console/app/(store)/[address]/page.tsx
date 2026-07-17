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
import { UseServiceTabs } from "@/components/use-service-tabs";
import { categoryLabel } from "@/lib/categories";
import { fetchRetry } from "@/lib/fetch-retry";
import { formatDate } from "@/lib/format";
import {
  fetchGatewayServices,
  fetchServiceStats,
  findServiceByWallet,
  serviceUrl,
} from "@/lib/gateway-services";

// Public agent page (agents.t2000.ai/<id or wallet>). Two sources compose:
// the registry profile (claimed identity) and the gateway catalog (what the
// wallet sells). [SPEC_T2_AGENTS_STORE] Zero-friction sellers have NO
// registry record — their page renders from catalog data alone with an
// "Unclaimed" chip + claim CTA (claiming = registering an Agent ID on the
// payTo wallet).
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
  if (profile) {
    return {
      title: profile.name,
      description:
        profile.description?.split("\n")[0] ??
        "An autonomous agent with on-chain identity on t2 Agents.",
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
  const services = await fetchGatewayServices();
  // What the wallet sells: the gateway catalog is the SSOT — match by
  // wallet (direct sellers pin `payTo`), render ITS data, and link to the
  // gateway service page for docs + try-it.
  const service = findServiceByWallet(services, profile?.address ?? address);
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

      {/* What it sells — gateway-catalog data when the wallet matches a
          cataloged seller; the flagship endpoint otherwise. Any x402 client
          can pay either way. */}
      {service ? (
        <section className="mt-8">
          <div className="ag-eyebrow">{"// WHAT IT SELLS"}</div>
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
                    <span className="text-fg-subtle text-[10px]">/call</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Use it — the 4-tab surface: browser try-it (Passport pays),
              your-agent command/prompt, raw x402, and the Audric deep link. */}
          <UseServiceTabs
            dialect={service.dialect}
            direct={service.direct === true}
            endpoints={service.endpoints}
            gatewayDocsUrl={serviceUrl(service)}
            serviceId={service.id}
            serviceName={service.name}
            serviceUrl={service.serviceUrl}
          />
          {(!stats || stats.sold === 0) && (
            <p className="mt-2 text-fg-subtle text-xs">
              New listing — no settled sales yet.
            </p>
          )}

          {/* Recent activity — the store-era "Every sale, on-chain."
              treatment over the payment ledger (proxied: logged at settle;
              direct: chain-verified via /api/mpp/report). */}
          {stats && stats.recent.length > 0 && (
            <div className="mt-10">
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
                  row links to its Sui transaction.
                </p>
              </div>
              <div className="ag-card mt-3 divide-y divide-border/50 overflow-hidden">
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
            </div>
          )}
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

      {/* Unclaimed sellers: the claim CTA. Claiming = registering an Agent
          ID on the payTo wallet — the existing register flows ARE the claim
          mechanic; this page just reads the registry. */}
      {!profile && (
        <div className="ag-card mt-8 flex flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-[260px] flex-1">
            <div className="font-semibold text-[14px] text-foreground">
              Is this your API?
            </div>
            <p className="m-0 mt-1 text-[12.5px] text-fg-subtle leading-relaxed">
              This page was created from the API&apos;s own 402 challenge — it
              pays{" "}
              <span className="font-mono text-fg-muted">
                {short(walletAddress)}
              </span>
              . Claim it with that wallet to get a verified profile: custom
              name, avatar, links, and browser management. Free and gasless —
              sign in and register, or run{" "}
              <span className="font-mono text-fg-muted">t2 agent register</span>{" "}
              with the wallet key.
            </p>
          </div>
          <Link className="ag-btn ag-btn--primary no-underline" href="/manage">
            Claim this page →
          </Link>
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
      )}
    </>
  );
}
