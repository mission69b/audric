'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SuiClientProvider, WalletProvider, createNetworkConfig } from '@mysten/dapp-kit';
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { useState } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ChunkErrorReloader } from '@/components/shell/ChunkErrorReloader';
import { env } from '@/lib/env';
import '@mysten/dapp-kit/dist/index.css';

const { networkConfig } = createNetworkConfig({
  mainnet: { url: getJsonRpcFullnodeUrl('mainnet'), network: 'mainnet' },
  testnet: { url: getJsonRpcFullnodeUrl('testnet'), network: 'testnet' },
});

const defaultNetwork = env.NEXT_PUBLIC_SUI_NETWORK;

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000 } },
    }),
  );

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
          <WalletProvider autoConnect>
            <ToastProvider>
              {/* Skew/stale-bundle safety net. Mounted inside
                  ToastProvider so the version-check hook can fire
                  the "New version available" toast. Renders nothing. */}
              <ChunkErrorReloader />
              {children}
            </ToastProvider>
          </WalletProvider>
        </SuiClientProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
