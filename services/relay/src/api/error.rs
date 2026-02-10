use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use crate::db::DbError;

/// API error type that can be converted to HTTP responses
#[derive(Debug)]
pub enum ApiError {
    /// Database errors
    Database(String),
    
    /// Blockchain errors
    BlockchainError(String),
    
    /// Invalid request (validation errors)
    BadRequest(String),
    
    /// Authentication required or failed (401)
    Unauthorized(String),
    
    /// Resource not found
    NotFound(String),
    
    /// Service unavailable (e.g., blockchain integration disabled)
    ServiceUnavailable(String),
    
    /// Internal server error
    Internal(String),
}

impl From<DbError> for ApiError {
    fn from(err: DbError) -> Self {
        match err {
            DbError::OrderNotFound(id) => ApiError::NotFound(format!("Order not found: {}", id)),
            DbError::TradeNotFound(id) => ApiError::NotFound(format!("Trade not found: {}", id)),
            _ => ApiError::Database(format!("{:?}", err)),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            ApiError::Database(err) => {
                // Log the actual database error for debugging
                tracing::error!("Database error: {:?}", err);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            }
            ApiError::BlockchainError(err) => {
                tracing::error!("Blockchain error: {}", err);
                (StatusCode::BAD_GATEWAY, format!("Blockchain error: {}", err))
            }
            ApiError::BadRequest(msg) => {
                (StatusCode::BAD_REQUEST, msg)
            }
            ApiError::Unauthorized(msg) => {
                (StatusCode::UNAUTHORIZED, msg)
            }
            ApiError::NotFound(msg) => {
                (StatusCode::NOT_FOUND, msg)
            }
            ApiError::ServiceUnavailable(msg) => {
                (StatusCode::SERVICE_UNAVAILABLE, msg)
            }
            ApiError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({
            "error": error_message,
            "status": status.as_u16(),
        }));

        (status, body).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

