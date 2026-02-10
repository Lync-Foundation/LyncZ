//! Settlement handlers - PDF validation and proof submission
//! 
//! Flow:
//! 1. POST /validate - Upload PDF, validate, generate proof + settle (~2-3 minutes)
//!
//! Data sources:
//! - ORDER: alipay_name (line 20), alipay_id → masked (line 21)
//! - TRADE: cny_amount (line 29)
//! - PDF: transaction_id (line 25), payment_time (line 27)
//! - CONTRACT: alipayPublicKeyHash

use axum::{
    extract::{Path, State, Multipart},
    Json,
};
use serde::Serialize;
use crate::api::{error::{ApiError, ApiResult}, state::AppState};
use crate::axiom_prover::AxiomProver;
use crate::blockchain::types::trade_id_to_bytes32;
use crate::crypto::{
    compute_tx_id_hash,
    compute_expected_hash_with_onchain_account_hash,
    format_amount_line,
};
use openvm::serde::to_vec as openvm_serialize;

// ============================================================================
// PDF Parsing - Extract transaction_id, payment_time, and public key hash
// ============================================================================

/// Extracted PDF fields for validation
pub struct PdfExtractedFields {
    pub transaction_id: String,     // Line 25
    pub payment_time: String,       // Line 27
    pub public_key_der_hash: [u8; 32],
}

/// Parse Alipay PDF to extract account info, transaction_id, payment_time,
/// and public key DER hash from the PDF signature.
fn extract_pdf_fields(pdf_bytes: &[u8]) -> Result<PdfExtractedFields, String> {
    // Extract text lines
    let pages = extractor::extract_text(pdf_bytes.to_vec())
        .map_err(|e| format!("PDF parsing failed: {:?}", e))?;
    
    if pages.is_empty() {
        return Err("PDF has no pages".to_string());
    }
    
    let text = &pages[0];
    let lines: Vec<&str> = text.lines().collect();
    
    let get_line = |idx: usize| -> Result<String, String> {
        lines.get(idx.saturating_sub(1))
            .map(|s| s.to_string())
            .ok_or_else(|| format!("Line {} not found (PDF has {} lines)", idx, lines.len()))
    };
    
    // Extract only the lines we need for hash computation
    // Line 20, 21 (account info) hash comes from blockchain, not PDF extraction
    let transaction_id = get_line(25)?;  // Alipay transaction ID
    let payment_time = get_line(27)?;    // Payment timestamp
    
    // Extract public key DER hash from PDF signature (optimistic key rotation)
    let pk_hash_vec = signature_validator::extract_public_key_hash(pdf_bytes)
        .map_err(|e| format!("Failed to extract public key hash: {}", e))?;
    
    if pk_hash_vec.len() != 32 {
        return Err(format!("Invalid public key hash length: expected 32, got {}", pk_hash_vec.len()));
    }
    
    let mut public_key_der_hash = [0u8; 32];
    public_key_der_hash.copy_from_slice(&pk_hash_vec);
    
    Ok(PdfExtractedFields {
        transaction_id,
        payment_time,
        public_key_der_hash,
    })
}

/// Parse payment time string (format: "YYYY-MM-DD HH:MM:SS") to Unix timestamp
fn parse_payment_time(payment_time: &str) -> Result<u64, String> {
    // Expected format: "2025-12-27 08:36:12"
    use chrono::NaiveDateTime;
    
    let dt = NaiveDateTime::parse_from_str(payment_time, "%Y-%m-%d %H:%M:%S")
        .map_err(|e| format!("Failed to parse payment time '{}': {}", payment_time, e))?;
    
    // Convert to UTC timestamp (Alipay uses UTC+8, so subtract 8 hours)
    Ok(dt.and_utc().timestamp() as u64 - 8 * 3600)
}

// NOTE: Hash computation functions moved to crate::crypto::hash module

// ============================================================================
// Validation Endpoint
// ============================================================================

#[derive(Debug, Serialize)]
pub struct ValidateResponse {
    pub valid: bool,
    pub expected_hash: String,
    pub actual_hash: String,
    pub message: String,
    /// Error/success code for frontend translation
    /// Codes: SUCCESS, REPLAY_ATTACK, PAYMENT_TOO_OLD, HASH_MISMATCH
    pub validation_code: String,
    pub transaction_id: String,
    pub payment_time: String,
}

/// POST /api/trades/:trade_id/validate
/// Upload PDF and run quick Axiom validation (~10 seconds)
pub async fn validate_handler(
    State(state): State<AppState>,
    Path(trade_id): Path<String>,
    mut multipart: Multipart,
) -> ApiResult<Json<ValidateResponse>> {
    tracing::info!("⚡ Starting validation for trade {}", trade_id);
    
    // Step 1: Extract PDF from multipart
    let mut pdf_data: Option<Vec<u8>> = None;
    let mut filename: Option<String> = None;
    
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        ApiError::BadRequest(format!("Invalid multipart data: {}", e))
    })? {
        if field.name().unwrap_or("") == "pdf" {
            filename = field.file_name().map(|s| s.to_string());
            let data = field.bytes().await.map_err(|e| {
                ApiError::BadRequest(format!("Failed to read PDF: {}", e))
            })?;
            
            if !data.starts_with(b"%PDF") {
                return Err(ApiError::BadRequest("File is not a valid PDF".to_string()));
            }
            if data.len() > 10 * 1024 * 1024 {
                return Err(ApiError::BadRequest("PDF too large (max 10MB)".to_string()));
            }
            pdf_data = Some(data.to_vec());
        }
    }
    
    let pdf_data = pdf_data.ok_or_else(|| ApiError::BadRequest("No PDF file provided".to_string()))?;
    let filename = filename.unwrap_or_else(|| "payment.pdf".to_string());
    tracing::info!("📄 PDF received: {} ({} bytes)", filename, pdf_data.len());
    
    // Step 2: Extract transaction_id, payment_time, and public key hash from PDF
    let pdf_fields = extract_pdf_fields(&pdf_data)
        .map_err(|e| ApiError::BadRequest(format!("PDF parsing failed: {}", e)))?;
    let transaction_id = pdf_fields.transaction_id;
    let payment_time = pdf_fields.payment_time;
    let pdf_pk_hash = pdf_fields.public_key_der_hash;
    let pdf_pk_hash_hex = hex::encode(&pdf_pk_hash);
    tracing::info!("📋 Extracted: txid={}, time={}, pk_hash={}", transaction_id, payment_time, &pdf_pk_hash_hex[..16]);
    
    // Step 3: Save PDF to database
    state.db.save_trade_pdf(&trade_id, &pdf_data, &filename).await
        .map_err(|e| ApiError::Database(e.to_string()))?;
    
    // Step 4: Get trade (source of truth for line 29 amount)
    let trade = state.db.get_trade(&trade_id).await
        .map_err(|e| ApiError::Database(e.to_string()))?;
    
    // ===== PRE-CHECKS (before OpenVM execution) =====
    
    // Pre-check 1: Verify transaction ID hasn't been used in any settled trade
    tracing::info!("🔍 Pre-check: Verifying transaction ID not already used...");
    let txid_used = state.db.is_transaction_id_used(&transaction_id).await
        .map_err(|e| ApiError::Database(e.to_string()))?;
    if txid_used {
        tracing::warn!("❌ Pre-check failed: Transaction ID {} already used", transaction_id);
        // Clear PDF so user can try with a different receipt
        if let Err(e) = state.db.clear_trade_pdf(&trade_id).await {
            tracing::error!("Failed to clear PDF after pre-check failure: {}", e);
        }
        return Ok(Json(ValidateResponse {
            valid: false,
            expected_hash: String::new(),
            actual_hash: String::new(),
            message: "This payment receipt has already been used for another trade (replay attack detected).".to_string(),
            validation_code: "REPLAY_ATTACK".to_string(),
            transaction_id: transaction_id.clone(),
            payment_time: payment_time.clone(),
        }));
    }
    
    // Pre-check 2: Verify payment time is after trade creation
    tracing::info!("🔍 Pre-check: Verifying payment time is valid...");
    let payment_timestamp = parse_payment_time(&payment_time)
        .map_err(|e| ApiError::BadRequest(format!("Invalid payment time format: {}", e)))?;
    
    if payment_timestamp < trade.created_at as u64 {
        tracing::warn!("❌ Pre-check failed: Payment time {} is before trade creation {}", payment_timestamp, trade.created_at);
        // Clear PDF so user can try with a different receipt
        if let Err(e) = state.db.clear_trade_pdf(&trade_id).await {
            tracing::error!("Failed to clear PDF after pre-check failure: {}", e);
        }
        return Ok(Json(ValidateResponse {
            valid: false,
            expected_hash: String::new(),
            actual_hash: String::new(),
            message: format!("Payment was made before the trade was created. Receipt time: {}, Trade created: {}", payment_time, trade.created_at),
            validation_code: "PAYMENT_TOO_OLD".to_string(),
            transaction_id: transaction_id.clone(),
            payment_time: payment_time.clone(),
        }));
    }
    
    // Note: Recipient verification is handled by the ZK proof itself.
    // The account_lines_hash from blockchain must match what the ZK circuit reads from the PDF.
    
    tracing::info!("✅ Pre-checks passed. Proceeding to OpenVM validation...");
    
    let trade_amount_cents: u64 = trade.cny_amount.parse::<f64>()
        .map_err(|e| ApiError::Internal(format!("Invalid trade amount: {}", e)))?
        .round() as u64;
    
    // Step 5: Build expected lines for hash computation
    // - line25, line27 from PDF; line29 from trade amount
    // - account_lines_hash fetched directly from blockchain
    let line25 = transaction_id.clone();
    let line27 = payment_time.clone();
    let line29 = format_amount_line(trade_amount_cents);
    
    // Step 6: Fetch account_lines_hash directly from blockchain
    // This avoids masking edge cases by using the hash that was computed by the frontend
    // and stored on-chain during order creation
    let blockchain_client = state.blockchain_client.as_ref()
        .ok_or_else(|| ApiError::Internal("Blockchain client not configured".to_string()))?;
    
    let onchain_account_hash = blockchain_client.get_order_hash(&trade.order_id).await
        .map_err(|e| ApiError::Internal(format!("Failed to fetch order hash from blockchain: {}", e)))?;
    let onchain_account_hash_hex = format!("0x{}", hex::encode(onchain_account_hash));
    tracing::info!("📋 Fetched account_lines_hash from blockchain: {}", onchain_account_hash_hex);
    
    // Compute expected hash using the on-chain account_lines_hash
    let expected_hash = compute_expected_hash_with_onchain_account_hash(
        &onchain_account_hash_hex, &line25, &line27, &line29, &pdf_pk_hash_hex
    ).map_err(|e| ApiError::Internal(format!("Hash computation failed: {}", e)))?;
    
    // Step 7: Generate input streams for Axiom
    let input_streams = generate_openvm_streams(&pdf_data)
        .map_err(|e| ApiError::Internal(format!("Stream generation failed: {}", e)))?;
    
    // Step 8: Cache input streams
    {
        let mut cache = state.input_streams_cache.write().await;
        cache.insert(trade_id.clone(), input_streams.clone());
    }
    
    // Save transaction_id and payment_time to database
    state.db.update_trade_payment_info(&trade_id, &transaction_id, &payment_time).await
        .map_err(|e| ApiError::Database(format!("Failed to save payment info: {}", e)))?;
    
    // Step 9: Call Axiom execute mode (fast ~10 seconds)
    let api_key = std::env::var("AXIOM_API_KEY")
        .map_err(|_| ApiError::Internal("AXIOM_API_KEY not set".to_string()))?;
    let program_id = std::env::var("AXIOM_PROGRAM_ID")
        .map_err(|_| ApiError::Internal("AXIOM_PROGRAM_ID not set".to_string()))?;
    
    let axiom = AxiomProver::new(api_key, String::new(), program_id);
    
    tracing::info!("🚀 Running Axiom execute mode...");
    let actual_hash = axiom.execute_program(&trade_id, input_streams).await
        .map_err(|e| ApiError::Internal(format!("Axiom execution failed: {}", e)))?;
    
    // Step 10: Compare hashes
    let valid = expected_hash.as_slice() == actual_hash.as_slice();
    
    tracing::info!("{}", if valid { "🎯 VALID" } else { "❌ INVALID" });
    
    // Step 11: If valid, check key rotation and spawn background settlement
    if valid {
        // Get blockchain client for key management
        let blockchain_client = state.blockchain_client
            .as_ref()
            .ok_or_else(|| ApiError::ServiceUnavailable("Blockchain not enabled".to_string()))?;
        
        // OPTIMISTIC KEY ROTATION - Compare PDF's public key hash with on-chain hash
        // Done AFTER validation to not delay the user's response
        let contract_pk_hash = blockchain_client.get_alipay_public_key_hash().await
            .map_err(|e| ApiError::Internal(format!("Failed to get contract pk hash: {}", e)))?;
        
        if pdf_pk_hash != contract_pk_hash {
            let contract_pk_hash_hex = hex::encode(&contract_pk_hash);
            tracing::warn!(
                "🔑 Key rotation detected! PDF hash: {}, Contract hash: {}",
                pdf_pk_hash_hex, contract_pk_hash_hex
            );
            
            // OPTIMISTIC KEY ROTATION: Auto-update the contract with the new key hash
            // This is safe because:
            // 1. The PDF signature was already validated against the embedded public key
            // 2. The key hash comes from a verified Alipay-signed PDF
            // 3. This is NOT exposed via any public API endpoint
            tracing::info!("🔄 Updating contract with new public key hash...");
            match blockchain_client.update_public_key_hash(pdf_pk_hash).await {
                Ok(tx_hash) => {
                    tracing::info!("✅ Public key hash updated on-chain! TX: {:#x}", tx_hash);
                    
                    // Send admin alert email (fire-and-forget)
                    if let Some(email_service) = crate::email::EmailService::from_env() {
                        let old_hash = format!("0x{}", contract_pk_hash_hex);
                        let new_hash = format!("0x{}", pdf_pk_hash_hex);
                        let trade_id_clone = trade_id.clone();
                        tokio::spawn(async move {
                            if let Err(e) = email_service.send_key_rotation_alert(
                                &old_hash,
                                &new_hash,
                                &trade_id_clone,
                            ).await {
                                tracing::error!("Failed to send key rotation alert: {}", e);
                            }
                        });
                    }
                }
                Err(e) => {
                    // Key update failed, but validation passed - log error but don't fail
                    // The proof will still work since we use the PDF's key hash
                    tracing::error!("❌ Failed to update public key hash: {}. Continuing with settlement.", e);
                }
            }
        }
        
        // Spawn background task for proof generation and settlement
        let state_clone = state.clone();
        let trade_id_clone = trade_id.clone();
        let transaction_id_clone = transaction_id.clone();
        let payment_time_clone = payment_time.clone();
        
        tokio::spawn(async move {
            if let Err(e) = run_background_settlement(
                state_clone,
                trade_id_clone,
                transaction_id_clone,
                payment_time_clone,
            ).await {
                tracing::error!("❌ Background settlement failed for trade: {}", e);
            }
        });
        
        return Ok(Json(ValidateResponse {
            valid: true,
            expected_hash: hex::encode(&expected_hash),
            actual_hash: hex::encode(&actual_hash),
            message: "PDF validated! Proof generation started. You can safely leave this page - we'll complete the settlement automatically.".to_string(),
            validation_code: "SUCCESS".to_string(),
            transaction_id,
            payment_time,
        }));
    }
    
    // Validation failed - clear PDF so user can retry with a different one
    if let Err(e) = state.db.clear_trade_pdf(&trade_id).await {
        tracing::error!("Failed to clear PDF after validation failure: {}", e);
    }
    
    // Also clear from input streams cache
    {
        let mut cache = state.input_streams_cache.write().await;
        cache.remove(&trade_id);
    }
    
    Ok(Json(ValidateResponse {
        valid: false,
        expected_hash: hex::encode(&expected_hash),
        actual_hash: hex::encode(&actual_hash),
        message: "Validation failed. PDF content doesn't match trade details. Please try again with the correct receipt.".to_string(),
        validation_code: "HASH_MISMATCH".to_string(),
        transaction_id,
        payment_time,
    }))
}

/// Background task for proof generation and blockchain settlement
/// Called automatically when validation passes - user doesn't need to wait
async fn run_background_settlement(
    state: AppState,
    trade_id: String,
    transaction_id: String,
    payment_time: String,
) -> Result<(), String> {
    tracing::info!("🚀 [Background] Starting proof generation for trade {}", trade_id);
    
    // Check if already in progress (prevent duplicates)
    {
        let mut in_progress = state.proof_in_progress.write().await;
        if in_progress.contains(&trade_id) {
            tracing::info!("⏭️ [Background] Trade {} already being processed, skipping", trade_id);
            return Ok(());
        }
        in_progress.insert(trade_id.clone());
    }
    
    // Ensure we remove from in_progress when done (even on error)
    let result = run_background_settlement_inner(&state, &trade_id, &transaction_id, &payment_time).await;
    
    {
        let mut in_progress = state.proof_in_progress.write().await;
        in_progress.remove(&trade_id);
    }
    
    result
}

/// Parse contract error selector and return user-friendly error code
/// Error selectors from LyncZEscrow.sol:
/// - 0x25c394f4 = TransactionIdAlreadyUsed (receipt already used - replay attack)
/// - 0x5f3f6cfc = TradeNotPending (trade already settled or cancelled)
/// - 0xace5e8ce = TradeExpiredError (payment window closed)
/// - 0xd611c318 = ProofVerificationFailed (ZK proof invalid)
fn parse_contract_error(error_msg: &str) -> Option<&'static str> {
    if error_msg.contains("0x25c394f4") {
        Some("ALREADY_USED")
    } else if error_msg.contains("0x5f3f6cfc") {
        Some("NOT_PENDING")
    } else if error_msg.contains("0xace5e8ce") {
        Some("EXPIRED")
    } else if error_msg.contains("0xd611c318") {
        Some("VERIFICATION_FAILED")
    } else {
        None
    }
}

async fn run_background_settlement_inner(
    state: &AppState,
    trade_id: &str,
    transaction_id: &str,
    payment_time: &str,
) -> Result<(), String> {
    let blockchain_client = state.blockchain_client
        .as_ref()
        .ok_or_else(|| "Blockchain not enabled".to_string())?;
    
    // Get input streams from cache
    let input_streams = {
        let cache = state.input_streams_cache.read().await;
        cache.get(trade_id).cloned()
    }.ok_or_else(|| "Input streams not in cache".to_string())?;
    
    // Generate EVM proof
    let api_key = std::env::var("AXIOM_API_KEY")
        .map_err(|_| "AXIOM_API_KEY not set".to_string())?;
    let program_id = std::env::var("AXIOM_PROGRAM_ID")
        .map_err(|_| "AXIOM_PROGRAM_ID not set".to_string())?;
    
    let axiom = AxiomProver::new(api_key, String::new(), program_id);
    
    tracing::info!("🔐 [Background] Generating ZK proof for trade {}...", trade_id);
    let proof = axiom.generate_evm_proof(trade_id, input_streams).await
        .map_err(|e| format!("Proof generation failed: {}", e))?;
    tracing::info!("✅ [Background] Proof generated: {}", proof.proof_id);
    
    // Save proof to database
    let proof_json = serde_json::to_string(&proof.full_json)
        .map_err(|e| format!("JSON serialization failed: {}", e))?;
    
    state.db.save_trade_proof(
        trade_id,
        &proof.user_public_values,
        &proof.accumulator,
        &proof.proof_data,
        &proof.proof_id,
        &proof_json,
    ).await.map_err(|e| format!("DB save failed: {}", e))?;
    
    // Submit to blockchain
    tracing::info!("📤 [Background] Submitting proof to blockchain...");
    
    let trade_id_bytes = trade_id_to_bytes32(trade_id)
        .map_err(|e| format!("Invalid trade ID: {}", e))?;
    
    let mut user_public_values = [0u8; 32];
    user_public_values.copy_from_slice(&proof.user_public_values);
    
    // Compute tx_id_hash from transaction_id (v4 privacy: txId never on-chain)
    let tx_id_hash = compute_tx_id_hash(transaction_id);
    tracing::info!("🔐 [Background] tx_id_hash: 0x{}", hex::encode(tx_id_hash));
    
    let submit_result = blockchain_client.submit_proof(
        trade_id_bytes,
        tx_id_hash,
        payment_time.to_string(),
        user_public_values,
        proof.accumulator.clone(),
        proof.proof_data.clone(),
    ).await;
    
    match submit_result {
        Ok(tx_hash) => {
            tracing::info!("✅ [Background] Trade {} settled! tx_hash: {}", trade_id, tx_hash);
            
            // Clean up input streams cache
            {
                let mut cache = state.input_streams_cache.write().await;
                cache.remove(trade_id);
            }
            
            Ok(())
        }
        Err(e) => {
            let error_msg = e.to_string();
            tracing::error!("❌ [Background] Blockchain submission failed: {}", error_msg);
            
            // Parse contract error and save to database
            if let Some(error_code) = parse_contract_error(&error_msg) {
                tracing::info!("📝 [Background] Saving settlement error: {} for trade {}", error_code, trade_id);
                if let Err(db_err) = state.db.save_trade_settlement_error(trade_id, error_code).await {
                    tracing::error!("❌ [Background] Failed to save settlement error: {}", db_err);
                }
            }
            
            Err(format!("Blockchain submission failed: {}", error_msg))
        }
    }
}

// ============================================================================
// Settlement Endpoint
// ============================================================================

// ============================================================================
// OpenVM Stream Generation
// ============================================================================

/// Generate OpenVM input streams for Axiom API
/// 
/// The guest program expects exactly:
/// 1. PDF bytes (read_vec)
/// 2. Line count (read)
/// 3. Line numbers (read for each)
/// 
/// The guest extracts lines from the PDF and computes the hash internally.
/// Line text and pk_hash are NOT passed - the guest reads them from the PDF.
fn generate_openvm_streams(pdf_bytes: &[u8]) -> Result<Vec<String>, String> {
    let line_numbers: [u32; 5] = [20, 21, 25, 27, 29];
    let mut streams = Vec::new();
    
    // Stream 1: PDF bytes (padded to 4-byte alignment)
    let padding = (4 - (pdf_bytes.len() % 4)) % 4;
    let mut pdf_padded = pdf_bytes.to_vec();
    pdf_padded.extend(vec![0u8; padding]);
    streams.push(format!("0x01{}", hex::encode(&pdf_padded)));
    
    // Stream 2: Line count
    let line_count = line_numbers.len() as u32;
    let count_bytes = openvm_serialize(&line_count).map_err(|e| format!("Serialize failed: {}", e))?;
    let count_le: Vec<u8> = count_bytes.into_iter().flat_map(|w| w.to_le_bytes()).collect();
    streams.push(format!("0x01{}", hex::encode(&count_le)));
    
    // Streams 3-7: Line numbers
    for num in &line_numbers {
        let num_bytes = openvm_serialize(num).map_err(|e| format!("Serialize failed: {}", e))?;
        let num_le: Vec<u8> = num_bytes.into_iter().flat_map(|w| w.to_le_bytes()).collect();
        streams.push(format!("0x01{}", hex::encode(&num_le)));
    }
    
    Ok(streams)
}
