import { http, createConfig } from 'wagmi';
import { type Chain } from 'viem';
import { base, mainnet } from 'wagmi/chains';

// RPC URLs
const BASE_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org';
const ETH_RPC_URL = process.env.NEXT_PUBLIC_ETH_RPC_URL || 'https://eth.llamarpc.com';

// Chain enable/disable switches (default to true)
const ENABLE_BASE = process.env.NEXT_PUBLIC_ENABLE_BASE !== 'false';
const ENABLE_ETH = process.env.NEXT_PUBLIC_ENABLE_ETH !== 'false';

// Build chains and transports dynamically based on enabled flags
const enabledChains: Chain[] = [];
const transports: Record<number, ReturnType<typeof http>> = {};

if (ENABLE_BASE) {
  enabledChains.push(base);
  transports[base.id] = http(BASE_RPC_URL);
}
if (ENABLE_ETH) {
  enabledChains.push(mainnet);
  transports[mainnet.id] = http(ETH_RPC_URL);
}

// Fallback: at least one chain must be enabled (default to Base)
if (enabledChains.length === 0) {
  enabledChains.push(base);
  transports[base.id] = http(BASE_RPC_URL);
}

// Supported chain IDs (derived from enabled chains)
export const SUPPORTED_CHAIN_IDS = enabledChains.map(c => c.id) as readonly number[];

/** Check if a specific chain is enabled */
export function isChainEnabled(chainId: number): boolean {
  return SUPPORTED_CHAIN_IDS.includes(chainId);
}

/** Get the default chain ID (first enabled chain) */
export function getDefaultChainId(): number {
  return enabledChains[0].id;
}

// Create a basic wagmi config for Privy
// Privy manages connectors internally, we just need chains and transports
export const config = createConfig({
  chains: enabledChains as [Chain, ...Chain[]],
  transports,
  ssr: true,
});

// Export for compatibility
export const wagmiConfig = config;
