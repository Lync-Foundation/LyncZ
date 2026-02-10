//! Authentication module - SIWE (Sign-In With Ethereum) + JWT
//!
//! Flow:
//! 1. Frontend requests a nonce via GET /api/auth/nonce
//! 2. Frontend constructs a SIWE message and signs it with the wallet
//! 3. Frontend sends the message + signature to POST /api/auth/verify
//! 4. Backend verifies the SIWE message and returns a JWT
//! 5. Frontend attaches the JWT to subsequent requests via Authorization header
//! 6. Backend middleware extracts and validates the JWT on protected endpoints

use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use axum::{
    extract::{State, Json},
    http::StatusCode,
};
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use serde::{Deserialize, Serialize};
use siwe::{Message, VerificationOpts};

use crate::api::state::AppState;

// ============================================================================
// JWT Configuration
// ============================================================================

/// Cached JWT secret - generated once and reused for the lifetime of the process
static JWT_SECRET: OnceLock<String> = OnceLock::new();

/// Get the JWT secret (cached after first call)
fn jwt_secret() -> &'static str {
    JWT_SECRET.get_or_init(|| {
        std::env::var("JWT_SECRET").unwrap_or_else(|_| {
            tracing::warn!("JWT_SECRET not set, generating random secret (tokens won't survive restarts)");
            use rand::Rng;
            let secret: String = rand::thread_rng()
                .sample_iter(&rand::distributions::Alphanumeric)
                .take(64)
                .map(char::from)
                .collect();
            secret
        })
    })
}

/// JWT token expiry (24 hours)
const JWT_EXPIRY_HOURS: i64 = 24;

/// Nonce expiry (5 minutes)
const NONCE_EXPIRY_SECS: u64 = 300;

// ============================================================================
// Types
// ============================================================================

/// JWT claims
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// Wallet address (checksummed)
    pub sub: String,
    /// Expiry timestamp
    pub exp: usize,
    /// Issued at timestamp
    pub iat: usize,
}

/// Nonce store entry
struct NonceEntry {
    created_at: Instant,
}

/// Shared nonce store (in-memory with TTL)
#[derive(Clone, Default)]
pub struct NonceStore {
    nonces: Arc<RwLock<HashMap<String, NonceEntry>>>,
}

impl NonceStore {
    pub fn new() -> Self {
        Self {
            nonces: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Generate and store a new nonce
    pub async fn generate(&self) -> String {
        use rand::Rng;
        let nonce: String = rand::thread_rng()
            .sample_iter(&rand::distributions::Alphanumeric)
            .take(16)
            .map(char::from)
            .collect();

        let mut store = self.nonces.write().await;

        // Clean up expired nonces while we're here
        store.retain(|_, entry| entry.created_at.elapsed() < Duration::from_secs(NONCE_EXPIRY_SECS));

        store.insert(nonce.clone(), NonceEntry {
            created_at: Instant::now(),
        });

        nonce
    }

    /// Consume a nonce (returns true if valid and not expired)
    pub async fn consume(&self, nonce: &str) -> bool {
        let mut store = self.nonces.write().await;
        if let Some(entry) = store.remove(nonce) {
            entry.created_at.elapsed() < Duration::from_secs(NONCE_EXPIRY_SECS)
        } else {
            false
        }
    }
}

// ============================================================================
// Request/Response types
// ============================================================================

#[derive(Serialize)]
pub struct NonceResponse {
    pub nonce: String,
}

#[derive(Deserialize)]
pub struct VerifyRequest {
    /// The full SIWE message string
    pub message: String,
    /// The wallet signature (hex string with 0x prefix)
    pub signature: String,
}

#[derive(Serialize)]
pub struct VerifyResponse {
    pub token: String,
    pub address: String,
    pub expires_in: i64,
}

#[derive(Serialize)]
pub struct AuthError {
    pub error: String,
}

// ============================================================================
// Handlers
// ============================================================================

/// GET /api/auth/nonce - Generate a nonce for SIWE
pub async fn get_nonce(
    State(state): State<AppState>,
) -> Json<NonceResponse> {
    let nonce = state.nonce_store.generate().await;
    Json(NonceResponse { nonce })
}

/// POST /api/auth/verify - Verify SIWE signature and return JWT
pub async fn verify_siwe(
    State(state): State<AppState>,
    Json(payload): Json<VerifyRequest>,
) -> Result<Json<VerifyResponse>, (StatusCode, Json<AuthError>)> {
    // Parse the SIWE message
    let message: Message = payload.message.parse().map_err(|e| {
        tracing::warn!("Failed to parse SIWE message: {}", e);
        (StatusCode::BAD_REQUEST, Json(AuthError {
            error: format!("Invalid SIWE message: {}", e),
        }))
    })?;

    // Verify the nonce was issued by us and hasn't expired
    let nonce_valid = state.nonce_store.consume(&message.nonce).await;
    if !nonce_valid {
        return Err((StatusCode::BAD_REQUEST, Json(AuthError {
            error: "Invalid or expired nonce".to_string(),
        })));
    }

    // Parse the signature
    let sig_bytes = hex::decode(payload.signature.trim_start_matches("0x")).map_err(|e| {
        (StatusCode::BAD_REQUEST, Json(AuthError {
            error: format!("Invalid signature format: {}", e),
        }))
    })?;

    // Verify the SIWE message signature
    let opts = VerificationOpts {
        timestamp: Some(time::OffsetDateTime::now_utc()),
        ..Default::default()
    };
    message.verify(&sig_bytes, &opts).await.map_err(|e| {
        tracing::warn!("SIWE verification failed: {:?}", e);
        (StatusCode::UNAUTHORIZED, Json(AuthError {
            error: format!("Signature verification failed: {:?}", e),
        }))
    })?;

    // Extract the wallet address (checksummed)
    let address = format!("0x{}", hex::encode(message.address));

    // Generate JWT
    let now = chrono::Utc::now();
    let exp = now + chrono::Duration::hours(JWT_EXPIRY_HOURS);

    let claims = Claims {
        sub: address.clone(),
        iat: now.timestamp() as usize,
        exp: exp.timestamp() as usize,
    };

    let secret = jwt_secret();
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    ).map_err(|e| {
        tracing::error!("Failed to encode JWT: {}", e);
        (StatusCode::INTERNAL_SERVER_ERROR, Json(AuthError {
            error: "Failed to generate token".to_string(),
        }))
    })?;

    tracing::info!("✅ SIWE auth successful for {}", &address[..10]);

    Ok(Json(VerifyResponse {
        token,
        address,
        expires_in: JWT_EXPIRY_HOURS * 3600,
    }))
}

// ============================================================================
// JWT Verification (for middleware)
// ============================================================================

/// Extract and verify a JWT from the Authorization header.
/// Returns the wallet address (lowercase) if valid.
pub fn verify_jwt(auth_header: &str) -> Result<String, String> {
    let token = auth_header.trim_start_matches("Bearer ").trim();

    let secret = jwt_secret();
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    ).map_err(|e| format!("Invalid token: {}", e))?;

    Ok(token_data.claims.sub.to_lowercase())
}

// Note: For future middleware-based auth, you can use:
// pub fn extract_auth_address<B>(request: &Request<B>) -> Option<String> {
//     let auth_header = request.headers().get(header::AUTHORIZATION)?;
//     let auth_str = auth_header.to_str().ok()?;
//     verify_jwt(auth_str).ok()
// }
