"use server";

import {
  type AgentService,
  getAgentProfile,
  setAgentServices,
} from "@audric/accounts";
import { getCurrentUser } from "@audric/auth/server";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { env } from "@/lib/env";

// Console half of R1 hosted handlers (S.696) — the browser Deploy surface.
// Same trust model as the wrap lane (S.637): the gateway can't verify
// zkLogin, but THIS server holds the Passport session, so it attests the
// request over the console↔gateway secret. Unlike the wrap lane this gate
// covers OWNED agents too (S.693 ownership rule): the session must be the
// agent itself or its confirmed on-chain owner.

const GATEWAY = "https://mpp.t2000.ai";
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const IMPORT_RE = /^\s*import\s.+from\s/m;
const MAX_CODE_BYTES = 256 * 1024;

type Gate = { ok: true; agent: string } | { ok: false; message: string };

async function gate(agentRaw: string): Promise<Gate> {
  const session = await getCurrentUser();
  if (!session) {
    return { ok: false, message: "Sign in first." };
  }
  if (!env.BOARD_POSTER_PROXY_KEY) {
    return { ok: false, message: "Browser deploys are not configured." };
  }
  let agent: string;
  try {
    agent = normalizeSuiAddress(agentRaw.trim());
  } catch {
    return { ok: false, message: "Invalid agent address." };
  }
  if (agent !== session.user.id) {
    const profile = await getAgentProfile(agent);
    if (!profile || profile.owner !== session.user.id) {
      return { ok: false, message: "You don't own this agent." };
    }
  }
  return { ok: true, agent };
}

async function gatewayPost(
  path: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`${GATEWAY}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-console-proxy": env.BOARD_POSTER_PROXY_KEY as string,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return { ok: res.ok, json };
  } catch {
    return { ok: false, json: { error: "Gateway unreachable — try again." } };
  }
}

export type ServeHandlerStatus = {
  slug: string;
  active: boolean;
  sizeBytes: number;
  deployedAt: string;
  invocations: number;
  lastInvocation: {
    at: string;
    status: number;
    durationMs: number;
    error?: string;
  } | null;
};

/** Public status read (no attestation — the gateway route is public). */
export async function serveStatus(
  agent: string
): Promise<ServeHandlerStatus[]> {
  try {
    const res = await fetch(
      `${GATEWAY}/serve/status?address=${encodeURIComponent(agent)}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return [];
    }
    const json = (await res.json()) as { handlers?: ServeHandlerStatus[] };
    return json.handlers ?? [];
  } catch {
    return [];
  }
}

export async function serveLogs(
  agent: string,
  slug?: string
): Promise<
  {
    at: string;
    slug: string;
    status: number;
    durationMs: number;
    error?: string;
  }[]
> {
  try {
    const params = new URLSearchParams({ address: agent, limit: "20" });
    if (slug) {
      params.set("slug", slug);
    }
    const res = await fetch(`${GATEWAY}/serve/logs?${params}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return [];
    }
    const json = (await res.json()) as {
      invocations?: {
        at: string;
        slug: string;
        status: number;
        durationMs: number;
        error?: string;
      }[];
    };
    return json.invocations ?? [];
  } catch {
    return [];
  }
}

/** Deploy handler code + upsert its catalog SKU — the browser equivalent of
 *  `t2 agent serve deploy`. Code is write-only (the script is never echoed
 *  back; redeploying replaces it). */
export async function serveDeploy(input: {
  agent: string;
  slug: string;
  code: string;
  title: string;
  description: string;
  price: string;
}): Promise<{ ok: boolean; message: string }> {
  const g = await gate(input.agent);
  if (!g.ok) {
    return { ok: false, message: g.message };
  }
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return { ok: false, message: "Slug: [a-z0-9-], 2–40 chars." };
  }
  const code = input.code ?? "";
  if (!code.trim()) {
    return { ok: false, message: "Handler code is required." };
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    return { ok: false, message: "Handler too large (max 256 KB)." };
  }
  if (IMPORT_RE.test(code)) {
    return {
      ok: false,
      message:
        "Handlers must be self-contained (no imports) — fetch/crypto/URL are available as globals.",
    };
  }

  const deploy = await gatewayPost("/serve/deploy", {
    address: g.agent,
    slug,
    script: Buffer.from(code, "utf8").toString("base64"),
  });
  if (!deploy.ok) {
    return {
      ok: false,
      message: String(deploy.json.error ?? "Deploy failed."),
    };
  }

  // Catalog upsert (same replace semantics as /api/agent/services, S.693).
  const profile = await getAgentProfile(g.agent);
  const current = (profile?.services ?? []) as AgentService[];
  const entry: AgentService = {
    slug,
    title: input.title.trim(),
    description: input.description.trim(),
    priceUsdc: input.price.trim(),
    input: null,
    endpoint: null,
    method: "POST",
    active: true,
  };
  try {
    await setAgentServices(g.agent, [
      ...current.filter((s) => s.slug !== slug),
      entry,
    ]);
  } catch (e) {
    return {
      ok: false,
      message: `Deployed, but the listing failed: ${e instanceof Error ? e.message : "invalid service"}. Fix the fields and deploy again.`,
    };
  }
  return { ok: true, message: "Deployed + listed." };
}

export async function serveUndeploy(input: {
  agent: string;
  slug: string;
}): Promise<{ ok: boolean; message: string }> {
  const g = await gate(input.agent);
  if (!g.ok) {
    return { ok: false, message: g.message };
  }
  const res = await gatewayPost("/serve/undeploy", {
    address: g.agent,
    slug: input.slug.trim().toLowerCase(),
  });
  if (!res.ok) {
    return { ok: false, message: String(res.json.error ?? "Undeploy failed.") };
  }
  return { ok: true, message: "Undeployed — buys now fail closed (refund)." };
}

/** Vault ops — set (empty value deletes) and list (names only). */
export async function serveSecrets(input: {
  agent: string;
  op: "set" | "list";
  updates?: Record<string, string>;
}): Promise<{ ok: boolean; names: string[]; message?: string }> {
  const g = await gate(input.agent);
  if (!g.ok) {
    return { ok: false, names: [], message: g.message };
  }
  const res = await gatewayPost("/serve/secrets", {
    address: g.agent,
    op: input.op,
    ...(input.op === "set" ? { updates: input.updates ?? {} } : {}),
  });
  if (!res.ok) {
    return {
      ok: false,
      names: [],
      message: String(res.json.error ?? "Vault update failed."),
    };
  }
  return { ok: true, names: (res.json.names as string[]) ?? [] };
}
