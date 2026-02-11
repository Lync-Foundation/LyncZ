import { getAddress as viemGetAddress } from 'viem';

// ============================================================================
// Multi-Chain Network Configuration
// ============================================================================

export interface ChainConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  blockExplorerUrl: string;
  escrowAddress: `0x${string}`;
}

// Per-chain configuration
const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  // Base Mainnet
  8453: {
    chainId: 8453,
    chainName: 'Base',
    rpcUrl: 'https://mainnet.base.org',
    blockExplorerUrl: 'https://basescan.org',
    escrowAddress: (process.env.NEXT_PUBLIC_BASE_ESCROW_ADDRESS || '0x0') as `0x${string}`,
  },
  // Ethereum Mainnet
  1: {
    chainId: 1,
    chainName: 'Ethereum',
    rpcUrl: 'https://eth.llamarpc.com',
    blockExplorerUrl: 'https://etherscan.io',
    escrowAddress: (process.env.NEXT_PUBLIC_ETH_ESCROW_ADDRESS || '0x0') as `0x${string}`,
  },
};

// Legacy exports for backward compatibility
export const CHAIN_ID = 8453;
export const BLOCK_EXPLORER_URL = 'https://basescan.org';
export const CHAIN_NAME = 'Base';
export const ESCROW_ADDRESS = CHAIN_CONFIGS[8453].escrowAddress;

// Re-export getAddress for convenience
export const getAddress = viemGetAddress;

// ============================================================================
// Chain-aware helpers
// ============================================================================

/** Get the chain config for a given chain ID */
export function getChainConfig(chainId: number): ChainConfig {
  return CHAIN_CONFIGS[chainId] || CHAIN_CONFIGS[8453]; // Default to Base
}

/** Get escrow address for a specific chain */
export function getEscrowAddress(chainId: number): `0x${string}` {
  return getChainConfig(chainId).escrowAddress;
}

/** Get chain name for a specific chain ID */
export function getChainName(chainId: number): string {
  return getChainConfig(chainId).chainName;
}

/** Get block explorer URL for a specific chain */
export function getBlockExplorerUrl(chainId: number): string {
  return getChainConfig(chainId).blockExplorerUrl;
}

/** Get block explorer transaction URL (chain-aware) */
export function getTransactionUrl(txHash: string, chainId?: number): string {
  const explorerUrl = chainId ? getBlockExplorerUrl(chainId) : BLOCK_EXPLORER_URL;
  return `${explorerUrl}/tx/${txHash}`;
}

// USDC ABI (ERC20)
export const USDC_ABI = [
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Payment Rail enum values (must match contract)
export const PAYMENT_RAIL = {
  ALIPAY: 0,
  WECHAT: 1,
} as const;

export type PaymentRail = typeof PAYMENT_RAIL[keyof typeof PAYMENT_RAIL];

// Escrow ABI (minimal - just what we need)
// v4: accountLinesHash + isPublic instead of plain text account info
export const ESCROW_ABI = [
  {
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'totalAmount', type: 'uint256' },
      { name: 'exchangeRate', type: 'uint256' },
      { name: 'rail', type: 'uint8' },
      { name: 'accountLinesHash', type: 'bytes32' },  // v4: SHA256(20||name||21||id)
      { name: 'isPublic', type: 'bool' },             // v4: public or private order
    ],
    name: 'createOrder',
    outputs: [{ name: 'orderId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'orderId', type: 'bytes32' },
      { name: 'buyer', type: 'address' },
      { name: 'fiatAmount', type: 'uint256' },
    ],
    name: 'fillOrder',
    outputs: [{ name: 'tradeId', type: 'bytes32' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tradeId', type: 'bytes32' },
      { name: 'proof', type: 'bytes' },
      { name: 'publicInputs', type: 'bytes' },
    ],
    name: 'submitPaymentProof',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'orderId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'withdrawFromOrder',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'orderId', type: 'bytes32' },
      { name: 'newExchangeRate', type: 'uint256' },
    ],
    name: 'updateExchangeRate',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'orderId', type: 'bytes32' },
      { name: 'newHash', type: 'bytes32' },  // v4: updateAccountLinesHash instead of updatePaymentInfo
    ],
    name: 'updateAccountLinesHash',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // View function to calculate fee (no gas cost)
  {
    inputs: [
      { name: 'tokenAmount', type: 'uint256' },
      { name: 'fiatAmount', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'buyer', type: 'address' },
      { name: 'isPublic', type: 'bool' },  // v4: different fees for public/private
    ],
    name: 'calculateFee',
    outputs: [{ name: 'feeInTokens', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ============================================================================
// Hash Computation (v4 - Privacy)
// ============================================================================

/**
 * Mask an Alipay account ID the same way Alipay masks it in PDF receipts.
 * This ensures our hash matches what the ZK circuit reads from the PDF.
 * 
 * Examples:
 *   - "test@example.com" -> "tes***@example.com" (email)
 *   - "13800138000" -> "138******00" (Chinese phone - first 3 + 6 asterisks + last 2)
 *   - "1-3125551212" -> "1-312*****12" (international phone - first 5 + 5 asterisks + last 2)
 * 
 * Pattern:
 *   - Email: Keep first 3 chars + "***" + "@" + domain
 *   - Chinese phone (11 digits): Keep first 3 + "******" + last 2
 *   - International phone (has dash): Keep first 5 + "*****" + last 2
 *   - Other: Keep first 3 + "***" (fallback)
 */
export function maskAlipayAccountId(accountId: string): string {
  const trimmed = accountId.trim();
  
  // Check if it's an email
  const atIndex = trimmed.indexOf('@');
  if (atIndex > 0) {
    const localPart = trimmed.substring(0, atIndex);
    const domain = trimmed.substring(atIndex); // includes @
    if (localPart.length <= 3) {
      return localPart + '***' + domain;
    }
    return localPart.substring(0, 3) + '***' + domain;
  }
  
  // Check if it's a Chinese phone number (11 digits, all numeric)
  // Alipay masks as: first 3 + 6 asterisks + last 2
  if (/^\d{11}$/.test(trimmed)) {
    return trimmed.substring(0, 3) + '******' + trimmed.substring(9);
  }
  
  // Check if it's an international phone number (starts with digit, contains dash)
  // Pattern: first 5 + 5 asterisks + last 2
  // Example: "1-3125551212" -> "1-312*****12"
  if (trimmed.length >= 10 && /^\d/.test(trimmed) && trimmed.includes('-')) {
    if (trimmed.length >= 7) {
      return trimmed.substring(0, 5) + '*****' + trimmed.substring(trimmed.length - 2);
    }
  }
  
  // Fallback: keep first 3 chars + ***
  if (trimmed.length <= 3) {
    return trimmed + '***';
  }
  return trimmed.substring(0, 3) + '***';
}

/**
 * Compute accountLinesHash = SHA256(20 || line20 || 21 || line21)
 * 
 * IMPORTANT: Must match exactly what the ZK circuit reads from the PDF!
 * 
 * In Alipay PDFs:
 *   - Line 20 = "账户名：" + accountName (e.g., "账户名：张三")
 *   - Line 21 = "账号：" + maskedAccountId (e.g., "账号：138******88")
 * 
 * The ZK circuit hashes the FULL line text including prefixes,
 * so we must build the same format here.
 */
export async function computeAccountLinesHash(accountName: string, accountId: string): Promise<`0x${string}`> {
  // Build full line text as it appears in Alipay PDF
  // NOTE: Alipay converts English names to UPPERCASE in their receipts, so we must match
  // Chinese names are left as-is (Chinese characters don't have uppercase/lowercase)
  const isAsciiName = /^[\x00-\x7F]*$/.test(accountName);
  const formattedName = isAsciiName ? accountName.toUpperCase() : accountName;
  const line20 = '账户名：' + formattedName;
  const line21 = '账号：' + maskAlipayAccountId(accountId);
  
  // Build the data buffer: 20 (LE u32) || line20 bytes || 21 (LE u32) || line21 bytes
  const encoder = new TextEncoder();
  const line20Bytes = encoder.encode(line20);
  const line21Bytes = encoder.encode(line21);
  
  // Create buffer: 4 bytes (20 as LE u32) + line20 + 4 bytes (21 as LE u32) + line21
  const buffer = new Uint8Array(4 + line20Bytes.length + 4 + line21Bytes.length);
  
  // Write 20 as little-endian u32
  const view = new DataView(buffer.buffer);
  view.setUint32(0, 20, true); // true = little-endian
  buffer.set(line20Bytes, 4);
  
  // Write 21 as little-endian u32
  view.setUint32(4 + line20Bytes.length, 21, true);
  buffer.set(line21Bytes, 4 + line20Bytes.length + 4);
  
  // Compute SHA256 hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert to hex string with 0x prefix
  const hashHex = Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  return `0x${hashHex}` as `0x${string}`;
}

// Helper to format addresses
export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Helper to format USDC amounts (6 decimals)
export function formatUSDC(amount: bigint | string): string {
  const amt = typeof amount === 'string' ? BigInt(amount) : amount;
  return (Number(amt) / 1_000_000).toFixed(2);
}

// Helper to format CNY amounts (cents)
export function formatCNY(cents: bigint | string): string {
  const amt = typeof cents === 'string' ? BigInt(cents) : cents;
  return (Number(amt) / 100).toFixed(2);
}

// Helper to parse USDC input (6 decimals)
export function parseUSDC(amount: string): bigint {
  const num = parseFloat(amount);
  return BigInt(Math.floor(num * 1_000_000));
}

