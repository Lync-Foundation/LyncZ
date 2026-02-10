'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { SUPPORTED_CHAIN_IDS } from '@/lib/wagmi';

/**
 * Hook to guard against wrong chain connections.
 * Returns chain state and helpers for UI components.
 * 
 * Supports multiple chains (Base + Ethereum Mainnet).
 * Checks BOTH wagmi's connection state AND Privy's authentication state
 * to ensure proper disconnect behavior.
 */
export function useChainGuard() {
  const { address, isConnected: wagmiConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { authenticated, ready } = usePrivy();
  
  // User is truly connected only if both wagmi AND Privy say so
  const isConnected = wagmiConnected && authenticated && ready;
  
  // Check if connected to any supported chain
  const isSupportedChain = isConnected && chainId !== undefined && 
    (SUPPORTED_CHAIN_IDS as readonly number[]).includes(chainId);
  const isCorrectChain = isSupportedChain; // Any supported chain is "correct"
  const isWrongChain = isConnected && chainId !== undefined && !isSupportedChain;
  const canInteract = isConnected && isSupportedChain;
  
  // Get chain name
  const getChainNameById = (id: number | undefined) => {
    const names: Record<number, string> = {
      1: 'Ethereum',
      5: 'Goerli',
      11155111: 'Sepolia',
      8453: 'Base',
      84531: 'Base Goerli',
      84532: 'Base Sepolia',
      137: 'Polygon',
      42161: 'Arbitrum',
      10: 'Optimism',
    };
    return id ? names[id] || `Chain ${id}` : 'Unknown';
  };
  
  const currentChainName = getChainNameById(chainId);
  
  // Switch to a specific chain
  const switchToChain = useCallback((targetChainId: number) => {
    if (switchChain) {
      switchChain({ chainId: targetChainId });
    }
  }, [switchChain]);
  
  // Legacy: switch to Base (for components that don't need chain selection)
  const switchToBase = useCallback(() => {
    switchToChain(8453);
  }, [switchToChain]);
  
  return {
    address,
    isConnected,
    chainId,
    isCorrectChain,
    isWrongChain,
    isSupportedChain,
    canInteract,
    currentChainName,
    switchToChain,
    switchToBase,
    isSwitching,
  };
}
