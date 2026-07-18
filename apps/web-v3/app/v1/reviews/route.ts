import { listJobReviews } from "@audric/accounts";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { openAiError } from "@/lib/api/keys";
import { checkAgentIpRateLimit, clientIp } from "@/lib/ratelimit";

// GET /v1/reviews?seller=0x… — a seller's receipt-bound job reviews (t2 ACP
// Phase 1 item 6). Public: every review is bound to a released on-chain Job,
// so this mirrors verifiable public state. Returns the aggregate score
// (average stars over ALL reviews), count, a 1–5 histogram, and the newest
// rows (each linkable to its Job object on Suiscan).

export async function GET(request: Request) {
  if (!(await checkAgentIpRateLimit(clientIp(request)))) {
    return openAiError(
      429,
      "Too many requests — slow down.",
      "rate_limit_error",
      "rate_limit_exceeded"
    );
  }
  const url = new URL(request.url);
  const raw = url.searchParams.get("seller")?.trim();
  if (!raw) {
    return openAiError(
      400,
      "Provide ?seller=0x….",
      "invalid_request_error",
      "missing_seller"
    );
  }
  let seller: string;
  try {
    seller = normalizeSuiAddress(raw);
  } catch {
    seller = "";
  }
  if (!isValidSuiAddress(seller)) {
    return openAiError(
      400,
      "seller must be a valid Sui address.",
      "invalid_request_error",
      "invalid_address"
    );
  }

  const { reviews, score, count } = await listJobReviews(seller);
  const histogram = [0, 0, 0, 0, 0];
  for (const r of reviews) {
    if (r.stars >= 1 && r.stars <= 5) {
      histogram[r.stars - 1]++;
    }
  }
  return Response.json({
    seller,
    score: score == null ? null : Math.round(score * 100) / 100,
    count,
    histogram,
    reviews: reviews.map((r) => ({
      jobId: r.jobId,
      buyer: r.buyer,
      stars: r.stars,
      text: r.text,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}
