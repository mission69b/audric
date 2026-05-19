/**
 * Pure (zero env / network / server) URI helpers for the `sui:pay?` deep-link
 * scheme. SAFE to import from client components.
 *
 * ## v0.7c Session 4 — amount mode lifted back in
 *
 * Session 3 ported only open-receive mode (public profile page is a pure
 * receiver — no invoice on that surface). Session 4 ports `/pay/[slug]`,
 * which needs the invoice / fixed-payment URI shape. Amount mode is now
 * back, routing through `@mysten/payment-kit`'s `createPaymentTransactionUri`
 * exactly like the original `apps/web` implementation.
 *
 * Two modes:
 *   - **Amount mode** (invoice / fixed payment) — routes through
 *     `createPaymentTransactionUri` which produces a fully-formed
 *     transaction URI with nonce, label, message.
 *   - **Open-receive mode** (bare `sui:pay?recipient=…&coinType=…`) — used
 *     by the profile page and the deposit-address receipt. payment-kit's
 *     helper requires an amount, so we construct this case manually.
 *
 * If you find yourself adding ANYTHING that touches env, RPC clients,
 * secrets, or imports from `@/lib/env` — STOP. Keeping this file as a
 * pure leaf is what prevents production-bundle blowups when client
 * components import it.
 */

import { createPaymentTransactionUri } from "@mysten/payment-kit";

export const USDC_TYPE =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
export const USDC_DECIMALS = 6;

export interface BuildSuiPayUriOpts {
  /** Amount in token units (e.g. 5.50 USDC). Omit / null for open receive. */
  amount?: number | null;
  /** Coin type (full type string). Defaults to USDC mainnet. */
  coinType?: string;
  /** Coin decimals. Required when amount is set; defaults to USDC (6). */
  decimals?: number;
  /** Optional payment label shown in wallet UI. */
  label?: string | null;
  /** Optional message shown in wallet UI. */
  memo?: string | null;
  /** Optional nonce (uniqueness per invoice). Required for amount mode. */
  nonce?: string;
  recipient: string;
}

export function buildSuiPayUri(opts: BuildSuiPayUriOpts): string {
  const coinType = opts.coinType ?? USDC_TYPE;
  const decimals = opts.decimals ?? USDC_DECIMALS;

  if (opts.amount !== null && opts.amount !== undefined && opts.amount > 0) {
    if (!opts.nonce) {
      throw new Error("buildSuiPayUri: nonce required when amount is set");
    }
    const rawAmount = BigInt(Math.floor(opts.amount * 10 ** decimals));
    return createPaymentTransactionUri({
      receiverAddress: opts.recipient,
      amount: rawAmount,
      coinType,
      nonce: opts.nonce,
      ...(opts.label ? { label: opts.label } : {}),
      ...(opts.memo ? { message: opts.memo } : {}),
    });
  }

  const params = new URLSearchParams({
    recipient: opts.recipient,
    coinType,
  });
  return `sui:pay?${params.toString()}`;
}
