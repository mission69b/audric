import { SuiGrpcClient } from "@mysten/sui/grpc";
import { queryBalance } from "@t2000/sdk";
import { authenticate } from "@/lib/api-guard";

// Balance route — the wallet tab's read-only balance readout. Native analogue of
// web-v3's `app/api/wallet/balance/route.ts`: reuses the SDK's canonical priced
// reader (`queryBalance`) keyed by the AUTHENTICATED Sui address — the SAME source
// as web-v3's `balance_check` tool and its wallet-balance route — so web and mobile
// show byte-identical numbers.
//
// Runs SERVER-SIDE (Node): the Sui RPC call + the SDK stay off the device. Read-only
// — no signing, no money write (that is B2 / N2.3, gated behind the Phase-0 parity
// check). web-v3's route returns { usdc, totalUsd } for its sidebar; the mobile card
// also has a SUI gas row, so we surface `sui.amount` too — one extra field off the
// same `queryBalance` result, not a different data path.
//
// Identity is the verified `audric_session` (Bearer); the query-string `address` is
// only a dev-fallback hint (the __DEV__ stub / no-token dev path), exactly like the
// history/messages routes.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;

export async function GET(request: Request) {
  const asserted =
    (new URL(request.url).searchParams.get("address") ?? "").toLowerCase() ||
    null;
  const auth = await authenticate(request, asserted);
  if (!auth.ok) return auth.response;

  const address = auth.userId ?? "";
  // Soft-null (the UI shows "—") for a missing/garbage address rather than erroring.
  if (!SUI_ADDRESS.test(address)) {
    return Response.json({ usdc: null, sui: null, totalUsd: null });
  }

  const network =
    process.env.EXPO_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  const baseUrl =
    network === "testnet"
      ? "https://fullnode.testnet.sui.io"
      : "https://fullnode.mainnet.sui.io";

  try {
    const client = new SuiGrpcClient({ baseUrl, network });
    const balance = await queryBalance(client, address);
    return Response.json({
      usdc: balance.stables.USDC ?? 0,
      sui: balance.sui.amount,
      totalUsd: balance.totalUsd,
    });
  } catch {
    // Same soft-fail contract as web-v3: surface a null so the UI shows "—" rather
    // than an error state (a flaky RPC must never break the wallet tab).
    return Response.json({ usdc: null, sui: null, totalUsd: null });
  }
}
