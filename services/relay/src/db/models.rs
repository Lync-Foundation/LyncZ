use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

/// Database model for Withdrawal - tracks withdrawal history for order activity timeline
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DbWithdrawal {
    pub id: i32,                                 // Auto-increment ID
    #[sqlx(rename = "orderId")]
    pub order_id: String,                        // bytes32 reference to order
    pub amount: String,                          // uint256 withdrawn amount
    #[sqlx(rename = "remainingAfter")]
    pub remaining_after: String,                 // uint256 remaining after withdrawal
    #[sqlx(rename = "txHash")]
    pub tx_hash: Option<String>,                 // Transaction hash
    #[sqlx(rename = "createdAt")]
    pub created_at: DateTime<Utc>,               // When withdrawal occurred
}

/// Database model for Account Email - notification settings (account-based, any wallet can be buyer or seller)
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DbAccountEmail {
    pub wallet: String,                     // Wallet address (0x-prefixed, 42 chars)
    pub email: String,                      // Email address
    pub language: String,                   // Language: 'en', 'zh-CN', 'zh-TW'
    pub enabled: bool,                      // Whether notifications are enabled
    #[sqlx(rename = "createdAt")]
    pub created_at: i64,                    // Unix timestamp
    #[sqlx(rename = "updatedAt")]
    pub updated_at: i64,                    // Unix timestamp
}

/// Database model for Order - EXACTLY matches on-chain Order struct
/// Plus convenience field: syncedAt
/// NOTE: Orders never expire - they remain active until seller withdraws all funds.
///       Order "status" is implicit: active if remainingAmount > 0, inactive if = 0.
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DbOrder {
    // On-chain fields (EXACT match with ZkAliPayEscrow.sol Order struct)
    #[sqlx(rename = "orderId")]
    pub order_id: String,                   // bytes32 as 0x-prefixed hex string (66 chars)
    pub seller: String,                     // address (0x-prefixed, 42 chars)
    pub token: String,                      // address (0x-prefixed, 42 chars)
    #[sqlx(rename = "totalAmount")]
    pub total_amount: String,               // uint256 as decimal string
    #[sqlx(rename = "remainingAmount")]
    pub remaining_amount: String,           // uint256 as decimal string (determines if order is active)
    #[sqlx(rename = "exchangeRate")]
    pub exchange_rate: String,              // uint256 (CNY cents per token)
    pub rail: i32,                          // PaymentRail: 0=ALIPAY, 1=WECHAT
    #[sqlx(rename = "accountId")]
    #[serde(rename = "account_id")]
    pub alipay_id: String,                  // Payment account ID (e.g., Alipay ID)
    #[sqlx(rename = "accountName")]
    #[serde(rename = "account_name")]
    pub alipay_name: String,                // Payment account name
    #[sqlx(rename = "createdAt")]
    pub created_at: i64,                    // uint256 (unix timestamp)
    
    // Multi-chain support
    #[sqlx(rename = "chainId")]
    pub chain_id: i32,                      // Chain ID: 8453=Base, 1=Ethereum
    
    // Additional fields for convenience (NOT on-chain)
    #[sqlx(rename = "syncedAt")]
    pub synced_at: DateTime<Utc>,           // When record was synced to DB
    
    // Private order fields
    #[sqlx(rename = "isPublic")]
    pub is_public: bool,                    // Whether order appears in public listings
    #[sqlx(rename = "privateCode")]
    pub private_code: Option<String>,       // 6-digit code for unlisted orders
}

/// Database model for Trade - EXACTLY matches on-chain Trade struct
/// Plus convenience fields: syncedAt, escrowTxHash, settlementTxHash, PDF storage, Axiom proof data
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DbTrade {
    // On-chain fields (EXACT match with ZkAliPayEscrow.sol Trade struct)
    #[sqlx(rename = "tradeId")]
    pub trade_id: String,                   // bytes32 as 0x-prefixed hex string (66 chars)
    #[sqlx(rename = "orderId")]
    pub order_id: String,                   // bytes32 reference to order (66 chars)
    pub buyer: String,                      // address (0x-prefixed, 42 chars)
    #[sqlx(rename = "tokenAmount")]
    pub token_amount: String,               // uint256 as decimal string
    #[sqlx(rename = "cnyAmount")]
    pub cny_amount: String,                 // uint256 (CNY in cents)
    #[sqlx(rename = "feeAmount")]
    pub fee_amount: Option<String>,         // uint256 fee from TradeCreated event (actual blockchain fee)
    pub rail: i32,                          // PaymentRail: 0=ALIPAY, 1=WECHAT (denormalized from order)
    #[sqlx(rename = "transactionId")]
    pub transaction_id: Option<String>,     // Alipay transaction ID (anti-replay)
    #[sqlx(rename = "paymentTime")]
    pub payment_time: Option<String>,       // Payment time from receipt
    #[sqlx(rename = "createdAt")]
    pub created_at: i64,                    // uint256 (unix timestamp)
    #[sqlx(rename = "expiresAt")]
    pub expires_at: i64,                    // uint256 (unix timestamp)
    pub status: i32,                        // TradeStatus: 0=PENDING, 1=SETTLED, 2=EXPIRED
    
    // Additional fields for convenience (NOT on-chain)
    #[sqlx(rename = "syncedAt")]
    pub synced_at: DateTime<Utc>,           // When record was synced to DB
    #[sqlx(rename = "escrowTxHash")]
    pub escrow_tx_hash: Option<String>,     // Transaction hash when trade created
    #[sqlx(rename = "settlementTxHash")]
    pub settlement_tx_hash: Option<String>, // Transaction hash when settled
    
    // Token address (joined from orders table, not in trades table directly)
    #[sqlx(default)]
    pub token: Option<String>,              // Token address from order (0x-prefixed, 42 chars)
    
    // Payment account info (joined from orders table for convenience)
    #[sqlx(default)]
    #[serde(rename = "account_id")]
    pub alipay_id: Option<String>,          // Seller's account ID (from order)
    #[sqlx(default)]
    #[serde(rename = "account_name")]
    pub alipay_name: Option<String>,        // Seller's account name (from order)
    
    // PDF storage fields
    #[serde(skip_serializing)]              // Don't send binary data in JSON
    #[sqlx(rename = "pdf_file")]
    pub pdf_file: Option<Vec<u8>>,          // Binary PDF data
    #[sqlx(rename = "pdf_filename")]
    pub pdf_filename: Option<String>,       // Original filename
    #[sqlx(rename = "pdf_uploaded_at")]
    pub pdf_uploaded_at: Option<DateTime<Utc>>, // When PDF was uploaded
    
    // Axiom EVM proof fields
    #[serde(skip_serializing)]              // Don't send binary data in JSON by default
    #[sqlx(rename = "proof_user_public_values")]
    pub proof_user_public_values: Option<Vec<u8>>, // 32 bytes
    #[serde(skip_serializing)]
    #[sqlx(rename = "proof_accumulator")]
    pub proof_accumulator: Option<Vec<u8>>,  // 384 bytes
    #[serde(skip_serializing)]
    #[sqlx(rename = "proof_data")]
    pub proof_data: Option<Vec<u8>>,         // 1376 bytes
    #[sqlx(rename = "axiom_proof_id")]
    pub axiom_proof_id: Option<String>,      // Axiom API proof ID
    #[sqlx(rename = "proof_generated_at")]
    pub proof_generated_at: Option<DateTime<Utc>>, // When proof was generated
    #[sqlx(rename = "proof_json")]
    pub proof_json: Option<String>,          // Full Axiom EVM proof JSON
    #[sqlx(rename = "settlement_error")]
    pub settlement_error: Option<String>,    // Settlement error code if failed
    
    // Multi-chain support
    #[sqlx(rename = "chainId")]
    #[sqlx(default)]
    pub chain_id: i32,                       // Chain ID: 8453=Base, 1=Ethereum
}

/// Database model for Gas Cost tracking - relay wallet gas expenditure per chain
#[derive(Debug, Clone, FromRow, Serialize, Deserialize)]
pub struct DbGasCost {
    pub id: i32,
    #[sqlx(rename = "chainId")]
    pub chain_id: i32,                       // Chain ID: 8453=Base, 1=Ethereum
    pub operation: String,                   // Operation type: create_trade, settle, cancel
    #[sqlx(rename = "tradeId")]
    pub trade_id: Option<String>,            // Associated trade ID
    #[sqlx(rename = "orderId")]
    pub order_id: Option<String>,            // Associated order ID
    #[sqlx(rename = "txHash")]
    pub tx_hash: String,                     // Transaction hash
    #[sqlx(rename = "gasUsed")]
    pub gas_used: i64,                       // Gas units consumed
    #[sqlx(rename = "gasPriceGwei")]
    pub gas_price_gwei: String,              // Gas price in Gwei (NUMERIC as string)
    #[sqlx(rename = "costWei")]
    pub cost_wei: String,                    // Total cost in Wei
    #[sqlx(rename = "costEth")]
    pub cost_eth: String,                    // Total cost in ETH
    #[sqlx(rename = "createdAt")]
    pub created_at: DateTime<Utc>,           // When gas cost was recorded
}
