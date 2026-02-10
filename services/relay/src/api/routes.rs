use axum::{
    routing::{get, post, delete},
    Router,
};
use tower_http::cors::{CorsLayer, Any};

use crate::api::{handlers, state::AppState};
use crate::auth;

/// Create the API router
/// 
/// Endpoints:
/// - GET  /api/auth/nonce              - Get SIWE nonce
/// - POST /api/auth/verify             - Verify SIWE signature, get JWT
/// - GET  /health                      - Health check
/// - GET  /api/orders/active           - List active sell orders (auth required for ?seller=)
/// - GET  /api/orders/:id/activities   - Get order with activity timeline
/// - GET  /api/trades/:id              - Get trade by ID
/// - GET  /api/trades/buyer/:addr      - Get trades by buyer
/// - POST /api/trades/:id/validate     - Upload PDF + quick validation (~10s)
pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // Authentication (SIWE)
        .route("/api/auth/nonce", get(auth::get_nonce))
        .route("/api/auth/verify", post(auth::verify_siwe))
        
        // Health
        .route("/health", get(handlers::health_check))
        
        // Orders (read-only + visibility + payment-info)
        .route("/api/orders/active", get(handlers::get_active_orders))
        .route("/api/orders/private/:code", get(handlers::get_order_by_private_code))
        .route("/api/orders/:order_id/activities", get(handlers::get_order_activities))
        .route("/api/orders/:order_id/visibility", post(handlers::set_order_visibility))
        .route("/api/orders/:order_id/payment-info", post(handlers::submit_payment_info))
        
        // Trades
        .route("/api/trades/create", post(handlers::create_trade_handler))
        .route("/api/trades/:trade_id", get(handlers::get_trade_handler))
        .route("/api/trades/buyer/:buyer_address", get(handlers::get_trades_by_buyer_handler))
        .route("/api/trades/seller/:seller_address", get(handlers::get_trades_by_seller_handler))
        
        // Settlement
        .route("/api/trades/:trade_id/validate", post(handlers::validate_handler))
        
        // Debug endpoints (for development)
        .route("/api/debug/database", get(handlers::debug_database))
        
        // Admin endpoints (read-only - all write operations removed for security)
        // Contract modifications must be done directly via cast/forge with owner wallet
        .route("/api/admin/config", get(handlers::get_contract_config))
        
        // Trade file endpoints
        .route("/api/trades/:trade_id/pdf", get(handlers::get_trade_pdf))
        
        // Account settings (email notifications) - account-based, not role-based
        .route("/api/account/email", post(handlers::account::set_account_email))
        .route("/api/account/email", get(handlers::account::get_account_email))
        .route("/api/account/email", delete(handlers::account::delete_account_email))
        .route("/api/account/email/toggle", post(handlers::account::toggle_account_email))
        
        .layer(cors)
        .with_state(state)
}
