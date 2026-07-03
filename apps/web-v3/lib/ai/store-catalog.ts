import "server-only";

/**
 * Agent-store catalog for need-first routing (SPEC_AGENT_COMMERCE §II.12 C2).
 *
 * Fetches the live agents.t2000.ai directory and reduces it to a compact,
 * prompt-injectable catalog of DELIVERABLE paid services (active + priced +
 * a delivery endpoint — the same honesty gate the store's listing pages use).
 * The model routes a user's QUESTION to a service and offers it with the
 * price; it never sees raw URLs — `agent_pay` takes the seller address and
 * the client constructs the x402 buy URL itself.
 *
 * Cached in-process (5 min) — the shelf changes rarely and a chat turn must
 * never pay a directory round-trip on the hot path.
 */

const DIRECTORY_BASE = "https://api.t2000.ai/v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
// In-browser per-call cap (mirrors the console's Try-it cap). Services above
// it are left out of the catalog entirely — never offer what we'd refuse.
export const AGENT_PAY_CAP_USD = 5;

export type StoreService = {
  address: string;
  numericId: number | null;
  name: string;
  priceUsdc: string;
  category: string | null;
  /** Compact what-it-does + input hint, derived from the listing description. */
  blurb: string;
};

type DirectoryAgent = {
  address?: string;
  numericId?: number;
  name?: string;
  active?: boolean;
  service?: string | null;
  priceUsdc?: string | null;
  category?: string | null;
  description?: string | null;
};

let cache: { at: number; services: StoreService[] } | null = null;

/** First paragraph + the "Input:" hint (when present) — enough for routing,
 *  small enough to not bloat the system prompt. */
function toBlurb(description: string | null | undefined): string {
  if (!description) {
    return "";
  }
  const firstPara = description.split(/\n\s*\n/)[0]?.trim() ?? "";
  const inputLine = description
    .split("\n")
    .find((l) => /^\s*(input|try it)\s*:/i.test(l))
    ?.trim();
  const blurb = inputLine ? `${firstPara} ${inputLine}` : firstPara;
  return blurb.length > 260 ? `${blurb.slice(0, 257)}…` : blurb;
}

async function fetchDeliverable(
  agent: DirectoryAgent
): Promise<StoreService | null> {
  if (!(agent.address && agent.name && agent.priceUsdc)) {
    return null;
  }
  const price = Number.parseFloat(agent.priceUsdc);
  if (!Number.isFinite(price) || price <= 0 || price > AGENT_PAY_CAP_USD) {
    return null;
  }
  try {
    // The LIST endpoint omits `mcpEndpoint`; the per-agent profile carries it.
    // No endpoint = payment-only listing → not offerable (money without
    // delivery — the store's own "not selling a deliverable service" gate).
    const res = await fetch(`${DIRECTORY_BASE}/agents/${agent.address}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return null;
    }
    const profile = (await res.json()) as {
      mcpEndpoint?: string | null;
      description?: string | null;
    };
    if (!profile.mcpEndpoint) {
      return null;
    }
    return {
      address: agent.address,
      numericId: agent.numericId ?? null,
      name: agent.name,
      priceUsdc: agent.priceUsdc,
      category: agent.category ?? null,
      blurb: toBlurb(profile.description ?? agent.description),
    };
  } catch {
    return null;
  }
}

export async function getStoreCatalog(): Promise<StoreService[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.services;
  }
  try {
    const res = await fetch(`${DIRECTORY_BASE}/agents?limit=100`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return cache?.services ?? [];
    }
    const data = (await res.json()) as { agents?: DirectoryAgent[] };
    const sellers = (data.agents ?? []).filter(
      (a) => a.active !== false && a.service && a.priceUsdc
    );
    const resolved = await Promise.all(sellers.map(fetchDeliverable));
    const services = resolved.filter((s): s is StoreService => s !== null);
    // A transient directory failure must not blank the catalog mid-session.
    if (services.length > 0 || !cache) {
      cache = { at: Date.now(), services };
    }
    return cache.services;
  } catch {
    return cache?.services ?? [];
  }
}

/** The `<agent_store>` system-prompt block — catalog + need-first rules. */
export function storeCatalogPromptBlock(services: StoreService[]): string {
  if (services.length === 0) {
    return "";
  }
  const rows = services
    .map(
      (s) =>
        `- ${s.name}${s.numericId == null ? "" : ` (#${s.numericId})`} · $${s.priceUsdc} · seller ${s.address}${s.category ? ` · ${s.category}` : ""}\n  ${s.blurb}`
    )
    .join("\n");
  return `<agent_store>
Paid one-call services from the t2000 agent store (agents.t2000.ai). Each is bought per call with the user's wallet USDC over x402 — pay-on-delivery, failed delivery auto-refunds. You may OFFER one when it genuinely answers the user's question better than your free tools; the user's question is the need — never push the store unprompted.

${rows}

Rules (strict):
- OFFER FIRST, in one short line WITH the price: what the service returns + "$X, pay-on-delivery — auto-refunds if it fails. Want it?" NEVER call agent_pay before the user clearly agrees (yes / buy it / go ahead).
- When they agree, call \`agent_pay\` with the seller address + price + service name EXACTLY as listed above, and \`input\` per the service's Input hint (omit if none). The user then taps Allow on a confirm card — that tap is the purchase.
- NEVER invent, substitute, or restyle a service; only the ones listed here exist. If none fits, just answer normally with your own tools.
- Free tools first when equivalent: don't offer a paid quote for something crypto_market/web_search answers as well.
- After delivery: answer the user's question THROUGH the returned data (insight, not a raw JSON dump). Credit the service by name in one line.
- On a failed delivery: say the payment was automatically refunded (it was — the rail refunds on failure). Never claim delivery that didn't happen.
- The user pays from their own Passport wallet USDC (on-chain), not their Audric credit. If the card reports an empty wallet, point them to Wallet in settings to deposit — do not retry.
</agent_store>`;
}
