/**
 * Token utilities for multi-token, multi-chain support
 * Supports Base Mainnet (8453) and Ethereum Mainnet (1)
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
}

// Chain IDs
export const CHAIN_IDS = {
  BASE_MAINNET: 8453,
  ETH_MAINNET: 1,
} as const;

// Token configurations per chain
const CHAIN_TOKENS: Record<number, Record<string, TokenInfo>> = {
  // Base Mainnet
  [CHAIN_IDS.BASE_MAINNET]: {
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
    '0x4200000000000000000000000000000000000006': {
      symbol: 'WETH',
      name: 'Wrapped ETH',
      decimals: 18,
      address: '0x4200000000000000000000000000000000000006',
    },
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf': {
      symbol: 'cbBTC',
      name: 'Coinbase Wrapped BTC',
      decimals: 8,
      address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    },
  },
  // Ethereum Mainnet
  [CHAIN_IDS.ETH_MAINNET]: {
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    },
    '0xdac17f958d2ee523a2206206994597c13d831ec7': {
      symbol: 'USDT',
      name: 'Tether USD',
      decimals: 6,
      address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    },
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': {
      symbol: 'WETH',
      name: 'Wrapped ETH',
      decimals: 18,
      address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': {
      symbol: 'WBTC',
      name: 'Wrapped BTC',
      decimals: 8,
      address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    },
  },
};

/**
 * Get tokens for a specific chain
 */
export function getTokensForChain(chainId: number): Record<string, TokenInfo> {
  return CHAIN_TOKENS[chainId] || CHAIN_TOKENS[CHAIN_IDS.BASE_MAINNET];
}

/**
 * Get supported token addresses for a specific chain
 */
export function getSupportedTokensForChain(chainId: number): string[] {
  return Object.values(getTokensForChain(chainId)).map(t => t.address);
}

/**
 * Get tokens for ALL supported chains (merged)
 * Used when displaying orders from all chains together
 */
function getAllChainTokens(): Record<string, TokenInfo> {
  const merged: Record<string, TokenInfo> = {};
  for (const chainTokens of Object.values(CHAIN_TOKENS)) {
    for (const [key, value] of Object.entries(chainTokens)) {
      merged[key] = value;
    }
  }
  return merged;
}

// ============ Legacy Exports (default to Base) ============

/**
 * List of supported token addresses for Base (legacy - backward compat)
 */
export const SUPPORTED_TOKENS = Object.values(getTokensForChain(CHAIN_IDS.BASE_MAINNET)).map(t => t.address);

/**
 * Get the default/primary token for a chain (first in list)
 */
export function getDefaultToken(chainId: number = CHAIN_IDS.BASE_MAINNET): TokenInfo {
  const tokens = getTokensForChain(chainId);
  const firstKey = Object.keys(tokens)[0];
  return tokens[firstKey];
}

/**
 * Get default token address
 */
export function getDefaultTokenAddress(chainId: number = CHAIN_IDS.BASE_MAINNET): string {
  return getDefaultToken(chainId).address;
}

/**
 * Get token info by address (case-insensitive)
 * Searches ALL chains to find the token
 */
export function getTokenInfo(address: string): TokenInfo {
  const normalized = address.toLowerCase();
  
  // Search all chains for this token
  const allTokens = getAllChainTokens();
  const token = allTokens[normalized];
  
  if (token) {
    return token;
  }
  
  // Unknown token - return generic info
  return {
    symbol: 'TOKEN',
    name: 'Unknown Token',
    decimals: 18, // Default to 18 decimals (ERC20 standard)
    address: address,
  };
}

/**
 * Get token symbol by address
 */
export function getTokenSymbol(address: string): string {
  return getTokenInfo(address).symbol;
}

/**
 * Get token decimals by address
 */
export function getTokenDecimals(address: string): number {
  return getTokenInfo(address).decimals;
}

/**
 * Format token amount with correct decimals (for display - standard rounding)
 */
export function formatTokenAmount(amount: string, tokenAddress: string): string {
  const decimals = getTokenDecimals(tokenAddress);
  const num = parseInt(amount) / Math.pow(10, decimals);
  
  // Display format based on token decimals
  // 6 decimals (USDC/USDT): show 2 decimal places
  // 8 decimals (BTC): show 6 decimal places
  // 18 decimals (ETH/ERC20): show 4 decimal places
  let displayDecimals = 2;
  if (decimals === 8) {
    displayDecimals = 6;
  } else if (decimals === 18) {
    displayDecimals = 4;
  }
  
  return num.toFixed(displayDecimals);
}

/**
 * Format token amount rounded DOWN (for "Remaining" display - conservative)
 * Prevents showing more than available, e.g., 1.495 → 1.49 not 1.50
 */
export function formatTokenAmountFloor(amount: string, tokenAddress: string): string {
  const decimals = getTokenDecimals(tokenAddress);
  const num = parseInt(amount) / Math.pow(10, decimals);
  
  // Display decimals based on token
  let displayDecimals = 2;
  if (decimals === 8) {
    displayDecimals = 6;
  } else if (decimals === 18) {
    displayDecimals = 4;
  }
  
  // Round DOWN using floor
  const multiplier = Math.pow(10, displayDecimals);
  const floored = Math.floor(num * multiplier) / multiplier;
  
  return floored.toFixed(displayDecimals);
}

/**
 * Get exact token amount without display rounding (for Max button / transactions)
 * Uses full precision to avoid "insufficient funds" errors from rounding up
 */
export function getExactTokenAmount(amount: string, tokenAddress: string): string {
  const decimals = getTokenDecimals(tokenAddress);
  const num = parseInt(amount) / Math.pow(10, decimals);
  
  // Return with full precision up to token's decimals
  // This ensures we never try to withdraw more than available
  return num.toFixed(decimals);
}

/**
 * Format token amount with symbol
 */
export function formatTokenAmountWithSymbol(amount: string, tokenAddress: string): string {
  const formatted = formatTokenAmount(amount, tokenAddress);
  const symbol = getTokenSymbol(tokenAddress);
  return `${formatted} ${symbol}`;
}

/**
 * Format token amount rounded DOWN with symbol (for "Available/Remaining" display - conservative)
 * Prevents showing more than available, e.g., 2.495 → "2.49 USDC" not "2.50 USDC"
 */
export function formatTokenAmountFloorWithSymbol(amount: string, tokenAddress: string): string {
  const formatted = formatTokenAmountFloor(amount, tokenAddress);
  const symbol = getTokenSymbol(tokenAddress);
  return `${formatted} ${symbol}`;
}

/**
 * Get exchange rate label for a token
 */
export function getExchangeRateLabel(tokenAddress: string): string {
  const symbol = getTokenSymbol(tokenAddress);
  return `CNY/${symbol}`;
}

// ============ Flat Fee Constants (must match BaseFeeCalculator.sol / EthFeeCalculator.sol) ============

/**
 * Flat fee in USDC units (6 decimals)
 * Public orders: 0.2 USDC = 200000
 * Private orders: 0.4 USDC = 400000
 */
const PUBLIC_FEE_USDC = BigInt(200000);  // 0.2 USDC
const PRIVATE_FEE_USDC = BigInt(400000); // 0.4 USDC

/**
 * Hardcoded token prices in USDC (no oracle)
 * Must match BaseFeeCalculator.sol / EthFeeCalculator.sol constants
 */
const ETH_PRICE_USDC = BigInt(3000);    // 1 ETH = 3000 USDC
const BTC_PRICE_USDC = BigInt(100000);  // 1 BTC = 100000 USDC

// ============ Per-chain token address maps for fee computation ============

// Base Mainnet token addresses (lowercase)
const BASE_USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const BASE_WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const BASE_CBBTC_ADDRESS = '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf';

// Ethereum Mainnet token addresses (lowercase)
const ETH_USDC_ADDRESS = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const ETH_USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
const ETH_WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const ETH_WBTC_ADDRESS = '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599';

// Sets of stablecoin, ETH, and BTC addresses across all chains
const USDC_ADDRESSES = new Set([BASE_USDC_ADDRESS, ETH_USDC_ADDRESS]);
const USDT_ADDRESSES = new Set([ETH_USDT_ADDRESS]);
const WETH_ADDRESSES = new Set([BASE_WETH_ADDRESS, ETH_WETH_ADDRESS]);
const BTC_ADDRESSES = new Set([BASE_CBBTC_ADDRESS, ETH_WBTC_ADDRESS]);

/**
 * Get flat fee for a trade in token units
 * Works across all chains by detecting token type from address
 * @param tokenAddress Token address
 * @param isPublic Whether order is public (0.2 USDC) or private (0.4 USDC)
 * @returns Fee amount in token's smallest unit (wei/satoshi/etc.)
 */
export function getFlatFee(tokenAddress: string, isPublic: boolean): bigint {
  const normalized = tokenAddress.toLowerCase();
  const feeUsdc = isPublic ? PUBLIC_FEE_USDC : PRIVATE_FEE_USDC;
  
  if (USDC_ADDRESSES.has(normalized) || USDT_ADDRESSES.has(normalized)) {
    // USDC/USDT: fee is already in correct units (6 decimals)
    return feeUsdc;
  } else if (WETH_ADDRESSES.has(normalized)) {
    // WETH: Convert USDC to ETH
    // fee_wei = feeUsdc * 10^12 / ETH_PRICE_USDC
    return (feeUsdc * BigInt(1000000000000)) / ETH_PRICE_USDC;
  } else if (BTC_ADDRESSES.has(normalized)) {
    // BTC (cbBTC or WBTC): Convert USDC to BTC
    // fee_satoshi = feeUsdc * 100 / BTC_PRICE_USDC
    return (feeUsdc * BigInt(100)) / BTC_PRICE_USDC;
  }
  
  // Unsupported token - return 0 (fail-safe)
  return BigInt(0);
}

/**
 * Get flat fee in human-readable format (for display)
 * @param tokenAddress Token address
 * @param isPublic Whether order is public or private
 * @returns Human-readable fee amount (e.g., "0.02" for USDC)
 */
export function getFlatFeeDisplay(tokenAddress: string, isPublic: boolean): string {
  const fee = getFlatFee(tokenAddress, isPublic);
  const decimals = getTokenDecimals(tokenAddress);
  const displayAmount = Number(fee) / Math.pow(10, decimals);
  
  // Use appropriate decimal places based on token
  if (decimals === 6) return displayAmount.toFixed(2);   // USDC: 0.02
  if (decimals === 8) return displayAmount.toFixed(8);   // BTC: very small
  if (decimals === 18) return displayAmount.toFixed(8);  // ETH: very small
  return displayAmount.toFixed(4);
}

/**
 * Format flat fee with symbol (e.g., "0.4 USDC")
 */
export function formatFlatFeeDisplay(tokenAddress: string, isPublic: boolean): string {
  const feeDisplay = getFlatFeeDisplay(tokenAddress, isPublic);
  const symbol = getTokenSymbol(tokenAddress);
  return `${feeDisplay} ${symbol}`;
}

/**
 * Get flat fee in USDC equivalent (for display purposes)
 * @param isPublic Whether order is public or private
 * @returns Fee in USDC (e.g., "0.02")
 */
export function getFlatFeeUsdcDisplay(isPublic: boolean): string {
  const fee = isPublic ? PUBLIC_FEE_USDC : PRIVATE_FEE_USDC;
  return (Number(fee) / 1000000).toFixed(2);
}

/**
 * Get fee display with USDC equivalent for non-USDC tokens
 * @param tokenAddress Token address
 * @param isPublic Whether order is public or private
 * @returns Object with fee display info
 */
export function getFeeDisplayWithEquivalent(tokenAddress: string, isPublic: boolean): {
  feeAmount: string;
  feeSymbol: string;
  usdcEquivalent: string;
  isUsdc: boolean;
} {
  const normalized = tokenAddress.toLowerCase();
  const isUsdc = USDC_ADDRESSES.has(normalized) || USDT_ADDRESSES.has(normalized);
  const usdcEquivalent = getFlatFeeUsdcDisplay(isPublic);
  
  if (isUsdc) {
    return {
      feeAmount: usdcEquivalent,
      feeSymbol: getTokenSymbol(tokenAddress),
      usdcEquivalent,
      isUsdc: true,
    };
  }
  
  // For non-USDC tokens, show token amount with USDC equivalent
  const feeAmount = getFlatFeeDisplay(tokenAddress, isPublic);
  const feeSymbol = getTokenSymbol(tokenAddress);
  
  return {
    feeAmount,
    feeSymbol,
    usdcEquivalent,
    isUsdc: false,
  };
}
