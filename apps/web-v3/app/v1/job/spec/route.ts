import { createHash } from "node:crypto";
import { putJobSpec } from "@audric/accounts";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// POST /v1/job/spec { content } — content-addressed job-spec upload (t2 ACP
// Phase 1). Returns { hash } = sha256 hex of the exact UTF-8 content; the
// buyer pins that hash on-chain as the Job's `spec_hash`, making the stored
// content tamper-evident (anyone can recompute + compare). No auth: writes
// are idempotent by construction (same hash ⇒ same content) and size-capped.

const MAX_SPEC_BYTES = 16 * 1024;

export async function POST(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  let content: string;
  try {
    const body = await request.json();
    content = String(body?.content ?? "");
  } catch {
    return openAiError(
      400,
      "Bad request.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (content.length === 0) {
    return openAiError(
      400,
      "content is required.",
      "invalid_request_error",
      "bad_request"
    );
  }
  if (Buffer.byteLength(content, "utf8") > MAX_SPEC_BYTES) {
    return openAiError(
      400,
      `content too large (max ${MAX_SPEC_BYTES} bytes).`,
      "invalid_request_error",
      "spec_too_large"
    );
  }
  const hash = createHash("sha256").update(content, "utf8").digest("hex");
  await putJobSpec(hash, content);
  return Response.json({ hash });
}
