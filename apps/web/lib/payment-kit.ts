import { SuiGrpcClient } from '@mysten/sui/grpc';
import { paymentKit } from '@mysten/payment-kit';
import { getSuiRpcUrl } from '@/lib/sui-rpc';

const network = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'mainnet') as 'mainnet' | 'testnet';
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
