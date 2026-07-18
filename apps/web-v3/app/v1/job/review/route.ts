import { createHash } from "node:crypto";
import { getEscrowJob, upsertJobReview } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  agentJobReviewChallengeMessage,
  verifyAgentSignature,
} from "@/lib/agent/auth";
import { consumeNonce } from "@/lib/agent/nonce";
import { openAiError } from "@/lib/api/keys";
import { syncEscrowJobsIfStale } from "@/lib/jobs/indexer";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/job/review — receipt-bound star reviews on RELEASED escrow Jobs
// (t2 ACP Phase 1 item 6, SPEC_ACP_SUI §4.1). The Job object id IS the
// receipt: a review can only exist where USDC actually moved to the seller.
//
// Body: { address, nonce, signature, jobId, stars, text? }
// Auth: challenge nonce (POST /v1/agent/challenge) + personal-message
// signature bound to sha256 of the canonical payload {jobId, stars, text} —
// the same construction as offering mutations.
// Eligibility (checked against the event-indexed read-model, sync-on-read
// fresh): the job exists, its state is "released", the signer is the job's
// BUYER, and buyer != seller (no self-reviews). One review per job — a
// re-POST edits stars/text.

const MAX_TEXT_CHARS = 400;

function reviewPayloadSha256(payload: unknown): string {
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
  let jobId: string;
  let stars: number;
  let text: string | null;
  let payload: unknown;
  try {
    const body = await request.json();
    address = normalizeSuiAddress(String(body?.address ?? "").trim());
    nonce = String(body?.nonce ?? "").trim();
    signature = String(body?.signature ?? "").trim();
    payload = body?.payload;
    const p = (payload ?? {}) as Record<string, unknown>;
    jobId = normalizeSuiAddress(String(p.jobId ?? "").trim());
    stars = Number(p.stars);
    const rawText = String(p.text ?? "").trim();
    text = rawText.length > 0 ? rawText : null;
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

  // Validate the payload BEFORE consuming the nonce — a rejected payload
  // shouldn't burn the challenge (the client can fix and retry).
  if (!isValidSuiAddress(jobId)) {
    return openAiError(
      400,
      "payload.jobId must be a Job object id (0x…).",
      "invalid_request_error",
      "invalid_job_id"
    );
  }
  if (!(Number.isInteger(stars) && stars >= 1 && stars <= 5)) {
    return openAiError(
      400,
      "payload.stars must be an integer 1–5.",
      "invalid_request_error",
      "invalid_stars"
    );
  }
  if (text && text.length > MAX_TEXT_CHARS) {
    return openAiError(
      400,
      `payload.text must be ≤${MAX_TEXT_CHARS} characters.`,
      "invalid_request_error",
      "invalid_text"
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
  const payloadHash = reviewPayloadSha256(payload ?? null);
  const valid = await verifyAgentSignature({
    address,
    message: agentJobReviewChallengeMessage(nonce, payloadHash),
    signature,
  });
  if (!valid) {
    return openAiError(
      401,
      "Signature does not match the address (sign t2000-job-review:<nonce>:<sha256 of payload JSON>).",
      "invalid_request_error",
      "invalid_signature"
    );
  }

  // The receipt binding: the event-indexed Job row proves who paid whom and
  // that the escrow actually RELEASED to the seller.
  await syncEscrowJobsIfStale();
  const job = await getEscrowJob(jobId);
  if (!job) {
    return openAiError(
      404,
      "No such job — if it was just funded, retry in a few seconds.",
      "invalid_request_error",
      "job_not_found"
    );
  }
  if (job.state !== "released") {
    return openAiError(
      409,
      `Only RELEASED jobs can be reviewed (this job is ${job.state}).`,
      "invalid_request_error",
      "job_not_released"
    );
  }
  if (normalizeSuiAddress(job.buyer) !== address) {
    return openAiError(
      403,
      "Only the job's buyer can review it.",
      "invalid_request_error",
      "not_buyer"
    );
  }
  if (normalizeSuiAddress(job.seller) === address) {
    return openAiError(
      403,
      "Self-reviews are not allowed.",
      "invalid_request_error",
      "self_review"
    );
  }

  const review = await upsertJobReview({
    jobId,
    seller: normalizeSuiAddress(job.seller),
    buyer: address,
    stars,
    text,
  });
  return Response.json({
    ok: true,
    review: {
      jobId: review.jobId,
      seller: review.seller,
      stars: review.stars,
      text: review.text,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    },
  });
}
