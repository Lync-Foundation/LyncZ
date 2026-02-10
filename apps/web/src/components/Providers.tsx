'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from '@privy-io/wagmi';
import { PrivyProvider } from '@privy-io/react-auth';
import { config } from '@/lib/wagmi';
import { LocaleProvider } from './LocaleProvider';
import { AuthInitializer } from './AuthInitializer';
import { useState, useEffect, type ReactNode } from 'react';
import { base } from 'wagmi/chains';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

if (!PRIVY_APP_ID && typeof window !== 'undefined') {
  console.error('NEXT_PUBLIC_PRIVY_APP_ID is not set!');
}

export function Providers({ 
  children,
}: { 
  children: ReactNode;
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: true,
      },
    },
  }));
  
  // Track theme for Privy modal
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    // Check initial theme
    const checkTheme = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
    
    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Don't render Privy on server
  if (!PRIVY_APP_ID) {
    return (
      <LocaleProvider>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-red-500">Missing NEXT_PUBLIC_PRIVY_APP_ID</p>
        </div>
      </LocaleProvider>
    );
  }

  return (
    <LocaleProvider>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          // Appearance - matches LyncZ design language
          appearance: {
            theme: isDarkMode ? 'dark' : 'light',
            accentColor: '#8B5CF6', // Purple - center of our gradient
            logo: '/logo-compact.svg',
            showWalletLoginFirst: true,
          },
          // Default chain - enforce Base
          defaultChain: base,
          supportedChains: [base],
          // Login methods
          loginMethods: ['wallet'],
          // Embedded wallet disabled - we only want external wallets
          embeddedWallets: {
            ethereum: {
              createOnLogin: 'off',
            },
          },
          // WalletConnect Project ID for QR code scanning
          walletConnectCloudProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
        }}
      >
        <QueryClientProvider client={queryClient}>
          <WagmiProvider config={config}>
            <AuthInitializer />
            {children}
          </WagmiProvider>
        </QueryClientProvider>
      </PrivyProvider>
    </LocaleProvider>
  );
}
