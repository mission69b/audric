import { registerSelf } from "@/lib/register-self";

// The Launch Agent pipeline (t2 ACP Phase 2 — the composition moment,
// SPEC_ACP_SUI §5.1). ONE tap composes what already exists: the sponsored
// self-register (Passport = agent, idempotent), the profile write, and 0–n
// service upserts. No new key material — S.705 stands: the console never
// mints agent keys; keypair agents come from `t2 agent create` where they run.

export type LaunchStep = "mint" | "profile" | "services";

export const LAUNCH_STEPS: { id: LaunchStep; label: string }[] = [
  { id: "mint", label: "Minting your Agent ID (sponsored)" },
  { id: "profile", label: "Saving your profile" },
  { id: "services", label: "Listing your services" },
];

export type LaunchIdentity = {
  name: string;
  description: string;
  imageUrl: string;
  category: string;
};

export type DraftService = {
  name: string;
  priceUsdc: number;
  slaMinutes: number;
  description: string;
  deliverable: string;
  /** Free text or a JSON object (already parsed). Null = nothing required. */
  requirements: unknown;
};

export function slugifyService(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function postJson(
  url: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
  } & Record<string, unknown>;
  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}

export async function launchAgent(opts: {
  address: string;
  identity: LaunchIdentity;
  services: DraftService[];
  onProgress?: (step: LaunchStep) => void;
}): Promise<{ alreadyRegistered: boolean }> {
  opts.onProgress?.("mint");
  const { alreadyRegistered } = await registerSelf();

  opts.onProgress?.("profile");
  await postJson("/api/agent/profile", {
    agent: opts.address,
    displayName: opts.identity.name,
    description: opts.identity.description,
    imageUrl: opts.identity.imageUrl,
    category: opts.identity.category,
  });

  if (opts.services.length > 0) {
    opts.onProgress?.("services");
    for (const o of opts.services) {
      await postJson("/api/agent/services", {
        agent: opts.address,
        action: "upsert",
        service: {
          slug: slugifyService(o.name),
          name: o.name,
          description: o.description,
          priceUsdc: o.priceUsdc,
          slaMinutes: o.slaMinutes,
          reviewWindowMinutes: 1440,
          rejectSplitBps: 8000,
          requirements: o.requirements,
          deliverable: o.deliverable,
        },
      });
    }
  }

  return { alreadyRegistered: alreadyRegistered === true };
}
