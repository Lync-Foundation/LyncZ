'use client';

import { useAuth } from '@/hooks/useAuth';

/**
 * Invisible component that initializes SIWE authentication.
 * 
 * Mount this inside the provider tree so it has access to wagmi + Privy.
 * When a wallet connects, it automatically triggers the SIWE sign-in flow,
 * storing a JWT token that authenticated API calls will use.
 */
export function AuthInitializer() {
  // The hook handles everything: auto-auth on connect, cleanup on disconnect
  useAuth();
  return null;
}
