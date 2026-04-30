import { SuiGrpcClient } from '@mysten/sui/grpc';
import { paymentKit } from '@mysten/payment-kit';
import { env } from '@/lib/env';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

/**
 * SERVER-ONLY module. Imports `env` and `getSuiRpcUrl()` at module-load time,
 * which trip the env proxy's "server-only var" guard the moment the module
 * is included in a client bundle. Do NOT import this from `'use client'`
 * components — even importing a single constant pulls the whole module.
 *
 * For pure URI helpers safe in the client, use `lib/sui-pay-uri.ts` (which
 * also owns `USDC_TYPE` / `USDC_DECIMALS` constants and the `buildSuiPayUri`
 * helper). This module deliberately re-exports NOTHING from there — making
 * the bug class structurally impossible (a client dev who tries to import
 * `buildSuiPayUri` from `lib/payment-kit` gets a "not exported" type error
 * and is forced to use the safe path).
 *
 * The split lives at this granularity because v0.56 shipped with the helpers
 * inlined here; the production bundle blew up on first paint when
 * `dashboard-content.tsx` imported `buildSuiPayUri` and the env proxy fired
 * in the browser. Tests mock env so the bug only surfaces in real builds.
 */

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
