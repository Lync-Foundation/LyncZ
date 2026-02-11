//! Order handlers - read-only order listing
//! 
//! Order creation happens directly on-chain via frontend (wagmi).
//! This module provides read-only access to order data from the database.

use axum::{
    extract::{Path, Query, State},
    // http::HeaderMap,  // TODO: re-enable when auth is restored
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::api::{
    error::{ApiError, ApiResult},
    state::AppState,
};
// use crate::auth;  // TODO: re-enable when auth is restored
use crate::email::format_token_amount;

// ================================================================
// TOKEN HELPERS
// ================================================================

/// Get token symbol from address (Base Mainnet + Ethereum Mainnet)
fn get_token_symbol(token_address: &str) -> String {
    let addr = token_address.to_lowercase();
    match addr.as_str() {
        // Base Mainnet
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" => "USDC".to_string(),
        "0x4200000000000000000000000000000000000006" => "WETH".to_string(),
        "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" => "cbBTC".to_string(),
        // Ethereum Mainnet
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" => "USDC".to_string(),  // ETH USDC
        "0xdac17f958d2ee523a2206206994597c13d831ec7" => "USDT".to_string(),  // ETH USDT
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" => "WETH".to_string(),  // ETH WETH
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" => "WBTC".to_string(),  // ETH WBTC
        _ => "TOKEN".to_string(),
    }
}

/// Get token decimals from address (Base Mainnet + Ethereum Mainnet)
fn get_token_decimals(token_address: &str) -> u8 {
    let addr = token_address.to_lowercase();
    match addr.as_str() {
        // Base Mainnet
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" => 6,  // USDC
        "0x4200000000000000000000000000000000000006" => 18, // WETH
        "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" => 8,  // cbBTC
        // Ethereum Mainnet
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" => 6,  // USDC
        "0xdac17f958d2ee523a2206206994597c13d831ec7" => 6,  // USDT
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" => 18, // WETH
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" => 8,  // WBTC
        _ => 18,
    }
}

/// Query parameters for listing orders
#[derive(Debug, Deserialize)]
pub struct OrderQueryParams {
    /// Maximum number of orders to return
    pub limit: Option<i64>,
    
    /// Filter by seller address (optional)
    pub seller: Option<String>,
    
    /// Filter by token address (optional)
    pub token: Option<String>,
    
    /// Filter by chain ID (optional, None = all chains)
    /// 8453 = Base, 1 = Ethereum
    pub chain_id: Option<i32>,
}

/// Order response DTO
#[derive(Debug, Serialize)]
pub struct OrderDto {
    pub order_id: String,
    pub seller: String,
    pub token: String,
    pub total_amount: String,
    pub remaining_amount: String,
    pub exchange_rate: String,
    pub rail: i32,  // PaymentRail: 0=ALIPAY, 1=WECHAT
    pub alipay_id: String,
    pub alipay_name: String,
    pub created_at: i64,
    pub chain_id: i32,  // Chain ID: 8453=Base, 1=Ethereum
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_code: Option<String>,
}

/// List of orders response
#[derive(Debug, Serialize)]
pub struct OrderListResponse {
    pub orders: Vec<OrderDto>,
    pub total: usize,
}

/// GET /api/orders/active
/// Get list of active sell orders (remaining_amount > 0)
/// 
/// NOTE: Authentication temporarily disabled. When re-enabling, uncomment the
/// JWT verification block below and the `headers` parameter.
pub async fn get_active_orders(
    State(state): State<AppState>,
    // headers: HeaderMap,  // TODO: re-enable when auth is restored
    Query(params): Query<OrderQueryParams>,
) -> ApiResult<Json<OrderListResponse>> {
    let orders = if let Some(seller) = params.seller {
        // TODO: Re-enable authentication when ready
        // AUTHENTICATED: Seller-specific query requires JWT proof of wallet ownership
        // let auth_header = headers.get(axum::http::header::AUTHORIZATION)
        //     .and_then(|v| v.to_str().ok())
        //     .ok_or_else(|| ApiError::Unauthorized("Authentication required to view seller orders. Please sign in with your wallet.".to_string()))?;
        // 
        // let authenticated_address = auth::verify_jwt(auth_header)
        //     .map_err(|e| ApiError::Unauthorized(format!("Invalid authentication: {}", e)))?;
        // 
        // // Verify the authenticated wallet matches the requested seller
        // if authenticated_address != seller.to_lowercase() {
        //     return Err(ApiError::Unauthorized("You can only view your own orders".to_string()));
        // }
        
        // Get orders by seller (includes private orders)
        state.db.get_orders_by_seller(&seller).await?
    } else if let Some(token) = params.token {
        // Get orders by token (optionally filtered by chain)
        state.db.get_active_orders_by_token(&token, params.limit, params.chain_id).await?
    } else {
        // Get all active orders (optionally filtered by chain)
        state.db.get_active_orders(params.limit, params.chain_id).await?
    };
    
    let order_dtos: Vec<OrderDto> = orders
        .into_iter()
        .map(|o| order_to_dto(o))
        .collect();
    
    let total = order_dtos.len();
    
    Ok(Json(OrderListResponse {
        orders: order_dtos,
        total,
    }))
}

/// GET /api/orders/private/:code
/// Get order by private code (for unlisted orders)
#[axum::debug_handler]
pub async fn get_order_by_private_code(
    State(state): State<AppState>,
    Path(code): Path<String>,
) -> ApiResult<Json<OrderDto>> {
    let order = state.db.get_order_by_private_code(&code).await?;
    Ok(Json(order_to_dto(order)))
}

/// Request body for setting order visibility
#[derive(Debug, Deserialize)]
pub struct SetVisibilityRequest {
    pub is_public: bool,
}

/// Response for visibility update
#[derive(Debug, Serialize)]
pub struct SetVisibilityResponse {
    pub success: bool,
    pub is_public: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_code: Option<String>,
}

/// POST /api/orders/:order_id/visibility
/// Set order visibility (public/private) - only the seller should call this
/// Also sends the order creation email (since we wait for visibility to be set before emailing)
#[axum::debug_handler]
pub async fn set_order_visibility(
    State(state): State<AppState>,
    Path(order_id): Path<String>,
    Json(req): Json<SetVisibilityRequest>,
) -> ApiResult<Json<SetVisibilityResponse>> {
    let private_code = state.db.set_order_visibility(&order_id, req.is_public).await?;
    
    // Get order details for email
    if let Ok(order) = state.db.get_order(&order_id).await {
        // Get seller's email (returns Result<Option<...>>)
        if let Ok(Some(account_email)) = state.db.get_account_email(&order.seller).await {
            // Get token info
            let token_symbol = get_token_symbol(&order.token);
            let token_decimals = get_token_decimals(&order.token);
            
            // Send order created email with visibility info
            if let Some(email_service) = crate::email::EmailService::from_env() {
                let language = &account_email.language;
                let is_private = !req.is_public;
                
                let _ = email_service.send_notification(
                    &account_email.email,
                    &language,
                    crate::email::EmailEvent::OrderCreated,
                    &crate::email::EmailInfo::OrderCreated {
                        order_id: order_id.clone(),
                        token_amount: format_token_amount(&order.total_amount, token_decimals, ""),
                        token_symbol,
                        exchange_rate: order.exchange_rate.clone(),
                        account_id: order.alipay_id.clone(),
                        account_name: order.alipay_name.clone(),
                        rail: order.rail,  // Pass rail number, template will localize
                        is_private,
                        private_code: private_code.clone(),
                    },
                ).await;
                
                let visibility = if is_private { "private" } else { "public" };
                tracing::info!("📧 Sent order created email ({}) to {} for order {}", visibility, account_email.email, order_id);
            }
        }
    }
    
    Ok(Json(SetVisibilityResponse {
        success: true,
        is_public: req.is_public,
        private_code,
    }))
}

/// Helper to convert DbOrder to OrderDto
fn order_to_dto(o: crate::db::models::DbOrder) -> OrderDto {
    OrderDto {
        order_id: o.order_id,
        seller: o.seller,
        token: o.token,
        total_amount: o.total_amount,
        remaining_amount: o.remaining_amount,
        exchange_rate: o.exchange_rate,
        rail: o.rail,
        alipay_id: o.alipay_id,
        alipay_name: o.alipay_name,
        created_at: o.created_at,
        chain_id: o.chain_id,
        is_public: o.is_public,
        private_code: o.private_code,
    }
}

// ============================================================================
// Order Activities (for order detail page timeline)
// ============================================================================

/// Activity types for order timeline
#[derive(Debug, Serialize)]
#[serde(tag = "type")]
pub enum OrderActivity {
    /// A successful trade settlement
    #[serde(rename = "trade")]
    Trade {
        trade_id: String,
        buyer: String,
        token_amount: String,
        token_amount_formatted: String,
        fee_amount: String,
        fee_amount_formatted: String,
        cny_amount: String,
        cny_amount_formatted: String,
        settlement_tx: Option<String>,
        settled_at: i64,  // Unix timestamp (use created_at since that's when the trade happened)
    },
    /// A pending trade (buyer has initiated but not yet paid/settled)
    #[serde(rename = "pending_trade")]
    PendingTrade {
        trade_id: String,
        buyer: String,
        token_amount: String,
        token_amount_formatted: String,
        cny_amount: String,
        cny_amount_formatted: String,
        created_at: i64,
        expires_at: i64,
    },
    /// An expired trade (buyer failed to pay in time)
    #[serde(rename = "expired_trade")]
    ExpiredTrade {
        trade_id: String,
        buyer: String,
        token_amount: String,
        token_amount_formatted: String,
        cny_amount: String,
        cny_amount_formatted: String,
        created_at: i64,
        expired_at: i64,
    },
    /// A withdrawal from the order
    #[serde(rename = "withdrawal")]
    Withdrawal {
        amount: String,
        amount_formatted: String,
        remaining_after: String,
        remaining_after_formatted: String,
        tx_hash: Option<String>,
        created_at: DateTime<Utc>,
    },
}

/// Order activities response
#[derive(Debug, Serialize)]
pub struct OrderActivitiesResponse {
    pub order: OrderDto,
    pub activities: Vec<OrderActivity>,
    pub token_symbol: String,
    pub token_decimals: u8,
}

/// GET /api/orders/:order_id/activities
/// Get order with all activities (trades + withdrawals) for timeline display
pub async fn get_order_activities(
    State(state): State<AppState>,
    Path(order_id): Path<String>,
) -> ApiResult<Json<OrderActivitiesResponse>> {
    // Get the order
    let order = state.db.get_order(&order_id).await?;
    
    // Get token info
    let (token_symbol, token_decimals) = get_token_info(&order.token);
    
    // Get ALL trades for this order (including pending and expired)
    let trades = state.db.get_all_trades_by_order(&order_id).await?;
    
    // Get withdrawals for this order
    let withdrawals = state.db.get_withdrawals_by_order(&order_id).await?;
    
    // Build activities list
    let mut activities: Vec<OrderActivity> = Vec::new();
    
    // Get fee rate from blockchain config (cached) - used only as fallback
    let fee_rate_bps: u128 = match state.get_config_for_chain(order.chain_id as u64, false).await {
        Ok(config) => config.fee_rate_bps.parse().unwrap_or(100), // Default 1% if parsing fails
        Err(_) => 100, // Default 1% if config fetch fails
    };
    
    // Add trades based on status
    // Status: 0=PENDING, 1=SETTLED, 2=EXPIRED
    for trade in trades {
        match trade.status {
            0 => {
                // Pending trade
                activities.push(OrderActivity::PendingTrade {
                    trade_id: trade.trade_id,
                    buyer: trade.buyer,
                    token_amount: trade.token_amount.clone(),
                    token_amount_formatted: format_token_amount(&trade.token_amount, token_decimals, ""),
                    cny_amount: trade.cny_amount.clone(),
                    cny_amount_formatted: format_cny(&trade.cny_amount),
                    created_at: trade.created_at,
                    expires_at: trade.expires_at,
                });
            }
            1 => {
                // Settled trade
                let fee_amount = match &trade.fee_amount {
                    Some(fee) => fee.clone(),
                    None => {
                        let token_amount_u128: u128 = trade.token_amount.parse().unwrap_or(0);
                        ((token_amount_u128 * fee_rate_bps) / 10000).to_string()
                    }
                };
                
                activities.push(OrderActivity::Trade {
                    trade_id: trade.trade_id,
                    buyer: trade.buyer,
                    token_amount: trade.token_amount.clone(),
                    token_amount_formatted: format_token_amount(&trade.token_amount, token_decimals, ""),
                    fee_amount: fee_amount.clone(),
                    fee_amount_formatted: format_token_amount(&fee_amount, token_decimals, ""),
                    cny_amount: trade.cny_amount.clone(),
                    cny_amount_formatted: format_cny(&trade.cny_amount),
                    settlement_tx: trade.settlement_tx_hash,
                    settled_at: trade.created_at,
                });
            }
            2 => {
                // Expired trade
                activities.push(OrderActivity::ExpiredTrade {
                    trade_id: trade.trade_id,
                    buyer: trade.buyer,
                    token_amount: trade.token_amount.clone(),
                    token_amount_formatted: format_token_amount(&trade.token_amount, token_decimals, ""),
                    cny_amount: trade.cny_amount.clone(),
                    cny_amount_formatted: format_cny(&trade.cny_amount),
                    created_at: trade.created_at,
                    expired_at: trade.expires_at,
                });
            }
            _ => {
                // Unknown status, skip
            }
        }
    }
    
    // Add withdrawals
    for w in withdrawals {
        activities.push(OrderActivity::Withdrawal {
            amount: w.amount.clone(),
            amount_formatted: format_token_amount(&w.amount, token_decimals, ""),
            remaining_after: w.remaining_after.clone(),
            remaining_after_formatted: format_token_amount(&w.remaining_after, token_decimals, ""),
            tx_hash: w.tx_hash,
            created_at: w.created_at,
        });
    }
    
    // Sort activities by timestamp (most recent first)
    // We need to extract a common timestamp for sorting
    activities.sort_by(|a, b| {
        let ts_a = match a {
            OrderActivity::Trade { settled_at, .. } => *settled_at,
            OrderActivity::PendingTrade { created_at, .. } => *created_at,
            OrderActivity::ExpiredTrade { created_at, .. } => *created_at,
            OrderActivity::Withdrawal { created_at, .. } => created_at.timestamp(),
        };
        let ts_b = match b {
            OrderActivity::Trade { settled_at, .. } => *settled_at,
            OrderActivity::PendingTrade { created_at, .. } => *created_at,
            OrderActivity::ExpiredTrade { created_at, .. } => *created_at,
            OrderActivity::Withdrawal { created_at, .. } => created_at.timestamp(),
        };
        ts_b.cmp(&ts_a) // Descending order (most recent first)
    });
    
    Ok(Json(OrderActivitiesResponse {
        order: order_to_dto(order),
        activities,
        token_symbol,
        token_decimals,
    }))
}

/// Get token symbol and decimals from address (Base Mainnet + Ethereum Mainnet)
fn get_token_info(token_address: &str) -> (String, u8) {
    let addr = token_address.to_lowercase();
    match addr.as_str() {
        // Base Mainnet
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" => ("USDC".to_string(), 6),
        "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca" => ("USDbC".to_string(), 6),
        "0x50c5725949a6f0c72e6c4a641f24049a917db0cb" => ("DAI".to_string(), 18),
        "0x4200000000000000000000000000000000000006" => ("WETH".to_string(), 18),
        "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" => ("cbBTC".to_string(), 8),
        // Ethereum Mainnet
        "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" => ("USDC".to_string(), 6),
        "0xdac17f958d2ee523a2206206994597c13d831ec7" => ("USDT".to_string(), 6),
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" => ("WETH".to_string(), 18),
        "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599" => ("WBTC".to_string(), 8),
        // Default: assume 18 decimals (ERC20 standard)
        _ => ("TOKEN".to_string(), 18),
    }
}

/// Format CNY amount (stored as cents)
fn format_cny(cents: &str) -> String {
    let cents_u64: u64 = cents.parse().unwrap_or(0);
    let yuan = cents_u64 / 100;
    let fen = cents_u64 % 100;
    format!("¥{}.{:02}", yuan, fen)
}

// ============================================================================
// Payment Info Endpoint (v4 - Privacy)
// ============================================================================
//
// On-chain: Only accountLinesHash is stored (for trustless verification)
// Database: Plain text accountId/accountName stored here for buyer display
//
// Flow:
// 1. Frontend creates order on-chain with accountLinesHash
// 2. Frontend calls this endpoint with plain text
// 3. Backend verifies hash matches (computed == on-chain), then stores plain text
//

/// Request body for submitting payment info
#[derive(Debug, Deserialize)]
pub struct PaymentInfoRequest {
    pub account_id: String,
    pub account_name: String,
    pub chain_id: Option<u64>,  // Required for blockchain hash verification when order not yet in DB
    pub tx_hash: Option<String>,  // Fallback: if order_id is actually a tx hash, backend can look up real orderId
}

/// Response for payment info submission
#[derive(Debug, Serialize)]
pub struct PaymentInfoResponse {
    pub success: bool,
    pub message: String,
    pub computed_hash: String,
}

/// POST /api/orders/:order_id/payment-info
/// Submit plain text payment info for an order (seller only)
/// 
/// This endpoint:
/// 1. Computes account_lines_hash from the submitted plain text
/// 2. Queries blockchain to verify the hash matches on-chain
/// 3. Stores the plain text in the database if verified
#[axum::debug_handler]
pub async fn submit_payment_info(
    State(state): State<AppState>,
    Path(order_id): Path<String>,
    Json(req): Json<PaymentInfoRequest>,
) -> ApiResult<Json<PaymentInfoResponse>> {
    use crate::api::error::ApiError;
    use crate::crypto::compute_account_lines_hash;
    
    // Validate input
    if req.account_id.trim().is_empty() || req.account_name.trim().is_empty() {
        return Err(ApiError::BadRequest("account_id and account_name cannot be empty".to_string()));
    }
    
    // Compute account_lines_hash = SHA256(20 || account_name || 21 || account_id)
    let computed_hash = compute_account_lines_hash(&req.account_name, &req.account_id);
    let computed_hash_hex = format!("0x{}", hex::encode(computed_hash));
    
    tracing::info!(
        "📝 Payment info submitted for order {}:\n  \
        account_id: {}\n  \
        account_name: {}\n  \
        computed_hash: {}",
        order_id,
        req.account_id,
        req.account_name,
        computed_hash_hex
    );
    
    // Try to fetch order from DB (may not exist yet if payment-info arrives before event listener)
    let order = state.db.get_order(&order_id).await.ok();
    
    // Check if payment info already exists (updates not allowed)
    if let Some(ref order) = order {
        if !order.alipay_id.is_empty() && !order.alipay_name.is_empty() {
            tracing::warn!("❌ Payment info update rejected for order {} - updates not allowed", order_id);
            return Err(ApiError::BadRequest(
                "Payment info already set. Updates are not allowed. Please create a new order if you need different payment details.".to_string()
            ));
        }
    }
    
    // Determine chain_id: from DB order if available, otherwise from request body
    let chain_id = order.as_ref()
        .map(|o| o.chain_id as u64)
        .or(req.chain_id);
    
    // CRITICAL: Always verify submitted payment info against on-chain accountLinesHash.
    // This ensures the plain text matches what the seller committed on-chain.
    // Without this check, anyone could submit fake payment info for any order.
    //
    // FALLBACK: If the order_id from the URL doesn't exist on-chain (all-zeros hash),
    // the frontend may have sent a tx hash instead. Use tx_hash to look up the real orderId.
    let mut effective_order_id = order_id.clone();
    
    if let Some(chain_id) = chain_id {
        if let Some(blockchain_client) = state.get_blockchain_client(chain_id) {
            const MAX_RETRIES: u32 = 3;
            const RETRY_DELAY_SECS: u64 = 3;
            
            let mut verified = false;
            let mut last_on_chain_hash_hex = String::new();
            let mut got_zero_hash = false;
            
            for attempt in 1..=MAX_RETRIES {
                match blockchain_client.get_order_hash(&effective_order_id).await {
                    Ok(on_chain_hash) => {
                        last_on_chain_hash_hex = format!("0x{}", hex::encode(on_chain_hash));
                        
                        if on_chain_hash == computed_hash {
                            tracing::info!("✅ Hash verified on-chain for order {} (attempt {})", effective_order_id, attempt);
                            verified = true;
                            break;
                        } else if on_chain_hash == [0u8; 32] {
                            // Order doesn't exist on-chain — might be a tx hash instead
                            got_zero_hash = true;
                            if attempt < MAX_RETRIES {
                                tracing::info!(
                                    "⏳ Order {} returns zero hash (attempt {}/{}), may not exist yet or may be a tx hash, retrying...",
                                    effective_order_id, attempt, MAX_RETRIES
                                );
                                tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                            }
                        } else if attempt < MAX_RETRIES {
                            tracing::info!(
                                "⏳ Hash mismatch for order {} (attempt {}/{}), waiting {}s for RPC sync...",
                                effective_order_id, attempt, MAX_RETRIES, RETRY_DELAY_SECS
                            );
                            tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("⚠️ Could not query on-chain hash for order {} (attempt {}): {}", 
                            effective_order_id, attempt, e);
                        if attempt < MAX_RETRIES {
                            tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY_SECS)).await;
                        }
                    }
                }
            }
            
            // FALLBACK: If we got zero hashes (order doesn't exist), try tx_hash to find real orderId
            if !verified && got_zero_hash {
                if let Some(ref tx_hash) = req.tx_hash {
                    tracing::info!("🔄 Order {} not found on-chain (zero hash). Trying tx_hash fallback: {}", effective_order_id, tx_hash);
                    match blockchain_client.get_order_id_from_tx(tx_hash).await {
                        Ok(real_order_id) => {
                            tracing::info!("🔄 Found real order ID from tx receipt: {} (was: {})", real_order_id, effective_order_id);
                            effective_order_id = real_order_id;
                            
                            // Verify hash with the real order ID
                            match blockchain_client.get_order_hash(&effective_order_id).await {
                                Ok(on_chain_hash) => {
                                    last_on_chain_hash_hex = format!("0x{}", hex::encode(on_chain_hash));
                                    if on_chain_hash == computed_hash {
                                        tracing::info!("✅ Hash verified for real order {} (via tx_hash fallback)", effective_order_id);
                                        verified = true;
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!("⚠️ Could not verify hash for real order {}: {}", effective_order_id, e);
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("⚠️ Could not extract order ID from tx {}: {}", tx_hash, e);
                        }
                    }
                } else {
                    tracing::warn!("⚠️ Order {} has zero hash and no tx_hash provided for fallback", effective_order_id);
                }
            }
            
            if !verified {
                tracing::warn!(
                    "❌ Hash verification failed for order {} after retries:\n  computed: {}\n  on-chain: {}",
                    effective_order_id, computed_hash_hex, last_on_chain_hash_hex
                );
                return Err(ApiError::BadRequest(format!(
                    "Hash mismatch: computed {} != on-chain {}. The submitted account info does not match what was committed on-chain.",
                    computed_hash_hex, last_on_chain_hash_hex
                )));
            }
        } else {
            tracing::warn!("⚠️ No blockchain client for chain {}, rejecting unverified payment info", chain_id);
            return Err(ApiError::BadRequest(format!("Cannot verify: no blockchain client for chain {}", chain_id)));
        }
    } else {
        // No chain_id from DB or request — cannot verify. Reject.
        tracing::warn!("❌ Cannot verify payment info for order {} — no chain_id available", effective_order_id);
        return Err(ApiError::BadRequest(
            "chain_id is required when order is not yet synced. Please include chain_id in the request.".to_string()
        ));
    }
    
    // Store plain text in database using the effective (possibly resolved) order ID
    state.db.update_payment_info(&effective_order_id, &req.account_id, &req.account_name).await?;
    
    tracing::info!("✅ Payment info stored for order {} (requested as {})", effective_order_id, order_id);
    
    Ok(Json(PaymentInfoResponse {
        success: true,
        message: "Payment info stored successfully".to_string(),
        computed_hash: computed_hash_hex,
    }))
}
