import { useCallback, useEffect, useState } from "react";
import { authHeader } from "@/auth/session";
import { useAuth } from "@/auth/useAuth";
import { generateAPIUrl } from "@/lib/api-url";

// Client hooks for the wallet tab's LIVE data. They read the real, on-chain
// balance + transaction history for the SIGNED-IN address via the `/api/balance`
// and `/api/transactions` routes — the same SDK-backed readers web-v3 uses — so
// web and mobile show identical numbers. Read-only: no signing, no money write
// (the Send flow stays a Phase-0 mock). Both soft-fail to empty/null so a flaky
// RPC shows "—" / an empty list rather than breaking the wallet tab, mirroring the
// routes' own soft-fail contract and the `loadHistory` pattern in the store.

export type Balance = {
  usdc: number | null;
  sui: number | null;
  totalUsd: number | null;
};

export type WalletTx = {
  digest: string;
  /** 'out' = outgoing, 'in' = incoming, null = indeterminate. */
  direction: "in" | "out" | null;
  /** Human units, positive; the client adds the sign from `direction`. */
  amount: number | null;
  asset: string;
  label: string;
  /** Epoch ms; the client formats the relative time. */
  timestamp: number;
};

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);

// Live USDC (spendable) + SUI (gas) balance for the signed-in wallet. Used by the
// wallet card, the drawer footer, and the account menu so all three read one source.
export function useBalance(): Balance & { loading: boolean; reload: () => void } {
  const { session } = useAuth();
  const address = session?.address;
  const token = session?.token;
  const [state, setState] = useState<Balance>({ usdc: null, sui: null, totalUsd: null });
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!address) {
      setState({ usdc: null, sui: null, totalUsd: null });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        generateAPIUrl(`/api/balance?address=${encodeURIComponent(address)}`),
        { headers: { Accept: "application/json", ...authHeader(token) } }
      );
      const data = (await res.json()) as Partial<Balance>;
      setState({ usdc: num(data.usdc), sui: num(data.sui), totalUsd: num(data.totalUsd) });
    } catch (e) {
      console.warn("[balance] load failed:", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, loading, reload };
}

// Recent on-chain activity for the signed-in wallet (newest first).
export function useTransactions(limit = 20): {
  transactions: WalletTx[];
  loading: boolean;
  reload: () => void;
} {
  const { session } = useAuth();
  const address = session?.address;
  const token = session?.token;
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!address) {
      setTransactions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        generateAPIUrl(
          `/api/transactions?address=${encodeURIComponent(address)}&limit=${limit}`
        ),
        { headers: { Accept: "application/json", ...authHeader(token) } }
      );
      const data = (await res.json()) as { transactions?: WalletTx[] };
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    } catch (e) {
      console.warn("[transactions] load failed:", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [address, token, limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { transactions, loading, reload };
}

// Compact relative time for a transaction's epoch-ms timestamp ("2h ago", "Yesterday").
export function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day} days ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
