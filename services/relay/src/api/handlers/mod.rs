//! API Handlers
//! 
//! Simplified structure:
//! - orders.rs: Read-only order listing
//! - trades.rs: Read-only trade queries
//! - settlement.rs: PDF validation and proof submission
//! - account.rs: Account settings (email notifications) - account-based, not role-based

pub mod account;
pub mod orders;
pub mod trades;
pub mod settlement;

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
// Note: serde::Deserialize removed - all admin request structs removed for security

use crate::api::{
    error::{ApiError, ApiResult},
    state::AppState,
    types::HealthResponse,
};

// Re-export handlers
pub use orders::{get_active_orders, get_order_activities, get_order_by_private_code, set_order_visibility, submit_payment_info};
pub use trades::{get_trade_handler, get_trades_by_buyer_handler, get_trades_by_seller_handler, create_trade_handler};
pub use settlement::validate_handler;

/// Health check endpoint
pub async fn health_check(State(state): State<AppState>) -> ApiResult<Json<HealthResponse>> {
    let db_status = match state.db.health_check().await {
        Ok(_) => "healthy",
        Err(_) => "unhealthy",
    };

    Ok(Json(HealthResponse {
        status: "ok".to_string(),
        database: db_status.to_string(),
        orderbook: "read-only".to_string(),
        timestamp: Utc::now().to_rfc3339(),
    }))
}

/// Debug database endpoint - returns all orders and trades with chain info
/// GET /api/debug/database
pub async fn debug_database(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    // Get all active orders (no limit, all chains)
    let orders = state.db.get_active_orders(None, None).await?;
    
    // Get all trades
    let trades = state.db.get_all_trades().await.unwrap_or_default();
    
    // Build per-chain summary
    let mut base_orders = 0u32;
    let mut eth_orders = 0u32;
    for order in &orders {
        match order.chain_id {
            8453 => base_orders += 1,
            1 => eth_orders += 1,
            _ => {}
        }
    }
    
    let mut base_trades = 0u32;
    let mut eth_trades = 0u32;
    let mut base_pending = 0u32;
    let mut eth_pending = 0u32;
    let mut base_settled = 0u32;
    let mut eth_settled = 0u32;
    for trade in &trades {
        match trade.chain_id {
            8453 => {
                base_trades += 1;
                match trade.status { 0 => base_pending += 1, 1 => base_settled += 1, _ => {} }
            }
            1 => {
                eth_trades += 1;
                match trade.status { 0 => eth_pending += 1, 1 => eth_settled += 1, _ => {} }
            }
            _ => {}
        }
    }
    
    // Get chain configs
    let mut chain_configs = serde_json::Map::new();
    for (&chain_id, _) in state.blockchain_clients.iter() {
        let chain_name = match chain_id { 8453 => "Base", 1 => "Ethereum", _ => "Unknown" };
        if let Ok(config) = state.get_config_for_chain(chain_id, false).await {
            chain_configs.insert(chain_name.to_string(), serde_json::json!({
                "chain_id": chain_id,
                "config": config,
            }));
        } else {
            chain_configs.insert(chain_name.to_string(), serde_json::json!({
                "chain_id": chain_id,
                "config": "failed to fetch",
            }));
        }
    }
    
    // Get gas cost summaries
    let gas_summary_base = state.db.get_gas_cost_summary(8453).await.ok();
    let gas_summary_eth = state.db.get_gas_cost_summary(1).await.ok();
    
    Ok(Json(serde_json::json!({
        "summary": {
            "base": {
                "chain_id": 8453,
                "orders": base_orders,
                "trades": base_trades,
                "trades_pending": base_pending,
                "trades_settled": base_settled,
                "gas_costs": gas_summary_base,
            },
            "ethereum": {
                "chain_id": 1,
                "orders": eth_orders,
                "trades": eth_trades,
                "trades_pending": eth_pending,
                "trades_settled": eth_settled,
                "gas_costs": gas_summary_eth,
            },
        },
        "chain_configs": chain_configs,
        "orders": orders,
        "trades": trades,
    })))
}

// ============ Admin Endpoints ============

/// GET /api/admin/config - Get contract configuration for all chains (cached, 15 min TTL)
/// Query params:
///   - refresh=true: Force refresh from blockchain (bypasses cache)
///   - chain_id=8453: Get config for specific chain only (optional)
pub async fn get_contract_config(
    State(state): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Json<serde_json::Value>> {
    let force_refresh = params.get("refresh").map(|v| v == "true").unwrap_or(false);
    
    // If specific chain_id requested, return just that chain's config
    if let Some(chain_id_str) = params.get("chain_id") {
        if let Ok(chain_id) = chain_id_str.parse::<u64>() {
            let config = state.get_config_for_chain(chain_id, force_refresh).await
                .map_err(|e| ApiError::BlockchainError(e))?;
            return Ok(Json(serde_json::json!({
                "chain_id": chain_id,
                "config": config,
            })));
        }
    }
    
    // Otherwise return configs for ALL chains
    let mut configs = serde_json::Map::new();
    for (&chain_id, _) in state.blockchain_clients.iter() {
        let chain_name = match chain_id { 8453 => "Base", 1 => "Ethereum", _ => "Unknown" };
        match state.get_config_for_chain(chain_id, force_refresh).await {
            Ok(config) => {
                configs.insert(chain_name.to_string(), serde_json::json!({
                    "chain_id": chain_id,
                    "config": config,
                }));
            }
            Err(e) => {
                configs.insert(chain_name.to_string(), serde_json::json!({
                    "chain_id": chain_id,
                    "error": e,
                }));
            }
        }
    }
    
    Ok(Json(serde_json::json!(configs)))
}

// ============ Admin Write Endpoints REMOVED for Security ============
// All contract modifications must be done directly via cast/forge with the owner wallet.
// This prevents public API from being exploited to modify contract state.
// 
// Removed endpoints:
// - POST /api/admin/update-config
// - POST /api/admin/update-public-key-hash
// - POST /api/admin/withdraw-fees
// - POST /api/admin/update-public-fee
// - POST /api/admin/update-private-fee
// - POST /api/admin/update-eth-price
// - POST /api/admin/update-btc-price
//
// To modify contract config, use cast directly:
// cast send --rpc-url $RPC --private-key $OWNER_KEY $CONTRACT "setMinTradeValue(uint256)" 10000

// ============ Trade File Endpoints ============

/// GET /api/trades/:trade_id/pdf - Download the PDF for a trade
pub async fn get_trade_pdf(
    State(state): State<AppState>,
    Path(trade_id): Path<String>,
) -> Result<Response, ApiError> {
    // Get the trade from the database
    let trade = state.db.get_trade(&trade_id).await?;
    
    // Check if PDF exists
    let pdf_file = trade.pdf_file.ok_or_else(|| {
        ApiError::NotFound(format!("No PDF uploaded for trade {}", trade_id))
    })?;
    
    let filename = trade.pdf_filename.unwrap_or_else(|| "receipt.pdf".to_string());
    
    // Return the PDF with proper headers
    let response = (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (header::CONTENT_DISPOSITION, &format!("inline; filename=\"{}\"", filename)),
        ],
        pdf_file,
    ).into_response();
    
    Ok(response)
}
