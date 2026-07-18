import { getJobSpec } from "@audric/accounts";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// GET /v1/job/spec/<sha256> — fetch a job-spec payload by its content hash
// (the seller's read path: on-chain Job.spec_hash → the requirements the
// buyer wrote). Integrity is verifiable client-side: sha256(content) == hash.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hash: string }> }
) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  const { hash } = await params;
  const clean = hash.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    return openAiError(
      400,
      "hash must be a sha256 hex string.",
      "invalid_request_error",
      "invalid_hash"
    );
  }
  const content = await getJobSpec(clean);
  if (content === undefined) {
    return openAiError(
      404,
      "No spec stored for this hash.",
      "invalid_request_error",
      "spec_not_found"
    );
  }
  return Response.json({ hash: clean, content });
}
