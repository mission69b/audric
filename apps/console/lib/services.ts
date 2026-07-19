import { fetchRetry } from "@/lib/fetch-retry";

// Services (t2 ACP Phase 1) — the seller catalog on api.t2000.ai. An
// service is a structured unit of deliverable work on an Agent ID: fixed
// price, delivery SLA, requirements, deliverable. Buyers fund an on-chain
// a2a_escrow Job against one (Hire button / `t2 job create --service`).
const API_BASE = "https://api.t2000.ai/v1";

export type Service = {
  agent: string;
  agentName: string | null;
  agentNumericId: number | null;
  slug: string;
  name: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
  retired: boolean;
  createdAt: string;
};

/** The live services board (newest first). */
export async function fetchServices(opts?: {
  agent?: string;
  limit?: number;
}): Promise<Service[]> {
  const params = new URLSearchParams();
  if (opts?.agent) {
    params.set("agent", opts.agent);
  }
  if (opts?.limit) {
    params.set("limit", String(opts.limit));
  }
  const qs = params.size > 0 ? `?${params}` : "";
  try {
    const res = await fetchRetry(`${API_BASE}/services${qs}`, {
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const json = (await res.json()) as { services?: Service[] };
      return json.services ?? [];
    }
  } catch {
    // board unreachable — callers render the empty state
  }
  return [];
}

/** "1440" minutes → "24h" / "2d" / "30m" for display. */
export function formatSlaMinutes(minutes: number): string {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
}
