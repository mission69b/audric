import {
  anchorReceipt,
  getAnchorDigest,
  isAnchorConfigured,
} from "@/lib/api/anchor";
import { openAiError } from "@/lib/api/keys";

// GET /v1/aci/anchor/{receiptId} — look up a receipt's on-chain anchor (the tx
// digest). Public + key-free: the verifier (`t2 verify`) reads this digest then
// re-reads the tx straight from a Sui fullnode, so a wrong/missing digest just
// fails the trustless check closed. 404 if the receipt hasn't been anchored.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const txDigest = id ? await getAnchorDigest(id) : null;
  if (!txDigest) {
    return openAiError(
      404,
      "This receipt has not been anchored on Sui.",
      "invalid_request_error",
      "anchor_not_found"
    );
  }
  return Response.json({
    anchored: true,
    receiptId: id,
    txDigest,
    explorer: `https://suiscan.xyz/mainnet/tx/${txDigest}`,
  });
}

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
