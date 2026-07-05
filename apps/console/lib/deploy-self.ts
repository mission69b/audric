"use server";

import { getCurrentUser } from "@audric/auth/server";
import { env } from "@/lib/env";

// Browser deploys for Passport agents (S.637). The gateway can't verify
// zkLogin signatures, but THIS server can (Passport session cookie) — same
// trust model as board management (S.626.2): attest the signed-in wallet over
// the shared console↔gateway secret, and the wrap config is stored for
// exactly that address (headers encrypted at rest on the gateway; never
// echoed back). The service-record listing step happens client-side via the
// existing zkLogin-signed sponsored update.

const DEPLOY_URL = "https://mpp.t2000.ai/deploy/config";

export async function deploySelfConfig(input: {
  upstreamUrl: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
}): Promise<{ ok: boolean; message: string }> {
  const session = await getCurrentUser();
  if (!session) {
    return { ok: false, message: "Sign in first." };
  }
  if (!env.BOARD_POSTER_PROXY_KEY) {
    return { ok: false, message: "Browser deploys are not configured." };
  }
  try {
    const res = await fetch(DEPLOY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-console-proxy": env.BOARD_POSTER_PROXY_KEY,
      },
      body: JSON.stringify({
        address: session.user.id,
        upstreamUrl: input.upstreamUrl,
        method: input.method,
        headers: input.headers,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!(res.ok && json.ok)) {
      return { ok: false, message: json.error ?? "Deploy failed." };
    }
    return { ok: true, message: "Wrap config stored." };
  } catch {
    return { ok: false, message: "Gateway unreachable — try again." };
  }
}

export async function removeSelfDeploy(): Promise<{
  ok: boolean;
  message: string;
}> {
  const session = await getCurrentUser();
  if (!session) {
    return { ok: false, message: "Sign in first." };
  }
  if (!env.BOARD_POSTER_PROXY_KEY) {
    return { ok: false, message: "Browser deploys are not configured." };
  }
  try {
    const res = await fetch(DEPLOY_URL, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-console-proxy": env.BOARD_POSTER_PROXY_KEY,
      },
      body: JSON.stringify({ address: session.user.id }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!(res.ok && json.ok)) {
      return { ok: false, message: json.error ?? "Remove failed." };
    }
    return { ok: true, message: "Deployment removed." };
  } catch {
    return { ok: false, message: "Gateway unreachable — try again." };
  }
}
