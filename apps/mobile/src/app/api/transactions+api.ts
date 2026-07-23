import { queryHistory } from "@t2000/sdk";
import { authenticate } from "@/lib/api-guard";
import { resolveLimit } from "@/lib/pagination";

// Transaction-history route — the wallet tab's RECENT ACTIVITY list. Native
// analogue of web-v3's `transaction_history` tool: the SDK's canonical history
// reader (`queryHistory`) keyed by the AUTHENTICATED Sui address — the SAME source
// web-v3 uses — so web and mobile show the same on-chain activity.
//
// Runs SERVER-SIDE (Node): the Sui GraphQL call + the SDK stay off the device.
// Read-only — no signing, no money write. We trim each SDK `TransactionRecord` to
// the minimal shape the row needs (digest for the Suiscan link + the user's
// principal leg: direction/amount/asset/counterparty/label/timestamp); the client
// formats the sign, the relative time, and the Suiscan URL. Same Bearer-auth +
// soft-fail contract as the balance route.

const SUI_ADDRESS = /^0x[0-9a-f]{64}$/;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// 0x1234…cdef — a compact counterparty label for a raw 0x address.
function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const asserted = (url.searchParams.get("address") ?? "").toLowerCase() || null;
  const auth = await authenticate(request, asserted);
  if (!auth.ok) return auth.response;

  const address = auth.userId ?? "";
  if (!SUI_ADDRESS.test(address)) {
    return Response.json({ transactions: [] });
  }

  // `queryHistory` reads its GraphQL endpoint from `T2000_GRAPHQL_URL` (the SDK
  // defaults to mainnet). Point it at the SAME network as the balance route so
  // history + balance read one chain. An explicit env override wins (`||=` only
  // fills when unset/empty).
  const network =
    process.env.EXPO_PUBLIC_SUI_NETWORK === "testnet" ? "testnet" : "mainnet";
  process.env.T2000_GRAPHQL_URL ||= `https://graphql.${network}.sui.io/graphql`;

  const limit = resolveLimit(
    url.searchParams.get("limit"),
    DEFAULT_LIMIT,
    MAX_LIMIT
  );

  try {
    const records = await queryHistory(address, limit);
    const transactions = records.map((r) => {
      const primary = r.legs?.[0];
      const direction = r.direction ?? primary?.direction ?? null;
      const amount =
        typeof r.amount === "number" ? r.amount : (primary?.amount ?? null);
      const asset = r.asset ?? primary?.asset ?? "";
      const counterparty = r.recipient ? short(r.recipient) : null;
      return {
        digest: r.digest,
        direction, // 'in' | 'out' | null
        amount, // human units, positive
        asset, // symbol (USDC, SUI, …)
        // Counterparty address (truncated) when known, else the SDK's action label.
        label: counterparty ?? r.label ?? r.action ?? "Transaction",
        timestamp: r.timestamp, // epoch ms — the client formats "2h ago"
      };
    });
    return Response.json({ transactions });
  } catch {
    // Soft-fail (the UI shows the empty state) rather than erroring the wallet tab.
    return Response.json({ transactions: [] });
  }
}
