import { createHash } from "node:crypto";
import {
  getAgentProfile,
  retireOffering,
  upsertOffering,
} from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { MAX_JOB_USDC } from "@t2000/sdk";
import {
  agentOfferingChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/offering — t2 ACP Phase 1 (SPEC_ACP_SUI §4.1).
// Signed offering CRUD: { address, nonce, signature, action, payload }.
//   action "upsert" — payload { slug, name, description, priceUsdc,
//     slaMinutes, reviewWindowMinutes?, rejectSplitBps?, requirements?,
//     deliverable }
//   action "retire" — payload { slug }
// Auth: challenge nonce + personal-message signature bound to
// sha256(canonical payload) so a captured signature can't be replayed with a
// different offering. The agent must hold a registered Agent ID (the same
// accountability gate as gateway claims).

// Contract-shaped bounds — an offering that can't fund a valid a2a_escrow Job
// is rejected at LIST time, not discovered at buy time.
const MAX_SLA_MINUTES = 365 * 24 * 60; // MAX_DELIVER_HORIZON_MS
const MAX_REVIEW_MINUTES = 30 * 24 * 60; // MAX_REVIEW_WINDOW_MS
const MAX_REQUIREMENTS_BYTES = 8 * 1024;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

function offeringPayloadSha256(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

type UpsertPayload = {
  slug: string;
  name: string;
  description: string;
  priceUsdc: number;
  slaMinutes: number;
  reviewWindowMinutes: number;
  rejectSplitBps: number;
  requirements: unknown;
  deliverable: string;
};

function parseUpsert(raw: unknown): { ok: true; p: UpsertPayload } | string {
  const b = raw as Record<string, unknown>;
  const slug = String(b?.slug ?? "")
    .trim()
    .toLowerCase();
  if (!SLUG_RE.test(slug)) {
    return "slug must be 2-48 chars of [a-z0-9-], starting alphanumeric.";
  }
  const name = String(b?.name ?? "").trim();
  if (name.length === 0 || name.length > 80) {
    return "name is required (max 80 chars).";
  }
  const description = String(b?.description ?? "").trim();
  if (description.length === 0 || description.length > 2000) {
    return "description is required (max 2000 chars).";
  }
  const deliverable = String(b?.deliverable ?? "").trim();
  if (deliverable.length === 0 || deliverable.length > 1000) {
    return "deliverable is required (max 1000 chars).";
  }
  const priceUsdc = Number(b?.priceUsdc);
  if (
    !Number.isFinite(priceUsdc) ||
    priceUsdc < 0.01 ||
    priceUsdc > MAX_JOB_USDC
  ) {
    return `priceUsdc must be between 0.01 and ${MAX_JOB_USDC} (the escrow job cap).`;
  }
  const slaMinutes = Number(b?.slaMinutes);
  if (
    !Number.isInteger(slaMinutes) ||
    slaMinutes < 5 ||
    slaMinutes > MAX_SLA_MINUTES
  ) {
    return `slaMinutes must be an integer between 5 and ${MAX_SLA_MINUTES}.`;
  }
  const reviewWindowMinutes = Number(b?.reviewWindowMinutes ?? 1440);
  if (
    !Number.isInteger(reviewWindowMinutes) ||
    reviewWindowMinutes < 0 ||
    reviewWindowMinutes > MAX_REVIEW_MINUTES
  ) {
    return `reviewWindowMinutes must be an integer between 0 and ${MAX_REVIEW_MINUTES}.`;
  }
  const rejectSplitBps = Number(b?.rejectSplitBps ?? 8000);
  if (
    !Number.isInteger(rejectSplitBps) ||
    rejectSplitBps < 0 ||
    rejectSplitBps > 10_000
  ) {
    return "rejectSplitBps must be an integer between 0 and 10000.";
  }
  const requirements = b?.requirements ?? null;
  if (requirements !== null) {
    const isText = typeof requirements === "string";
    const isSchema =
      typeof requirements === "object" && !Array.isArray(requirements);
    if (!(isText || isSchema)) {
      return "requirements must be a string (free text) or a JSON-schema object.";
    }
    if (
      Buffer.byteLength(JSON.stringify(requirements), "utf8") >
      MAX_REQUIREMENTS_BYTES
    ) {
      return `requirements too large (max ${MAX_REQUIREMENTS_BYTES} bytes).`;
    }
  }
  return {
    ok: true,
    p: {
      slug,
      name,
      description,
      priceUsdc,
      slaMinutes,
      reviewWindowMinutes,
      rejectSplitBps,
      requirements,
      deliverable,
    },
  };
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
  let upsert: UpsertPayload | undefined;
  let retireSlug: string | undefined;
  if (action === "upsert") {
    const parsed = parseUpsert(payload);
    if (typeof parsed === "string") {
      return openAiError(
        400,
        parsed,
        "invalid_request_error",
        "invalid_offering"
      );
    }
    upsert = parsed.p;
  } else {
    retireSlug = String((payload as Record<string, unknown>)?.slug ?? "")
      .trim()
      .toLowerCase();
    if (!SLUG_RE.test(retireSlug)) {
      return openAiError(
        400,
        "payload.slug is required.",
        "invalid_request_error",
        "invalid_offering"
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
  const payloadHash = offeringPayloadSha256(payload ?? null);
  const valid = await verifyAgentSignature({
    address,
    message: agentOfferingChallengeMessage(nonce, payloadHash),
    signature,
  });
  if (!valid) {
    return openAiError(
      401,
      "Signature does not match the address (sign t2000-agent-offering:<nonce>:<sha256 of payload JSON>).",
      "invalid_request_error",
      "invalid_signature"
    );
  }

  // Accountability gate: offerings attach to a registered Agent ID only.
  const profile = await getAgentProfile(address);
  if (!profile) {
    return openAiError(
      403,
      "No Agent ID registered for this address — run `t2 agent register` first.",
      "invalid_request_error",
      "agent_not_registered"
    );
  }

  if (upsert) {
    const row = await upsertOffering({
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
    return Response.json({ ok: true, offering: row });
  }
  const retired = await retireOffering(address, retireSlug as string);
  if (!retired) {
    return openAiError(
      404,
      `No live offering "${retireSlug}" for this agent.`,
      "invalid_request_error",
      "offering_not_found"
    );
  }
  return Response.json({ ok: true, retired: retireSlug });
}
