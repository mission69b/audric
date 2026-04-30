import { SuiGrpcClient } from '@mysten/sui/grpc';
import { paymentKit, createPaymentTransactionUri } from '@mysten/payment-kit';
import { env } from '@/lib/env';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

const network = env.NEXT_PUBLIC_SUI_NETWORK;
const baseUrl = getSuiRpcUrl();

let _client: ReturnType<typeof createClient> | null = null;

function createClient() {
  return new SuiGrpcClient({ network, baseUrl }).$extend(paymentKit());
}

export function getPaymentKitClient() {
  if (!_client) _client = createClient();
  return _client;
}

export const USDC_TYPE =
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC';
export const USDC_DECIMALS = 6;

/**
 * Build a `sui:pay?recipient=…&coinType=…` URI that wallets (Slush, Phantom,
 * Suiet) handle as a deep-link when scanned via phone camera or tapped in a
 * messaging app.
 *
 * Two modes:
 *   - **With amount** (invoice / fixed payment) — routes through
 *     `createPaymentTransactionUri` from `@mysten/payment-kit`, which produces
 *     a fully-formed transaction URI including nonce, label, and message.
 *   - **Without amount** (open receive — "send me whatever") — produces a
 *     bare `sui:pay?recipient=…&coinType=…` URI. payment-kit's helper requires
 *     an amount, so we construct this case manually. Wallets honour the
 *     coinType as a default; senders can pick a different asset before
 *     signing if they want.
 *
 * Single source of truth for QR payload construction. SuiPayQr (invoice flow)
 * and the deposit-address receipt (receive flow) both consume this helper —
 * keeps the URI scheme in one place if/when it changes (e.g. SIP-49 may shift
 * the format).
 */
export interface BuildSuiPayUriOpts {
  recipient: string;
  /** Amount in token units (e.g. 5.50 USDC). Omit / null for open receive. */
  amount?: number | null;
  /** Coin type (full type string). Defaults to USDC mainnet. */
  coinType?: string;
  /** Coin decimals. Required when amount is set; defaults to USDC (6). */
  decimals?: number;
  /** Optional nonce (uniqueness per invoice). Required for amount mode. */
  nonce?: string;
  /** Optional payment label shown in wallet UI. */
  label?: string | null;
  /** Optional message shown in wallet UI. */
  memo?: string | null;
}

export function buildSuiPayUri(opts: BuildSuiPayUriOpts): string {
  const coinType = opts.coinType ?? USDC_TYPE;
  const decimals = opts.decimals ?? USDC_DECIMALS;

  if (opts.amount !== null && opts.amount !== undefined && opts.amount > 0) {
    if (!opts.nonce) {
      throw new Error('buildSuiPayUri: nonce required when amount is set');
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

  const params = new URLSearchParams({ recipient: opts.recipient, coinType });
  return `sui:pay?${params.toString()}`;
}
