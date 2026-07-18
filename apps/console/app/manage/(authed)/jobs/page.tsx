import {
  getAgentNamesByAddresses,
  getJobReview,
  getJobSpec,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { getJob, getSuiClient } from "@t2000/sdk";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BuyerDecision,
  DeliverForm,
  ReviewForm,
} from "@/components/job-action-panel";
import { PanelHead } from "@/components/panel-head";
import { fetchRetry } from "@/lib/fetch-retry";

// /manage/jobs — the job inbox (t2 ACP Phase 2, the missing seller half of
// the browser loop). Passport agents SELL from the browser: every job hiring
// this wallet renders here with the buyer's requirements (spec store, pinned
// by the on-chain spec_hash) and an in-place Deliver form. The BUYING section
// closes the other side: delivered work renders in-band (content-addressed
// delivery), with Accept/Reject one signature away. CLI agents get the same
// inbox from `t2 job watch --mine`; this page is the human twin.

export const metadata = { title: "Job inbox" };
export const dynamic = "force-dynamic";

const API = "https://api.t2000.ai/v1";
const HEX_PREFIX_RE = /^0x/;
const SUISCAN = "https://suiscan.xyz/mainnet";

type ApiJob = {
  jobId: string;
  buyer: string;
  seller: string;
  amountUsdc: number;
  rejectSplitBps: number;
  deliverByMs: number;
  reviewWindowMs: number;
  state: "funded" | "delivered" | "released" | "rejected" | "refunded";
  deliveryHash: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

async function fetchJobs(
  key: "seller" | "buyer",
  address: string
): Promise<ApiJob[]> {
  try {
    const res = await fetchRetry(`${API}/jobs?${key}=${address}&limit=50`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json = (await res.json()) as { jobs?: ApiJob[] };
      return json.jobs ?? [];
    }
  } catch {
    // degraded read — render the empty state
  }
  return [];
}

/** Spec content for a funded job I'm selling: on-chain Job.spec_hash → the
 *  content-addressed store. Only fetched for jobs awaiting MY action. */
async function loadRequirements(jobId: string): Promise<string | null> {
  try {
    const job = await getJob(getSuiClient(), jobId);
    const content = await getJobSpec(job.specHash.replace(HEX_PREFIX_RE, ""));
    if (!content) {
      return null;
    }
    const parsed = JSON.parse(content) as {
      requirements?: unknown;
      offering?: { name?: string };
    };
    const req = parsed.requirements;
    if (req == null) {
      return null;
    }
    return typeof req === "string" ? req : JSON.stringify(req, null, 1);
  } catch {
    return null;
  }
}

/** Delivery content for a delivered job I bought. The read-model stores the
 *  event's hash base64-encoded; the spec store keys hex. CLI sellers who
 *  hashed a local file never uploaded content — null renders as hash-only. */
async function loadDelivery(deliveryHash: string): Promise<string | null> {
  try {
    const hex = Buffer.from(deliveryHash, "base64").toString("hex");
    return (await getJobSpec(hex)) ?? null;
  } catch {
    return null;
  }
}

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** "due in 5h" beats a raw timestamp — the row's job is telling you whether
 *  you need to act NOW. */
function dueIn(ms: number): string {
  const left = ms - Date.now();
  if (left <= 0) {
    return "deadline passed";
  }
  const hours = Math.floor(left / 3_600_000);
  if (hours >= 48) {
    return `due in ${Math.floor(hours / 24)}d`;
  }
  if (hours >= 1) {
    return `due in ${hours}h`;
  }
  return `due in ${Math.max(1, Math.floor(left / 60_000))}m`;
}

type Counterparty = { label: string; href: string };

function StateChip({ state }: { state: ApiJob["state"] }) {
  const tone =
    state === "released"
      ? "text-emerald-500"
      : state === "rejected" || state === "refunded"
        ? "text-amber-500"
        : "text-sky-400";
  return <span className={`font-mono text-[11px] ${tone}`}>{state}</span>;
}

function JobRow({
  job,
  side,
  counterparty,
  requirements,
  delivery,
  review,
}: {
  job: ApiJob;
  side: "seller" | "buyer";
  counterparty: Counterparty;
  requirements: string | null;
  delivery: string | null;
  review?: { stars: number; text: string | null } | null;
}) {
  const awaitingMe =
    (side === "seller" &&
      job.state === "funded" &&
      Date.now() <= job.deliverByMs) ||
    (side === "buyer" && job.state === "delivered");

  return (
    <div
      className="grid gap-3 px-5 py-4 first:border-t-0"
      style={{ borderTop: "1px solid var(--ag-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <StateChip state={job.state} />
          <Link
            className="font-medium text-[13px] text-foreground no-underline hover:underline"
            href={counterparty.href}
          >
            {counterparty.label}
          </Link>
          <span className="ag-tabular font-mono text-[13px] text-foreground">
            ${job.amountUsdc.toFixed(2)} USDC
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-fg-subtle">
          {job.state === "funded" && <span>{dueIn(job.deliverByMs)}</span>}
          <a
            className="underline decoration-border underline-offset-4 hover:text-foreground"
            href={`${SUISCAN}/object/${job.jobId}`}
            rel="noreferrer"
            target="_blank"
          >
            Job ↗
          </a>
        </div>
      </div>

      {side === "seller" && requirements && (
        <div className="grid gap-1">
          <span className="font-medium text-[12px] text-fg-muted">
            What the buyer needs
          </span>
          <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-md border border-border/60 px-3 py-2 font-mono text-[12px] text-foreground leading-relaxed">
            {requirements}
          </pre>
        </div>
      )}

      {side === "buyer" && job.state !== "funded" && (
        <div className="grid gap-1">
          <span className="font-medium text-[12px] text-fg-muted">
            Delivery
          </span>
          {delivery ? (
            <pre className="m-0 overflow-x-auto whitespace-pre-wrap rounded-md border border-border/60 px-3 py-2 font-mono text-[12px] text-foreground leading-relaxed">
              {delivery}
            </pre>
          ) : (
            <p className="m-0 text-[12px] text-fg-subtle">
              Delivered outside the store — the on-chain hash proves what the
              seller handed you.
            </p>
          )}
        </div>
      )}

      {awaitingMe &&
        (side === "seller" ? (
          <DeliverForm jobId={job.jobId} />
        ) : (
          <BuyerDecision jobId={job.jobId} />
        ))}

      {side === "buyer" && job.state === "released" && (
        <ReviewForm existing={review ?? null} jobId={job.jobId} />
      )}
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ag-card overflow-hidden">
      <div className="px-5 pt-4 pb-3">
        <h2 className="m-0 font-semibold text-[15px] text-foreground">
          {title}
        </h2>
        <p className="m-0 mt-0.5 text-[12.5px] text-fg-muted">{sub}</p>
      </div>
      {children}
    </section>
  );
}

export default async function JobInboxPage() {
  const session = await getCurrentUser();
  if (!session) {
    redirect("/manage");
  }
  const me = session.user.id;

  const [selling, buying] = await Promise.all([
    fetchJobs("seller", me),
    fetchJobs("buyer", me),
  ]);

  // Enrich only rows awaiting an action (small inboxes; a few reads).
  const requirementsById = new Map<string, string | null>();
  await Promise.all(
    selling
      .filter((j) => j.state === "funded")
      .slice(0, 10)
      .map(async (j) => {
        requirementsById.set(j.jobId, await loadRequirements(j.jobId));
      })
  );
  const deliveryById = new Map<string, string | null>();
  await Promise.all(
    buying
      .filter((j) => j.state !== "funded" && j.deliveryHash)
      .slice(0, 10)
      .map(async (j) => {
        deliveryById.set(j.jobId, await loadDelivery(j.deliveryHash as string));
      })
  );
  // Existing reviews prefill the buyer's edit form on released rows.
  const reviewById = new Map<
    string,
    { stars: number; text: string | null } | null
  >();
  await Promise.all(
    buying
      .filter((j) => j.state === "released")
      .slice(0, 10)
      .map(async (j) => {
        try {
          const r = await getJobReview(j.jobId);
          reviewById.set(j.jobId, r ? { stars: r.stars, text: r.text } : null);
        } catch {
          reviewById.set(j.jobId, null);
        }
      })
  );

  // Counterparties render as named links to their agent page, not raw 0x….
  const names = await getAgentNamesByAddresses([
    ...selling.map((j) => j.buyer),
    ...buying.map((j) => j.seller),
  ]).catch(() => new Map<string, { name: string; numericId: number | null }>());
  const counterpartyOf = (address: string): Counterparty => {
    const hit = names.get(address.toLowerCase());
    return {
      label: hit?.name ?? short(address),
      href: `/${hit?.numericId ?? address}`,
    };
  };

  return (
    <div className="max-w-[860px]">
      <PanelHead
        sub="Deliver what you sell. Settle what you bought."
        title="Job inbox"
      />
      <div className="grid gap-4">
        <Section sub="Deliver before the deadline to get paid." title="Selling">
          {selling.length === 0 ? (
            <p
              className="m-0 border-t px-5 py-4 text-[13px] text-fg-subtle"
              style={{ borderColor: "var(--ag-border)" }}
            >
              No hires yet — buyers hire from your public profile.
            </p>
          ) : (
            selling.map((j) => (
              <JobRow
                counterparty={counterpartyOf(j.buyer)}
                delivery={null}
                job={j}
                key={j.jobId}
                requirements={requirementsById.get(j.jobId) ?? null}
                side="seller"
              />
            ))
          )}
        </Section>
        <Section
          sub="Accept to pay the seller — or reject within the review window."
          title="Buying"
        >
          {buying.length === 0 ? (
            <p
              className="m-0 border-t px-5 py-4 text-[13px] text-fg-subtle"
              style={{ borderColor: "var(--ag-border)" }}
            >
              Nothing hired yet —{" "}
              <Link className="underline underline-offset-4" href="/jobs">
                browse agent services
              </Link>
              .
            </p>
          ) : (
            buying.map((j) => (
              <JobRow
                counterparty={counterpartyOf(j.seller)}
                delivery={deliveryById.get(j.jobId) ?? null}
                job={j}
                key={j.jobId}
                requirements={null}
                review={reviewById.get(j.jobId) ?? null}
                side="buyer"
              />
            ))
          )}
        </Section>
      </div>
    </div>
  );
}
