import { verifyReceipt } from "@t2000/sdk";

// GET /api/verify-receipt?id=<rcpt-…>&model=<phala/…> — server-side verify of a
// confidential response (SPEC_CONFIDENTIAL_UI §4, Option A). Runs the trustless
// checks (signed receipt · attested upstream · on-chain Sui anchor · signature)
// and returns the per-check report for the Verify modal. The client-side DCAP
// quote check is intentionally left to `t2 verify` (the true-trustless path the
// modal always CTAs) — running the heavy WASM verifier in a Next serverless
// function adds no trust over a server checkmark, so we skip it here.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const model = searchParams.get("model") ?? undefined;
  if (!id) {
    return Response.json(
      { error: "A receipt id is required." },
      { status: 400 }
    );
  }
  try {
    const result = await verifyReceipt(id, { model, skipQuote: true });
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "verification failed" },
      { status: 502 }
    );
  }
}
