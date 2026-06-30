import { setAgentProfileFields } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  agentProfileChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/agent/profile { address, nonce, signature, displayName?, imageUrl?, description? }
// Agent ID gate 8c — the agent sets its DB-backed display profile (turnkey, no
// self-host, no gas). Proves address ownership via a single-use signed
// challenge. Owner-editing + Walrus-sovereign = the paid upgrade (later).
//
// Field semantics: omit a field to leave it; pass "" to clear it.
const MAX = { name: 60, image: 400, description: 500, link: 200 };

function clip(v: unknown, max: number): string | null | undefined {
  if (v === undefined) {
    return;
  }
  const s = String(v).trim();
  return s.length === 0 ? null : s.slice(0, max);
}

// A clipped value is a valid link if it's null (clear) or an https URL.
function isLink(v: string | null | undefined): boolean {
  return v == null || v.startsWith("https://");
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
  let displayName: string | null | undefined;
  let imageUrl: string | null | undefined;
  let description: string | null | undefined;
  let website: string | null | undefined;
  let twitter: string | null | undefined;
  let github: string | null | undefined;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    nonce = String(body?.nonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
    displayName = clip(body?.displayName, MAX.name);
    imageUrl = clip(body?.imageUrl, MAX.image);
    description = clip(body?.description, MAX.description);
    website = clip(body?.website, MAX.link);
    twitter = clip(body?.twitter, MAX.link);
    github = clip(body?.github, MAX.link);
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
  // imageUrl must be https (rendered as an <img> src).
  if (typeof imageUrl === "string" && !imageUrl.startsWith("https://")) {
    return openAiError(
      400,
      "imageUrl must be an https URL.",
      "invalid_request_error",
      "invalid_image"
    );
  }
  if (!(isLink(website) && isLink(twitter) && isLink(github))) {
    return openAiError(
      400,
      "Links (website, twitter, github) must be https URLs.",
      "invalid_request_error",
      "invalid_link"
    );
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
  const valid = await verifyAgentSignature({
    address,
    message: agentProfileChallengeMessage(nonce),
    signature,
  });
  if (!valid) {
    return openAiError(
      401,
      "Signature does not match the address.",
      "invalid_request_error",
      "invalid_signature"
    );
  }

  await setAgentProfileFields(address, {
    displayName,
    imageUrl,
    description,
    website,
    twitter,
    github,
  });
  return Response.json({ ok: true });
}
