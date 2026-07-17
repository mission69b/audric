import { SUI_ADDRESS } from "./screen";
import { SUI_NETWORK } from "@/lib/audric-web";

// Official Sui GraphQL RPC. The old `sui-{network}.mystenlabs.com` hosts are dead
// (testnet fails DNS, mainnet fails TLS); `graphql.{network}.sui.io/graphql` is the
// live endpoint. SuiNS names resolve via the `address(name:)` field — the previous
// `resolveSuinsAddress(domain:)` field does not exist on this schema.
const SUINS_GRAPHQL = `https://graphql.${SUI_NETWORK}.sui.io/graphql`;

export function isSuiAddress(v: string): boolean {
  return SUI_ADDRESS.test(v.trim().toLowerCase());
}

// alice@audric → alice.audric.sui ; bob.sui passes through ; trims + lowercases.
export function normalizeSuins(raw: string): string {
  const name = raw.trim().toLowerCase();
  if (name.includes("@")) {
    const [label, domain] = name.split("@");
    return `${label}.${domain}.sui`;
  }
  return name;
}

// Resolve a recipient string to a 0x address. 0x input passes straight through;
// otherwise resolve the SuiNS name via the Sui GraphQL endpoint. Throws on miss.
export async function resolveRecipient(
  raw: string
): Promise<{ address: string; resolved: string | null }> {
  const input = raw.trim().toLowerCase();
  if (isSuiAddress(input)) {
    return { address: input, resolved: null };
  }
  const name = normalizeSuins(input);
  const res = await fetch(SUINS_GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($n: String!) { address(name: $n) { address } }`,
      variables: { n: name },
    }),
  });
  // A non-2xx response (5xx / rate-limit / gateway) often returns an HTML error page,
  // so calling res.json() would throw a raw SyntaxError. Fail with a clean, retryable
  // message instead of leaking the parse error.
  if (!res.ok) {
    throw new Error("Recipient service unavailable — try again.");
  }
  const json = (await res.json()) as { data?: { address?: { address?: string } | null } };
  const address = json.data?.address?.address;
  if (!address) {
    throw new Error(`Couldn't resolve ${name}.`);
  }
  return { address, resolved: name };
}
