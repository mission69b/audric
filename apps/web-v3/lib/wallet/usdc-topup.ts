import { sendTransfer } from "@/lib/wallet/send";

export type TopupAsset = "USDC" | "USDsui";

/**
 * Stablecoin top-up — client half (Audric). Signs a gasless USDC/USDsui
 * transfer from the Passport to the treasury, then hands the digest to the
 * server, which verifies it on-chain and credits the exact amount received
 * (shared `recordStablecoinTopup`).
 */
export async function payStablecoinTopup(
  amount: number,
  asset: TopupAsset = "USDC"
): Promise<{
  credited: boolean;
  amountUsd: number;
  asset: string;
  balanceUsd: number;
}> {
  // The server is authoritative for the treasury address.
  const cfgRes = await fetch("/api/credit/usdc-topup");
  if (!cfgRes.ok) {
    throw new Error("Couldn't reach the top-up service.");
  }
  const cfg = (await cfgRes.json()) as {
    configured?: boolean;
    treasury?: string;
  };
  if (!(cfg.configured && cfg.treasury)) {
    throw new Error("Credit is not available right now.");
  }

  const { digest } = await sendTransfer({
    to: cfg.treasury,
    amount,
    asset,
  });

  return await confirmTopup(digest);
}

type ConfirmResult = {
  credited: boolean;
  amountUsd: number;
  asset: string;
  balanceUsd: number;
};

// The payment is already on-chain — confirm + credit is idempotent on the
// digest, so retry transient "not confirmed yet" (409) / server blips a few
// times before giving up. On final failure, surface the digest so the paid
// user has a recovery reference (re-submitting later still credits).
async function confirmTopup(digest: string): Promise<ConfirmResult> {
  const CONFIRM_ATTEMPTS = 4;
  let lastError = "Couldn't confirm the top-up.";
  for (let i = 0; i < CONFIRM_ATTEMPTS; i++) {
    const res = await fetch("/api/credit/usdc-topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ digest }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      return j as ConfirmResult;
    }
    lastError = j?.error ?? lastError;
    const retryable = res.status === 409 || res.status >= 500;
    if (!retryable) {
      throw new Error(lastError);
    }
    if (i < CONFIRM_ATTEMPTS - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(
    `${lastError} Your payment is safe (tx ${digest.slice(0, 8)}…) — reopen Billing in a minute to credit it.`
  );
}
