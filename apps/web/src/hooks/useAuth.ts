'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount, useSignMessage, useChainId } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import axios from 'axios';
import { SiweMessage } from 'siwe';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://lyncz-web-production.up.railway.app';
const TOKEN_STORAGE_KEY = 'lyncz_auth_token';
const ADDRESS_STORAGE_KEY = 'lyncz_auth_address';

interface AuthState {
  token: string | null;
  address: string | null;
  isAuthenticating: boolean;
  error: string | null;
}

/**
 * Hook for SIWE (Sign-In With Ethereum) authentication.
 * 
 * Flow:
 * 1. When wallet connects, automatically triggers SIWE auth
 * 2. Fetches a nonce from the backend
 * 3. Constructs a SIWE message and signs it with the wallet
 * 4. Sends message + signature to backend for verification
 * 5. Stores the JWT token for subsequent API calls
 */
export function useAuth() {
  const { address, isConnected: wagmiConnected } = useAccount();
  const { authenticated, ready } = usePrivy();
  const { signMessageAsync } = useSignMessage();
  const currentChainId = useChainId();
  const isConnected = wagmiConnected && authenticated && ready;
  
  const [authState, setAuthState] = useState<AuthState>({
    token: null,
    address: null,
    isAuthenticating: false,
    error: null,
  });

  // Track if we've already attempted auth for this address to avoid loops
  const authAttemptedRef = useRef<string | null>(null);
  // Track if auth is in progress to prevent concurrent attempts
  const authInProgressRef = useRef(false);

  // Load stored token on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const storedAddress = localStorage.getItem(ADDRESS_STORAGE_KEY);
    
    if (storedToken && storedAddress) {
      // Check if token matches current wallet
      if (address && storedAddress.toLowerCase() === address.toLowerCase()) {
        // Verify token isn't expired by checking the JWT payload
        try {
          const payload = JSON.parse(atob(storedToken.split('.')[1]));
          if (payload.exp * 1000 > Date.now()) {
            setAuthState({
              token: storedToken,
              address: storedAddress,
              isAuthenticating: false,
              error: null,
            });
            // Mark as already authenticated for this address
            authAttemptedRef.current = address.toLowerCase();
            return;
          }
        } catch {
          // Token is malformed, clear it
        }
      }
      // Token is expired or for a different wallet
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(ADDRESS_STORAGE_KEY);
    }
  }, [address]);

  // Authenticate function
  const authenticate = useCallback(async () => {
    if (!address || !isConnected || authInProgressRef.current) return;
    
    authInProgressRef.current = true;
    setAuthState(prev => ({ ...prev, isAuthenticating: true, error: null }));

    try {
      // Step 1: Get nonce from backend
      const nonceResponse = await axios.get(`${API_BASE}/api/auth/nonce`);
      const { nonce } = nonceResponse.data;

      // Step 2: Construct SIWE message
      const siweMessage = new SiweMessage({
        domain: window.location.host,
        address: address,
        statement: 'Sign in to LyncZ to manage your orders and trades.',
        uri: window.location.origin,
        version: '1',
        chainId: currentChainId || 8453, // Use connected chain, fallback to Base
        nonce: nonce,
      });
      const messageString = siweMessage.prepareMessage();

      // Step 3: Sign with wallet
      const signature = await signMessageAsync({ message: messageString });

      // Step 4: Verify with backend
      const verifyResponse = await axios.post(`${API_BASE}/api/auth/verify`, {
        message: messageString,
        signature: signature,
      });

      const { token, address: verifiedAddress } = verifyResponse.data;

      // Step 5: Store token
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(ADDRESS_STORAGE_KEY, verifiedAddress);

      setAuthState({
        token,
        address: verifiedAddress,
        isAuthenticating: false,
        error: null,
      });

      authAttemptedRef.current = address.toLowerCase();
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Authentication failed';
      console.error('SIWE auth failed:', errorMessage);
      setAuthState(prev => ({
        ...prev,
        isAuthenticating: false,
        error: errorMessage,
      }));
      // Mark as attempted even on failure to avoid retry loops
      authAttemptedRef.current = address.toLowerCase();
    } finally {
      authInProgressRef.current = false;
    }
  }, [address, isConnected, signMessageAsync]);

  // Auto-authenticate when wallet connects (only once per address)
  useEffect(() => {
    if (!isConnected || !address || !ready) return;
    
    // Skip if already authenticated for this address, or already attempted
    if (authState.token && authState.address?.toLowerCase() === address.toLowerCase()) return;
    if (authAttemptedRef.current === address.toLowerCase()) return;
    
    authenticate();
  }, [isConnected, address, ready, authState.token, authState.address, authenticate]);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected && authState.token) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(ADDRESS_STORAGE_KEY);
      authAttemptedRef.current = null;
      setAuthState({
        token: null,
        address: null,
        isAuthenticating: false,
        error: null,
      });
    }
  }, [isConnected, authState.token]);

  return {
    token: authState.token,
    authenticatedAddress: authState.address,
    isAuthenticating: authState.isAuthenticating,
    authError: authState.error,
    authenticate, // Manual re-auth if needed
    isAuthenticated: !!authState.token,
  };
}

/**
 * Get the stored auth token (for use in API calls outside of React components).
 * Returns null if not authenticated.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return null;
  
  // Check expiry
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 > Date.now()) return token;
  } catch {
    // Token malformed
  }
  
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ADDRESS_STORAGE_KEY);
  return null;
}
