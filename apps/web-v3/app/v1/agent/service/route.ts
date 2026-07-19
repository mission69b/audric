import { createHash } from "node:crypto";
import {
  getAgentProfile,
  parseServiceUpsert,
  retireService,
  SERVICE_SLUG_RE,
  type ServiceUpsert,
  upsertService,
} from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { MAX_JOB_USDC } from "@t2000/sdk";
import {
  agentServiceChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/service — t2 ACP Phase 1 (SPEC_ACP_SUI §4.1).
// Signed service CRUD: { address, nonce, signature, action, payload }.
//   action "upsert" — payload { slug, name, description, priceUsdc,
//     slaMinutes, reviewWindowMinutes?, rejectSplitBps?, requirements?,
//     deliverable }
//   action "retire" — payload { slug }
// Auth: challenge nonce + personal-message signature bound to
// sha256(canonical payload) so a captured signature can't be replayed with a
// different service. The agent must hold a registered Agent ID (the same
// accountability gate as gateway claims). Validation lives in
// @audric/accounts `parseServiceUpsert` — shared with the console's
// owner-session editor.

function servicePayloadSha256(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
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
  let action: string;
  let payload: unknown;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    nonce = String(body?.nonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
    action = String(body?.action ?? "").trim();
    payload = body?.payload;
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (!isValidSuiAddress(address)) {
    return openAiError(
      400,
      "A valid Sui address is required.",
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
  if (!(action === "upsert" || action === "retire")) {
    return openAiError(
      400,
      'action must be "upsert" or "retire".',
      "invalid_request_error",
      "invalid_action"
    );
  }

  // Validate the payload BEFORE consuming the nonce — a rejected payload
  // shouldn't burn the challenge (the client can fix and retry).
  let upsert: ServiceUpsert | undefined;
  let retireSlug: string | undefined;
  if (action === "upsert") {
    const parsed = parseServiceUpsert(payload, { maxPriceUsdc: MAX_JOB_USDC });
    if (typeof parsed === "string") {
      return openAiError(
        400,
        parsed,
        "invalid_request_error",
        "invalid_service"
      );
    }
    upsert = parsed.service;
  } else {
    retireSlug = String((payload as Record<string, unknown>)?.slug ?? "")
      .trim()
      .toLowerCase();
    if (!SERVICE_SLUG_RE.test(retireSlug)) {
      return openAiError(
        400,
        "payload.slug is required.",
        "invalid_request_error",
        "invalid_service"
      );
    }
  }

  const consumed = await consumeNonce(nonce, address);
  if (!consumed) {
    return openAiError(
      401,
      "Invalid or expired challenge — request a fresh nonce from /v1/agent/challenge.",
      "invalid_request_error",
      "invalid_nonce"
    );
  }
  const payloadHash = servicePayloadSha256(payload ?? null);
  const valid = await verifyAgentSignature({
    address,
    message: agentServiceChallengeMessage(nonce, payloadHash),
    signature,
  });
  if (!valid) {
    return openAiError(
      401,
      "Signature does not match the address (sign t2000-agent-service:<nonce>:<sha256 of payload JSON>).",
      "invalid_request_error",
      "invalid_signature"
    );
  }

  // Accountability gate: services attach to a registered Agent ID only.
  const profile = await getAgentProfile(address);
  if (!profile) {
    return openAiError(
      403,
      "No Agent ID registered for this address — run `t2 agent register` first.",
      "invalid_request_error",
      "agent_not_registered"
    );
  }

  // A deactivated or delisted Agent ID can't LIST new work (its board rows
  // are hidden too) — retiring existing rows stays allowed.
  if (upsert && (!profile.active || profile.delistedAt)) {
    return openAiError(
      403,
      "This Agent ID is deactivated — reactivate it before listing services.",
      "invalid_request_error",
      "agent_inactive"
    );
  }

  if (upsert) {
    const row = await upsertService({
      agentAddress: address,
      slug: upsert.slug,
      name: upsert.name,
      description: upsert.description,
      priceMicroUsdc: Math.round(upsert.priceUsdc * 1_000_000),
      slaMinutes: upsert.slaMinutes,
      reviewWindowMinutes: upsert.reviewWindowMinutes,
      rejectSplitBps: upsert.rejectSplitBps,
      requirements: upsert.requirements,
      deliverable: upsert.deliverable,
    });
    return Response.json({ ok: true, service: row });
  }
  const retired = await retireService(address, retireSlug as string);
  if (!retired) {
    return openAiError(
      404,
      `No live service "${retireSlug}" for this agent.`,
      "invalid_request_error",
      "service_not_found"
    );
  }
  return Response.json({ ok: true, retired: retireSlug });
}
