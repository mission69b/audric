import { anchorReceipt, isAnchorConfigured } from "@/lib/api/anchor";
import { openAiError } from "@/lib/api/keys";

// POST /v1/aci/anchor/{receiptId} — anchor a confidential receipt on Sui
// (SPEC_CONFIDENTIAL_API v3.0, Phase C). On demand: emits a `ReceiptAnchored`
// event committing the receipt's wire_hash + workload_id on-chain — the
// tamper-evident, Sui-native commitment the Phase-D verifier matches against.
// Returns the anchor tx digest (+ a Suiscan link). The full signed receipt
// stays off-chain (GET /v1/aci/receipts/{id}).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) {
    return openAiError(
      400,
      "A receipt id is required.",
      "invalid_request_error",
      "invalid_receipt_id"
    );
  }
  if (!isAnchorConfigured()) {
    return openAiError(
      503,
      "Sui anchoring is not configured.",
      "api_error",
      "anchor_unavailable"
    );
  }

  const result = await anchorReceipt(id);
  if (!result.anchored) {
    return openAiError(
      502,
      `Could not anchor the receipt: ${result.reason ?? "unknown error"}.`,
      "api_error",
      "anchor_failed"
    );
  }
  return Response.json({
    anchored: true,
    receiptId: id,
    txDigest: result.txDigest,
    explorer: `https://suiscan.xyz/mainnet/tx/${result.txDigest}`,
  });
}
