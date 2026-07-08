import { createHash } from "node:crypto";
import {
  type AgentService,
  getAgentProfile,
  setAgentServices,
  validateAgentService,
} from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  agentServicesChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// Store v2 Phase 1 (SPEC_STORE_V2 §5) — the service CATALOG endpoint.
//
// POST /v1/agent/services { address, nonce, signature, services: AgentService[] }
//   → { ok, count }
// GET  /v1/agent/services?address=0x…  → { services }
//
// REPLACE semantics (manifest sync): the submitted list IS the catalog —
// `t2 agent service add/remove` read-modify-write through the same call.
// Auth: single-use challenge nonce; the signed message binds nonce + sha256 of
// the canonical services JSON, so a captured signature can't be replayed with
// a different payload. Catalog rows are DIRECTORY-level (DB) — the on-chain
// record keeps its single default pointer (registry `update` path, unchanged).
// Agent must be registered (a directory row exists) before cataloging.

function canonicalServicesJson(services: AgentService[]): string {
  // Key-sorted stable stringify — the CLI computes the identical digest.
  return JSON.stringify(
    services.map((s) =>
      Object.fromEntries(
        Object.entries(s).sort(([a], [b]) => a.localeCompare(b))
      )
    )
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  let address: string;
  try {
    address = normalizeSuiAddress(
      (url.searchParams.get("address") ?? "").trim()
    );
  } catch {
    address = "";
  }
  if (!isValidSuiAddress(address)) {
    return openAiError(
      400,
      "A valid agent Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }
  const profile = await getAgentProfile(address);
  return Response.json({ services: profile?.services ?? [] });
}

export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }

  let address: string;
  let nonce: string;
  let signature: string;
  let services: AgentService[];
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    nonce = String(body?.nonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
    if (!Array.isArray(body?.services)) {
      throw new Error("services must be an array");
    }
    services = body.services as AgentService[];
  } catch {
    return openAiError(
      400,
      "Bad request — { address, nonce, signature, services[] } required.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!isValidSuiAddress(address)) {
    return openAiError(
      400,
      "A valid agent Sui address is required.",
      "invalid_request_error",
      "invalid_address"
    );
  }
  if (!(nonce && signature)) {
    return openAiError(
      400,
      "nonce and signature are required.",
      "invalid_request_error",
      "bad_request"
    );
  }

  // Validate BEFORE burning the nonce so a rejected catalog can retry.
  try {
    for (const s of services) {
      validateAgentService(s);
    }
  } catch (e) {
    return openAiError(
      400,
      e instanceof Error ? e.message : "Invalid service.",
      "invalid_request_error",
      "invalid_service"
    );
  }

  const profile = await getAgentProfile(address);
  if (!profile) {
    return openAiError(
      400,
      "Agent not registered — run `t2 agent register` first.",
      "invalid_request_error",
      "not_registered"
    );
  }

  if (!(await consumeNonce(nonce, address))) {
    return openAiError(
      401,
      "Challenge expired or already used — request a new one via /v1/agent/challenge.",
      "invalid_request_error",
      "invalid_nonce"
    );
  }
  const digest = createHash("sha256")
    .update(canonicalServicesJson(services))
    .digest("hex");
  const message = agentServicesChallengeMessage(nonce, digest);
  if (!(await verifyAgentSignature({ address, message, signature }))) {
    return openAiError(
      401,
      "Invalid signature.",
      "invalid_request_error",
      "invalid_signature"
    );
  }

  try {
    await setAgentServices(address, services);
  } catch (e) {
    return openAiError(
      400,
      e instanceof Error ? e.message : "Could not save the catalog.",
      "invalid_request_error",
      "invalid_service"
    );
  }
  return Response.json({ ok: true, count: services.length });
}
