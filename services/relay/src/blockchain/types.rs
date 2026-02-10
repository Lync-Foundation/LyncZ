//! Blockchain-specific types and helpers

use anyhow::Result;
use serde::{Deserialize, Serialize};

/// Contract configuration from on-chain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContractConfig {
    pub min_trade_value_cny: String,
    pub max_trade_value_cny: String,
    pub payment_window: String,
    pub fee_rate_bps: String,          // Fee rate in basis points (50 = 0.5%) - legacy
    pub accumulated_fees_usdc: String, // Accumulated USDC fees (in smallest unit, 6 decimals)
    pub accumulated_fees_weth: String, // Accumulated WETH fees (in wei, 18 decimals)
    pub accumulated_fees_btc: String,  // Accumulated cbBTC/WBTC fees (in satoshi, 8 decimals)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accumulated_fees_usdt: Option<String>, // Accumulated USDT fees (6 decimals) - ETH only
    pub btc_token_label: String,       // "cbBTC" for Base, "WBTC" for ETH
    pub paused: bool,
    pub zk_verifier: String,
    pub public_key_der_hash: String,
    pub app_exe_commit: String,        // Guest program commitment from AlipayVerifier
    pub app_vm_commit: String,         // OpenVM version commitment from AlipayVerifier
    // Fee calculator config
    pub public_fee_usdc: String,       // Public order fee in USDC units (6 decimals)
    pub private_fee_usdc: String,      // Private order fee in USDC units (6 decimals)
    pub eth_price_usdc: String,        // ETH price in USDC (for fee conversion)
    pub btc_price_usdc: String,        // BTC price in USDC (for fee conversion)
    pub fee_calculator_address: String, // Fee calculator contract address
}

/// Convert bytes32 string (0x-prefixed hex) to [u8; 32]
/// Works for trade_id, order_id, or any bytes32 value
fn bytes32_from_hex(hex_value: &str) -> Result<[u8; 32]> {
    let hex_str = hex_value
        .strip_prefix("0x")
        .unwrap_or(hex_value);
    
    let bytes = hex::decode(hex_str)?;
    
    if bytes.len() != 32 {
        return Err(anyhow::anyhow!("Expected 32 bytes, got {}", bytes.len()));
    }
    
    let mut result = [0u8; 32];
    result.copy_from_slice(&bytes);
    
    Ok(result)
}

/// Convert trade ID string (0x-prefixed hex) to bytes32
pub fn trade_id_to_bytes32(trade_id: &str) -> Result<[u8; 32]> {
    bytes32_from_hex(trade_id)
}

/// Convert order ID string (0x-prefixed hex) to bytes32
pub fn order_id_to_bytes32(order_id: &str) -> Result<[u8; 32]> {
    bytes32_from_hex(order_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_trade_id_conversion() {
        let trade_id = "0x0101010101010101010101010101010101010101010101010101010101010101";
        let bytes = trade_id_to_bytes32(trade_id).unwrap();
        assert_eq!(bytes, [1u8; 32]);
    }
    
    #[test]
    fn test_trade_id_without_prefix() {
        let trade_id = "0202020202020202020202020202020202020202020202020202020202020202";
        let bytes = trade_id_to_bytes32(trade_id).unwrap();
        assert_eq!(bytes, [2u8; 32]);
    }
}
