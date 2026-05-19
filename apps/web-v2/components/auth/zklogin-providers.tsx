"use client";

/**
 * ZkLoginProviders — `@mysten/dapp-kit` + react-query + Sui client tree.
 *
 * Wraps the app in the providers needed by `useZkLogin()` to:
 *  - read the current Sui epoch (`useSuiClient().getLatestSuiSystemState()`)
 *  - thread the network config into any future wallet UIs
 *
 * Ported from `apps/web/components/providers/AppProviders.tsx` (legacy)
 * with the toast/theme/error-reload providers stripped — web-v2 keeps
 * those in its own template layer.
 *
 * Wired into `app/layout.tsx` as the outermost provider (replacing the
 * Day 1c stub `ZkLoginProvider` passthrough that returned `children`).
 */

import "@mysten/dapp-kit/dist/index.css";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { env } from "@/lib/env";

const { networkConfig } = createNetworkConfig({
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" },
  testnet: { url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" },
});

type NetworkKey = keyof typeof networkConfig;

export function ZkLoginProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000 } },
      })
  );

  const defaultNetwork = env.NEXT_PUBLIC_SUI_NETWORK as NetworkKey;

  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        defaultNetwork={defaultNetwork}
        networks={networkConfig}
      >
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
