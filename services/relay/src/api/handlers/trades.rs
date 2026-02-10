//! Trade handlers - trade creation and queries
//! 
//! Trade creation is done by the relay wallet on behalf of buyers.
//! Buyers don't need to connect a wallet - the relay pays for gas.

use axum::{
    extract::{Path, State},
    Json,
};
use ethers::types::{Address, U256};
use serde::{Deserialize, Serialize};

use crate::api::{
    error::{ApiError, ApiResult},
    state::AppState,
};

/// GET /api/trades/:trade_id
/// Get trade details by ID
pub async fn get_trade_handler(
    Path(trade_id): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<crate::db::models::DbTrade>> {
    // Query trade from database using dynamic query
    let trade = sqlx::query(
        r#"
        SELECT 
            "tradeId", "orderId", "buyer", "tokenAmount"::text, "cnyAmount"::text, "feeAmount"::text,
            "rail", "transactionId", "paymentTime",
            "createdAt", "expiresAt", "status",
            "escrowTxHash", "settlementTxHash", "syncedAt",
            pdf_file, pdf_filename, pdf_uploaded_at,
            proof_user_public_values, proof_accumulator, proof_data,
            axiom_proof_id, proof_generated_at, proof_json, settlement_error,
            "chainId"
        FROM trades
        WHERE "tradeId" = $1
        "#,
    )
    .bind(&trade_id)
    .fetch_optional(state.db.pool())
    .await
    .map_err(|e| ApiError::Database(e.to_string()))?
    .ok_or_else(|| ApiError::NotFound(format!("Trade not found: {}", trade_id)))?;

    // Manually map to DbTrade
    use sqlx::Row;
    let db_trade = crate::db::models::DbTrade {
        trade_id: trade.get("tradeId"),
        order_id: trade.get("orderId"),
        buyer: trade.get("buyer"),
        token_amount: trade.get("tokenAmount"),
        cny_amount: trade.get("cnyAmount"),
        fee_amount: trade.get("feeAmount"),
        rail: trade.get("rail"),
        transaction_id: trade.get("transactionId"),
        payment_time: trade.get("paymentTime"),
        created_at: trade.get("createdAt"),
        expires_at: trade.get("expiresAt"),
        status: trade.get("status"),
        escrow_tx_hash: trade.get("escrowTxHash"),
        settlement_tx_hash: trade.get("settlementTxHash"),
        synced_at: trade.get("syncedAt"),
        token: None, // Not available in single trade query (would need JOIN)
        pdf_file: trade.get("pdf_file"),
        pdf_filename: trade.get("pdf_filename"),
        pdf_uploaded_at: trade.get("pdf_uploaded_at"),
        proof_user_public_values: trade.get("proof_user_public_values"),
        proof_accumulator: trade.get("proof_accumulator"),
        proof_data: trade.get("proof_data"),
        axiom_proof_id: trade.get("axiom_proof_id"),
        proof_generated_at: trade.get("proof_generated_at"),
        proof_json: trade.get("proof_json"),
        settlement_error: trade.get("settlement_error"),
        chain_id: trade.get("chainId"),
        alipay_id: None,
        alipay_name: None,
    };

    Ok(Json(db_trade))
}

/// GET /api/trades/buyer/:buyer_address
/// Get all trades for a specific buyer
#[derive(Debug, Serialize)]
pub struct TradesResponse {
    pub trades: Vec<crate::db::models::DbTrade>,
}

pub async fn get_trades_by_buyer_handler(
    Path(buyer_address): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<TradesResponse>> {
    // Normalize buyer address (lowercase, strip 0x if present)
    let buyer_addr = buyer_address
        .to_lowercase()
        .trim_start_matches("0x")
        .to_string();
    
    // Query trades table with JOIN to get token from orders
    let trades = sqlx::query(
        r#"
        SELECT 
            t."tradeId", t."orderId", t.buyer,
            t."tokenAmount"::text, t."cnyAmount"::text, t."feeAmount"::text,
            t.rail, t."transactionId", t."paymentTime",
            t."createdAt", t."expiresAt", t.status,
            t."escrowTxHash", t."settlementTxHash", t."syncedAt",
            t.pdf_file, t.pdf_filename, t.pdf_uploaded_at,
            t.proof_user_public_values, t.proof_accumulator, t.proof_data,
            t.axiom_proof_id, t.proof_generated_at, t.proof_json, t.settlement_error,
            t."chainId",
            o.token,
            o."accountId" as "alipay_id",
            o."accountName" as "alipay_name"
        FROM trades t
        INNER JOIN orders o ON t."orderId" = o."orderId"
        WHERE LOWER(REPLACE(t.buyer, '0x', '')) = $1
        ORDER BY t."createdAt" DESC
        "#
    )
    .bind(&buyer_addr)
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| ApiError::Database(e.to_string()))?;
    
    // Map to DbTrade structs
    let db_trades: Vec<crate::db::models::DbTrade> = trades
        .into_iter()
        .map(|row| {
            use sqlx::Row;
            crate::db::models::DbTrade {
                trade_id: row.get("tradeId"),
                order_id: row.get("orderId"),
                buyer: row.get("buyer"),
                token_amount: row.get("tokenAmount"),
                cny_amount: row.get("cnyAmount"),
                fee_amount: row.get("feeAmount"),
                rail: row.get("rail"),
                transaction_id: row.get("transactionId"),
                payment_time: row.get("paymentTime"),
                created_at: row.get("createdAt"),
                expires_at: row.get("expiresAt"),
                status: row.get("status"),
                escrow_tx_hash: row.get("escrowTxHash"),
                settlement_tx_hash: row.get("settlementTxHash"),
                synced_at: row.get("syncedAt"),
                pdf_file: row.get("pdf_file"),
                pdf_filename: row.get("pdf_filename"),
                pdf_uploaded_at: row.get("pdf_uploaded_at"),
                proof_user_public_values: row.get("proof_user_public_values"),
                proof_accumulator: row.get("proof_accumulator"),
                proof_data: row.get("proof_data"),
                axiom_proof_id: row.get("axiom_proof_id"),
                proof_generated_at: row.get("proof_generated_at"),
                proof_json: row.get("proof_json"),
                settlement_error: row.get("settlement_error"),
                chain_id: row.get("chainId"),
                token: Some(row.get("token")),
                alipay_id: row.get("alipay_id"),
                alipay_name: row.get("alipay_name"),
            }
        })
        .collect();
    
    Ok(Json(TradesResponse { trades: db_trades }))
}

/// GET /api/trades/seller/:seller_address
/// Get all trades on orders created by a specific seller
pub async fn get_trades_by_seller_handler(
    Path(seller_address): Path<String>,
    State(state): State<AppState>,
) -> ApiResult<Json<TradesResponse>> {
    // Normalize seller address (lowercase, strip 0x if present)
    let seller_addr = seller_address
        .to_lowercase()
        .trim_start_matches("0x")
        .to_string();
    
    // Query trades table with JOIN to get orders where seller matches
    let trades = sqlx::query(
        r#"
        SELECT 
            t."tradeId", t."orderId", t.buyer,
            t."tokenAmount"::text, t."cnyAmount"::text, t."feeAmount"::text,
            t.rail, t."transactionId", t."paymentTime",
            t."createdAt", t."expiresAt", t.status,
            t."escrowTxHash", t."settlementTxHash", t."syncedAt",
            t.pdf_file, t.pdf_filename, t.pdf_uploaded_at,
            t.proof_user_public_values, t.proof_accumulator, t.proof_data,
            t.axiom_proof_id, t.proof_generated_at, t.proof_json, t.settlement_error,
            t."chainId",
            COALESCE(t.token, o.token) as token,
            o."accountId" as "alipay_id",
            o."accountName" as "alipay_name"
        FROM trades t
        LEFT JOIN orders o ON t."orderId" = o."orderId"
        WHERE LOWER(REPLACE(o.seller, '0x', '')) = $1
        ORDER BY t."createdAt" DESC
        "#
    )
    .bind(&seller_addr)
    .fetch_all(state.db.pool())
    .await
    .map_err(|e| ApiError::Database(e.to_string()))?;
    
    // Map to DbTrade structs
    let db_trades: Vec<crate::db::models::DbTrade> = trades
        .into_iter()
        .map(|row| {
            use sqlx::Row;
            crate::db::models::DbTrade {
                trade_id: row.get("tradeId"),
                order_id: row.get("orderId"),
                buyer: row.get("buyer"),
                token_amount: row.get("tokenAmount"),
                cny_amount: row.get("cnyAmount"),
                fee_amount: row.get("feeAmount"),
                rail: row.get("rail"),
                transaction_id: row.get("transactionId"),
                payment_time: row.get("paymentTime"),
                created_at: row.get("createdAt"),
                expires_at: row.get("expiresAt"),
                status: row.get("status"),
                escrow_tx_hash: row.get("escrowTxHash"),
                settlement_tx_hash: row.get("settlementTxHash"),
                synced_at: row.get("syncedAt"),
                pdf_file: row.get("pdf_file"),
                pdf_filename: row.get("pdf_filename"),
                pdf_uploaded_at: row.get("pdf_uploaded_at"),
                proof_user_public_values: row.get("proof_user_public_values"),
                proof_accumulator: row.get("proof_accumulator"),
                proof_data: row.get("proof_data"),
                axiom_proof_id: row.get("axiom_proof_id"),
                proof_generated_at: row.get("proof_generated_at"),
                proof_json: row.get("proof_json"),
                settlement_error: row.get("settlement_error"),
                chain_id: row.get("chainId"),
                token: row.get("token"),
                alipay_id: row.get("alipay_id"),
                alipay_name: row.get("alipay_name"),
            }
        })
        .collect();
    
    Ok(Json(TradesResponse { trades: db_trades }))
}

// ============ Trade Creation ============

/// Request body for creating a trade
#[derive(Debug, Deserialize)]
pub struct CreateTradeRequest {
    /// Order ID to fill (0x-prefixed hex string)
    pub order_id: String,
    /// Buyer's address (0x-prefixed)
    pub buyer_address: String,
    /// Fiat amount in cents (must be divisible by 100 for whole yuan amounts)
    pub fiat_amount: String,
}

/// Response for create trade
#[derive(Debug, Serialize)]
pub struct CreateTradeResponse {
    pub trade_id: String,
    pub order_id: String,
    pub buyer: String,
    pub tx_hash: String,
    pub message: String,
}

/// POST /api/trades/create
/// Create a new trade by filling an order
/// 
/// The relay wallet pays for gas - buyers don't need to connect a wallet.
pub async fn create_trade_handler(
    State(state): State<AppState>,
    Json(request): Json<CreateTradeRequest>,
) -> ApiResult<Json<CreateTradeResponse>> {
    tracing::info!(
        "Creating trade: order_id={}, buyer={}, fiat_amount={}",
        request.order_id,
        request.buyer_address,
        request.fiat_amount
    );

    // Parse order ID (bytes32)
    let order_id_hex = request.order_id.strip_prefix("0x").unwrap_or(&request.order_id);
    let order_id_bytes = hex::decode(order_id_hex)
        .map_err(|e| ApiError::BadRequest(format!("Invalid order_id hex: {}", e)))?;
    
    if order_id_bytes.len() != 32 {
        return Err(ApiError::BadRequest("order_id must be 32 bytes".to_string()));
    }
    
    let mut order_id: [u8; 32] = [0u8; 32];
    order_id.copy_from_slice(&order_id_bytes);

    // Look up the order to determine which chain to use
    let order = state.db.get_order(&request.order_id).await
        .map_err(|_| ApiError::NotFound(format!("Order not found: {}", request.order_id)))?;
    let chain_id = order.chain_id as u64;
    
    // Get the correct blockchain client for this order's chain
    let blockchain_client = state.get_blockchain_client(chain_id)
        .ok_or_else(|| ApiError::ServiceUnavailable(
            format!("Blockchain client not available for chain {}", chain_id)
        ))?;

    // Parse buyer address
    let buyer_address: Address = request.buyer_address.parse()
        .map_err(|e| ApiError::BadRequest(format!("Invalid buyer_address: {}", e)))?;

    // Parse fiat amount as decimal (in cents, must be divisible by 100 for whole yuan)
    let fiat_amount: U256 = U256::from_dec_str(&request.fiat_amount)
        .map_err(|e| ApiError::BadRequest(format!("Invalid fiat_amount (must be decimal): {}", e)))?;
    
    // Validate that fiat amount is whole yuan (divisible by 100)
    if fiat_amount % U256::from(100) != U256::zero() {
        return Err(ApiError::BadRequest("fiat_amount must be whole yuan (divisible by 100)".to_string()));
    }

    // Call fillOrder on-chain via relay wallet (using correct chain client)
    let (tx_hash, trade_id) = blockchain_client.fill_order(order_id, buyer_address, fiat_amount)
        .await
        .map_err(|e| ApiError::BlockchainError(format!("fillOrder failed on chain {}: {}", chain_id, e)))?;

    let trade_id_hex = format!("0x{}", hex::encode(trade_id));
    let tx_hash_hex = format!("{:#x}", tx_hash);

    tracing::info!(
        "Trade created on chain {}: trade_id={}, tx_hash={}",
        chain_id,
        trade_id_hex,
        tx_hash_hex
    );

    Ok(Json(CreateTradeResponse {
        trade_id: trade_id_hex,
        order_id: request.order_id,
        buyer: request.buyer_address,
        tx_hash: tx_hash_hex,
        message: "Trade created successfully".to_string(),
    }))
}
