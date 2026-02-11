import { http, createConfig } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';

// RPC URLs
const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
const ETH_RPC_URL = process.env.NEXT_PUBLIC_ETH_RPC_URL || 'https://eth.llamarpc.com';

// Supported chain IDs
export const SUPPORTED_CHAIN_IDS = [base.id, mainnet.id] as const; // [8453, 1]

// Create a basic wagmi config for Privy
// Privy manages connectors internally, we just need chains and transports
export const config = createConfig({
  chains: [base, mainnet],
  transports: {
    [base.id]: http(BASE_RPC_URL),
    [mainnet.id]: http(ETH_RPC_URL),
  },
  ssr: true,
});

// Export for compatibility
export const wagmiConfig = config;
