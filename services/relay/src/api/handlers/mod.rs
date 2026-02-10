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

/// Debug database endpoint - returns all orders and trades for debugging purposes
/// GET /api/debug/database
pub async fn debug_database(State(state): State<AppState>) -> ApiResult<Json<serde_json::Value>> {
    // Get all active orders (no limit)
    let orders = state.db.get_active_orders(None).await?;
    
    // Get all trades
    let trades = state.db.get_all_trades().await.unwrap_or_default();
    
    Ok(Json(serde_json::json!({
        "orders": orders,
        "trades": trades
    })))
}

// ============ Admin Endpoints ============

/// GET /api/admin/config - Get contract configuration (cached, 15 min TTL)
/// Query params:
///   - refresh=true: Force refresh from blockchain (bypasses cache)
pub async fn get_contract_config(
    State(state): State<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> ApiResult<Json<serde_json::Value>> {
    let force_refresh = params.get("refresh").map(|v| v == "true").unwrap_or(false);
    
    let config = state.get_config(force_refresh).await
        .map_err(|e| ApiError::BlockchainError(e))?;
    
    Ok(Json(serde_json::json!(config)))
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
