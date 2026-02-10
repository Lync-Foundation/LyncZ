//! Blockchain event listener for LyncZ escrow contract
//! Syncs on-chain events to the database and sends email notifications

use ethers::prelude::*;
use ethers::providers::{Http, Provider};
use std::sync::Arc;
use thiserror::Error;
use tokio::time::{interval, Duration};

use super::{OrderCreatedFilter, OrderWithdrawnFilter, TradeCreatedFilter, TradeSettledFilter, TradeExpiredFilter, ExchangeRateUpdatedFilter, AccountLinesHashUpdatedFilter};
use crate::db::{
    models::{DbOrder, DbTrade},
    orders::{OrderRepository, PostgresOrderRepository},
    trades::{TradeRepository, PostgresTradeRepository},
    account_emails::AccountEmailRepository,
};
use crate::email::{EmailService, EmailEvent, EmailInfo, format_token_amount};

#[derive(Error, Debug)]
pub enum EventListenerError {
    #[error("Provider error: {0}")]
    ProviderError(String),
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("Event decode error: {0}")]
    EventDecodeError(String),
}

/// Configuration constants - UNIFIED POLLING (optimized for RPC cost)
/// Single eth_getLogs call per cycle with no topic filter = ~75 CUs base
/// Pay-as-you-go tier: no block range limits
/// 
/// Base L2 produces ~1 block every 2 seconds
/// With 6s polling: ~3 new blocks per cycle (normal operation)
/// BLOCKS_PER_QUERY of 200 allows fast catch-up after restarts
const BLOCKS_PER_QUERY: u64 = 200;     // Max blocks per query (for catch-up)
const MAX_REORG_DEPTH: u64 = 2;        // Wait 2 blocks for finality  
const POLL_INTERVAL_SECS: u64 = 6;     // Poll every 6 seconds (~37M CUs/month)

pub struct EventListener {
    provider: Arc<Provider<Http>>,
    contract_address: Address,
    db_pool: sqlx::PgPool,
    start_block: u64,
    chain_id: i32,
    email_service: Option<Arc<EmailService>>,
}

impl EventListener {
    /// Create a new event listener
    pub async fn new(
        rpc_url: &str,
        contract_address: Address,
        db_pool: sqlx::PgPool,
        start_block: Option<u64>,
        chain_id: u64,
    ) -> Result<Self, EventListenerError> {
        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| EventListenerError::ProviderError(e.to_string()))?;
        let provider = Arc::new(provider);

        // Determine start block
        let start_block = if let Some(block) = start_block {
            block
        } else {
            // Try to get last synced block from database
            match Self::get_last_synced_block(&db_pool, &contract_address).await {
                Ok(block) => block,
                Err(_) => {
                    // If no record exists, start from current block
                    let current_block = provider
                        .get_block_number()
                        .await
                        .map_err(|e| EventListenerError::ProviderError(e.to_string()))?;
                    current_block.as_u64()
                }
            }
        };

        // Initialize email service if configured
        let email_service = EmailService::from_env();
        if email_service.is_some() {
            tracing::info!("📧 Email notifications enabled");
        } else {
            tracing::info!("📧 Email notifications disabled (RESEND_API_KEY not set)");
        }

        tracing::info!(
            "Initialized event listener for contract {:#x}, starting from block {}",
            contract_address,
            start_block
        );

        Ok(Self {
            provider,
            contract_address,
            db_pool,
            start_block,
            chain_id: chain_id as i32,
            email_service,
        })
    }

    /// Start the event listener (runs indefinitely)
    pub async fn start(&mut self) -> Result<(), EventListenerError> {
        tracing::info!("🚀 Starting event listener...");

        let mut poll_interval = interval(Duration::from_secs(POLL_INTERVAL_SECS));
        let mut consecutive_errors = 0u32;

        loop {
            poll_interval.tick().await;

            match self.sync_events().await {
                Ok(_) => {
                    consecutive_errors = 0;
                }
                Err(e) => {
                    consecutive_errors += 1;
                    tracing::error!("❌ Event sync error (attempt {}): {}", consecutive_errors, e);
                    
                    // If we have multiple consecutive errors, add exponential backoff
                    if consecutive_errors >= 3 {
                        let backoff_secs = std::cmp::min(60, 5 * consecutive_errors as u64);
                        tracing::warn!("⏳ Too many errors, backing off for {}s", backoff_secs);
                        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                    }
                }
            }
        }
    }

    /// Sync events from blockchain to database using UNIFIED POLLING
    /// Makes ONE eth_getLogs call per cycle (no topic filter) for optimal RPC cost
    async fn sync_events(&mut self) -> Result<(), EventListenerError> {
        let current_block = self
            .provider
            .get_block_number()
            .await
            .map_err(|e| EventListenerError::ProviderError(e.to_string()))?
            .as_u64();

        // Apply reorg protection (don't process very recent blocks)
        let safe_block = current_block.saturating_sub(MAX_REORG_DEPTH);

        if self.start_block >= safe_block {
            // Nothing new to sync
            return Ok(());
        }

        // Process blocks in chunks
        let to_block = std::cmp::min(self.start_block + BLOCKS_PER_QUERY, safe_block);

        tracing::debug!(
            "📊 Syncing blocks {} to {} (current: {})",
            self.start_block,
            to_block,
            current_block
        );

        // UNIFIED POLLING: Single eth_getLogs call for ALL events from this contract
        // No topic filter = gets all events, route locally by topic0
        let filter = Filter::new()
            .address(self.contract_address)
            .from_block(self.start_block)
            .to_block(to_block);

        let all_logs = self
            .provider
            .get_logs(&filter)
            .await
            .map_err(|e| EventListenerError::ProviderError(e.to_string()))?;

        if !all_logs.is_empty() {
            tracing::info!("📦 Fetched {} total events in unified call", all_logs.len());
        }

        // Route logs to appropriate handlers based on topic0 (event signature)
        for log in all_logs {
            if log.topics.is_empty() {
                continue;
            }
            
            let topic0 = log.topics[0];
            
            // Route by event signature hash
            if topic0 == OrderCreatedFilter::signature() {
                if let Err(e) = self.handle_order_created(log).await {
                    tracing::error!("❌ Failed to handle OrderCreated: {}", e);
                }
            } else if topic0 == OrderWithdrawnFilter::signature() {
                if let Err(e) = self.handle_order_withdrawn(log).await {
                    tracing::error!("❌ Failed to handle OrderWithdrawn: {}", e);
                }
            } else if topic0 == TradeCreatedFilter::signature() {
                if let Err(e) = self.handle_trade_created(log).await {
                    tracing::error!("❌ Failed to handle TradeCreated: {}", e);
                }
            } else if topic0 == TradeSettledFilter::signature() {
                if let Err(e) = self.handle_trade_settled(log).await {
                    tracing::error!("❌ Failed to handle TradeSettled: {}", e);
                }
            } else if topic0 == TradeExpiredFilter::signature() {
                if let Err(e) = self.handle_trade_expired(log).await {
                    tracing::error!("❌ Failed to handle TradeExpired: {}", e);
                }
            } else if topic0 == ExchangeRateUpdatedFilter::signature() {
                if let Err(e) = self.handle_exchange_rate_updated(log).await {
                    tracing::error!("❌ Failed to handle ExchangeRateUpdated: {}", e);
                }
            } else if topic0 == AccountLinesHashUpdatedFilter::signature() {
                if let Err(e) = self.handle_account_lines_hash_updated(log).await {
                    tracing::error!("❌ Failed to handle AccountLinesHashUpdated: {}", e);
                }
            } else {
                tracing::debug!("Unknown event topic: {:?}", topic0);
            }
        }

        // Update last synced block
        self.start_block = to_block + 1;
        Self::save_last_synced_block(&self.db_pool, &self.contract_address, self.start_block)
            .await?;

        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: OrderCreated (v4 - Privacy)
    // New signature: OrderCreated(bytes32 indexed orderId, address indexed seller, address indexed token, 
    //                             uint256 totalAmount, uint256 exchangeRate, PaymentRail rail, 
    //                             bytes32 accountLinesHash, bool isPublic)
    // 
    // Privacy: accountLinesHash is on-chain, plain text accountId/accountName are NOT.
    //          Seller must call POST /api/orders/:orderId/payment-info to submit plain text.
    // ================================================================

    async fn handle_order_created(&self, log: Log) -> Result<(), EventListenerError> {
        // Decode event
        let event: OrderCreatedFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        // Format order ID as 0x-prefixed hex string
        let order_id = format!("0x{}", hex::encode(event.order_id));
        let account_lines_hash = format!("0x{}", hex::encode(event.account_lines_hash));

        tracing::info!(
            "📦 OrderCreated (v4):\n  \
            order_id: {}\n  \
            seller: {:#x}\n  \
            token: {:#x}\n  \
            totalAmount: {}\n  \
            exchangeRate: {}\n  \
            rail: {}\n  \
            accountLinesHash: {}\n  \
            isPublic: {}",
            order_id,
            event.seller,
            event.token,
            event.total_amount,
            event.exchange_rate,
            event.rail,
            account_lines_hash,
            event.is_public
        );

        // DATABASE SYNC: Insert order
        // NOTE: accountId and accountName are empty - seller must call /payment-info endpoint
        let order_repo = PostgresOrderRepository::new(self.db_pool.clone());
        
        let db_order = DbOrder {
            order_id: order_id.clone(),
            seller: format!("{:#x}", event.seller).to_lowercase(),
            token: format!("{:#x}", event.token).to_lowercase(),
            total_amount: event.total_amount.to_string(),
            remaining_amount: event.total_amount.to_string(),
            exchange_rate: event.exchange_rate.to_string(),
            rail: event.rail as i32,                   // PaymentRail: 0=ALIPAY, 1=WECHAT
            alipay_id: String::new(),                  // Empty - seller submits via API
            alipay_name: String::new(),                // Empty - seller submits via API
            created_at: chrono::Utc::now().timestamp(),
            chain_id: self.chain_id,                   // Chain this event listener is monitoring
            synced_at: chrono::Utc::now(),
            is_public: event.is_public,                // From on-chain event
            private_code: None,                        // Generated when seller sets visibility
        };

        match order_repo.create(&db_order).await {
            Ok(_) => {
                tracing::info!("✅ Order {} synced to database (awaiting payment info)", order_id);
            }
            Err(e) => {
                tracing::error!("❌ Database insert failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // After syncing, check if payment info was submitted before the event (race condition)
        // If so, verify the hash matches and send the order creation email
        if let Ok(synced_order) = order_repo.get(&order_id).await {
            if !synced_order.alipay_id.is_empty() && !synced_order.alipay_name.is_empty() {
                tracing::info!("📬 Payment info already present for order {}, verifying hash...", order_id);
                
                // SECURITY: Verify the computed hash matches what's stored on-chain
                let computed_hash = crate::crypto::compute_account_lines_hash(
                    &synced_order.alipay_name,
                    &synced_order.alipay_id,
                );
                let computed_hash_hex = format!("0x{}", hex::encode(computed_hash));
                
                if computed_hash_hex != account_lines_hash {
                    tracing::error!(
                        "🚨 HASH MISMATCH for order {}!\n  \
                        On-chain hash: {}\n  \
                        Computed hash: {}\n  \
                        account_name: {}\n  \
                        account_id: {}",
                        order_id,
                        account_lines_hash,
                        computed_hash_hex,
                        synced_order.alipay_name,
                        synced_order.alipay_id
                    );
                    // Don't send email - something is wrong!
                    return Ok(());
                }
                
                tracing::info!("✅ Hash verified for order {}: {}", order_id, computed_hash_hex);
                
                // Get seller's email
                let seller_lower = format!("{:#x}", event.seller).to_lowercase();
                let email_repo = AccountEmailRepository::new(self.db_pool.clone());
                if let Ok(Some(account_email)) = email_repo.get_if_enabled(&seller_lower).await {
                    if let Some(ref email_service) = self.email_service {
                        let token_symbol = get_token_symbol(&synced_order.token);
                        let token_decimals = get_token_decimals(&synced_order.token);
                        
                        let _ = email_service.send_notification(
                            &account_email.email,
                            &account_email.language,
                            crate::email::EmailEvent::OrderCreated,
                            &crate::email::EmailInfo::OrderCreated {
                                order_id: order_id.clone(),
                                token_amount: format_token_amount(&synced_order.total_amount, token_decimals, ""),
                                token_symbol,
                                exchange_rate: synced_order.exchange_rate.clone(),
                                account_id: synced_order.alipay_id.clone(),
                                account_name: synced_order.alipay_name.clone(),
                                rail: synced_order.rail,  // Pass rail number, template will localize
                                is_private: !synced_order.is_public,
                                private_code: synced_order.private_code.clone(),
                            },
                        ).await;
                        
                        tracing::info!("📧 Sent order created email to {} for order {}", account_email.email, order_id);
                    }
                }
            }
        }

        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: OrderWithdrawn
    // ================================================================

    async fn handle_order_withdrawn(&self, log: Log) -> Result<(), EventListenerError> {
        let tx_hash = log.transaction_hash
            .map(|h| format!("{:#x}", h));
        
        let event: OrderWithdrawnFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        let order_id = format!("0x{}", hex::encode(event.order_id));

        tracing::info!(
            "💸 OrderWithdrawn:\n  order_id: {}\n  withdrawnAmount: {}\n  remainingAmount: {}",
            order_id,
            event.withdrawn_amount,
            event.remaining_amount
        );

        // DATABASE SYNC: Update remaining amount
        let order_repo = PostgresOrderRepository::new(self.db_pool.clone());
        let delta = format!("-{}", event.withdrawn_amount);
        
        match order_repo.adjust_remaining_amount(&order_id, &delta).await {
            Ok(_) => {
                tracing::info!("✅ Order {} remaining amount adjusted", order_id);
            }
            Err(e) => {
                tracing::error!("❌ Database update failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // DATABASE SYNC: Record withdrawal for activity timeline
        use crate::db::withdrawals::PostgresWithdrawalRepository;
        let withdrawal_repo = PostgresWithdrawalRepository::new(self.db_pool.clone());
        match withdrawal_repo.create(
            &order_id,
            &event.withdrawn_amount.to_string(),
            &event.remaining_amount.to_string(),
            tx_hash.as_deref(),
        ).await {
            Ok(_) => {
                tracing::info!("✅ Withdrawal recorded for order {}", order_id);
            }
            Err(e) => {
                tracing::error!("❌ Failed to record withdrawal: {}", e);
                // Don't fail the whole handler - withdrawal is recorded for UI only
            }
        }

        // Send email notification to seller
        if let Ok(order) = order_repo.get(&order_id).await {
            let token_symbol = get_token_symbol(&order.token);
            let decimals = get_token_decimals(&order.token);
            let formatted_withdrawn = format_token_amount(&event.withdrawn_amount.to_string(), decimals, "");
            let formatted_remaining = format_token_amount(&event.remaining_amount.to_string(), decimals, "");
            
            self.send_email_notification(
                EmailEvent::OrderWithdrawn,
                &order.seller,
                EmailInfo::OrderWithdrawn {
                    order_id: order_id.clone(),
                    withdrawn_amount: formatted_withdrawn,
                    remaining_amount: formatted_remaining,
                    token_symbol,
                },
            ).await;
        }

        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: ExchangeRateUpdated
    // ================================================================

    async fn handle_exchange_rate_updated(&self, log: Log) -> Result<(), EventListenerError> {
        let tx_hash = log.transaction_hash
            .map(|h| format!("{:#x}", h));
        
        let event: ExchangeRateUpdatedFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        let order_id = format!("0x{}", hex::encode(event.order_id));

        tracing::info!(
            "📊 ExchangeRateUpdated:\n  order_id: {}\n  oldRate: {}\n  newRate: {}\n  txHash: {:?}",
            order_id,
            event.old_rate,
            event.new_rate,
            tx_hash
        );

        // DATABASE SYNC: Update exchange rate
        let order_repo = PostgresOrderRepository::new(self.db_pool.clone());
        match order_repo.update_exchange_rate(&order_id, &event.new_rate.to_string()).await {
            Ok(_) => {
                tracing::info!("✅ Order {} exchange rate updated to {}", order_id, event.new_rate);
            }
            Err(e) => {
                tracing::error!("❌ Database update failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // Send email notification to seller
        if let Ok(order) = order_repo.get(&order_id).await {
            // Format exchange rates (divide by 100 since stored in cents)
            let old_rate = (event.old_rate.as_u64() as f64) / 100.0;
            let new_rate = (event.new_rate.as_u64() as f64) / 100.0;
            
            self.send_email_notification(
                EmailEvent::OrderUpdated,
                &order.seller,
                EmailInfo::ExchangeRateUpdated {
                    order_id: order_id.clone(),
                    old_rate: format!("{:.2}", old_rate),
                    new_rate: format!("{:.2}", new_rate),
                },
            ).await;
        }

        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: AccountLinesHashUpdated (v4 - Privacy)
    // 
    // NOTE: Payment info updates are NO LONGER SUPPORTED via frontend.
    // If someone updates the hash directly on-chain, we just log it for auditing.
    // The backend will reject any payment-info API calls for orders that already have payment info.
    // Users must create a new order if they want different payment details.
    // ================================================================

    async fn handle_account_lines_hash_updated(&self, log: Log) -> Result<(), EventListenerError> {
        let tx_hash = log.transaction_hash
            .map(|h| format!("{:#x}", h));
        
        let event: AccountLinesHashUpdatedFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        let order_id = format!("0x{}", hex::encode(event.order_id));
        let old_hash = format!("0x{}", hex::encode(event.old_hash));
        let new_hash = format!("0x{}", hex::encode(event.new_hash));

        tracing::warn!(
            "⚠️ AccountLinesHashUpdated (updates not supported via UI):\n  order_id: {}\n  oldHash: {}\n  newHash: {}\n  txHash: {:?}",
            order_id,
            old_hash,
            new_hash,
            tx_hash
        );

        // NOTE: Payment info updates are no longer allowed via the API.
        // This event is kept for auditing in case someone calls the contract directly.

        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: TradeCreated
    // New signature: TradeCreated(bytes32 indexed tradeId, bytes32 indexed orderId, address indexed buyer,
    //                             address token, uint256 tokenAmount, uint256 fiatAmount, uint256 expiresAt)
    // NOTE: No more paymentNonce - transaction_id comes from PDF parsing
    // ================================================================

    async fn handle_trade_created(&self, log: Log) -> Result<(), EventListenerError> {
        let tx_hash = log.transaction_hash
            .map(|h| format!("{:#x}", h))
            .unwrap_or_default();

        let event: TradeCreatedFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        let trade_id = format!("0x{}", hex::encode(event.trade_id));
        let order_id = format!("0x{}", hex::encode(event.order_id));

        tracing::info!(
            "💱 TradeCreated:\n  \
            trade_id: {}\n  \
            order_id: {}\n  \
            buyer: {:#x}\n  \
            token: {:#x}\n  \
            tokenAmount: {}\n  \
            feeAmount: {}\n  \
            fiatAmount: {}\n  \
            expiresAt: {}",
            trade_id,
            order_id,
            event.buyer,
            event.token,
            event.token_amount,
            event.fee_amount,
            event.fiat_amount,
            event.expires_at
        );

        // DATABASE SYNC: Create trade record
        let trade_repo = PostgresTradeRepository::new(self.db_pool.clone());
        let order_repo = PostgresOrderRepository::new(self.db_pool.clone());
        
        // Get order to fetch the rail (payment method)
        let rail = match order_repo.get(&order_id).await {
            Ok(order) => order.rail,
            Err(_) => 0, // Default to ALIPAY if order not found
        };
        
        let db_trade = DbTrade {
            trade_id: trade_id.clone(),
            order_id: order_id.clone(),
            buyer: format!("{:#x}", event.buyer).to_lowercase(),
            token_amount: event.token_amount.to_string(),
            cny_amount: event.fiat_amount.to_string(), // fiatAmount in cents
            fee_amount: Some(event.fee_amount.to_string()), // Fee from blockchain event (actual fee rate)
            rail, // PaymentRail from order
            transaction_id: None, // Populated when proof is submitted
            payment_time: None, // Populated when proof is submitted
            created_at: chrono::Utc::now().timestamp(),
            expires_at: event.expires_at.as_u64() as i64,
            status: 0, // PENDING
            synced_at: chrono::Utc::now(),
            escrow_tx_hash: Some(tx_hash),
            settlement_tx_hash: None,
            token: Some(format!("{:#x}", event.token).to_lowercase()),
            pdf_file: None,
            pdf_filename: None,
            pdf_uploaded_at: None,
            proof_user_public_values: None,
            proof_accumulator: None,
            proof_data: None,
            axiom_proof_id: None,
            proof_generated_at: None,
            proof_json: None,
            settlement_error: None, // Set when blockchain submission fails
            chain_id: self.chain_id, // Chain this event listener is monitoring
            alipay_id: None, // Will be fetched from order when needed
            alipay_name: None, // Will be fetched from order when needed
        };

        match trade_repo.create(&db_trade).await {
            Ok(_) => {
                tracing::info!("✅ Trade {} created in database", trade_id);
            }
            Err(e) => {
                tracing::error!("❌ Database insert failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // Adjust order remaining amount (tokenAmount + feeAmount from event)
        // Fee comes directly from blockchain event - no hardcoding needed!
        let total_reserve = event.token_amount + event.fee_amount;
        let delta = format!("-{}", total_reserve);
        
        match order_repo.adjust_remaining_amount(&order_id, &delta).await {
            Ok(_) => {
                tracing::info!("✅ Order {} remaining amount adjusted by -{} (token: {}, fee: {})", 
                    order_id, total_reserve, event.token_amount, event.fee_amount);
            }
            Err(e) => {
                tracing::error!("❌ Database update failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // Send email notifications to both seller AND buyer
        if let Ok(order) = order_repo.get(&order_id).await {
            let token_symbol = get_token_symbol(&order.token);
            let decimals = get_token_decimals(&order.token);
            let buyer_address = format!("{:#x}", event.buyer).to_lowercase();
            let formatted_token_amount = format_token_amount(&event.token_amount.to_string(), decimals, "");
            
            // NOTE: TradeCreated emails removed - users see pending trades in activity timeline instead
            // (Both seller and buyer will see the trade in their respective order/purchase pages)
            let _ = (buyer_address, formatted_token_amount, token_symbol); // Silence unused warnings
        }

        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: TradeSettled
    // New signature: TradeSettled(bytes32 indexed tradeId, string transactionId)
    // ================================================================

    async fn handle_trade_settled(&self, log: Log) -> Result<(), EventListenerError> {
        let tx_hash = log.transaction_hash
            .map(|h| format!("{:#x}", h))
            .unwrap_or_default();

        let event: TradeSettledFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        let trade_id = format!("0x{}", hex::encode(event.trade_id));
        let tx_id_hash = format!("0x{}", hex::encode(event.tx_id_hash));

        // Note: v4 privacy - txIdHash is logged, not plain transaction_id
        // The plain transaction_id is stored in DB from PDF parsing
        tracing::info!(
            "✅ TradeSettled (v4):\n  trade_id: {}\n  tx_id_hash: {}\n  settlement_tx: {}",
            trade_id,
            tx_id_hash,
            tx_hash
        );

        // DATABASE SYNC: Update trade status to SETTLED
        // NOTE: remainingAmount was already deducted at TradeCreated, no adjustment needed here
        let trade_repo = PostgresTradeRepository::new(self.db_pool.clone());
        
        match trade_repo.update_status(&trade_id, 1).await {
            Ok(_) => {
                tracing::info!("✅ Trade {} status updated to SETTLED", trade_id);
            }
            Err(e) => {
                tracing::error!("❌ Database update failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        if !tx_hash.is_empty() {
            if let Err(e) = trade_repo.update_settlement_tx(&trade_id, &tx_hash).await {
                tracing::warn!("⚠️ Failed to update settlement tx hash: {}", e);
            }
        }

        // Send email notifications to both seller AND buyer
        if let Ok(trade) = trade_repo.get(&trade_id).await {
            let order_repo = PostgresOrderRepository::new(self.db_pool.clone());
            if let Ok(order) = order_repo.get(&trade.order_id).await {
                let token_symbol = get_token_symbol(&order.token);
                let decimals = get_token_decimals(&order.token);
                let formatted_token_amount = format_token_amount(&trade.token_amount, decimals, "");
                
                // Use fee from database (stored from TradeCreated event) - blockchain is source of truth
                let formatted_fee = match &trade.fee_amount {
                    Some(fee) => format_token_amount(fee, decimals, ""),
                    None => {
                        // Fallback: calculate from current blockchain config if fee wasn't stored
                        tracing::warn!("Trade {} missing fee_amount, falling back to 1%", trade_id);
                        let token_amount_u256 = trade.token_amount.parse::<u128>().unwrap_or(0);
                        format_token_amount(&(token_amount_u256 / 100).to_string(), decimals, "")
                    }
                };
                
                // Email to SELLER: Trade settled, payment received
                self.send_email_notification(
                    EmailEvent::TradeSettledSeller,
                    &order.seller,
                    EmailInfo::TradeSettledSeller {
                        order_id: trade.order_id.clone(),
                        trade_id: trade_id.clone(),
                        token_amount: formatted_token_amount.clone(),
                        token_symbol: token_symbol.clone(),
                        cny_amount: trade.cny_amount.clone(),
                        fee_amount: formatted_fee,
                        buyer_address: trade.buyer.clone(),
                        settlement_tx: tx_hash.clone(),
                    },
                ).await;
                
                // Email to BUYER: Your purchase is complete
                self.send_email_notification(
                    EmailEvent::TradeSettledBuyer,
                    &trade.buyer,
                    EmailInfo::TradeSettledBuyer {
                        order_id: trade.order_id.clone(),
                        trade_id: trade_id.clone(),
                        token_amount: formatted_token_amount,
                        token_symbol,
                        settlement_tx: tx_hash.clone(),
                    },
                ).await;
            }
        }
        
        Ok(())
    }

    // ================================================================
    // EVENT HANDLER: TradeExpired
    // ================================================================

    async fn handle_trade_expired(&self, log: Log) -> Result<(), EventListenerError> {
        let event: TradeExpiredFilter = ethers::contract::parse_log(log)
            .map_err(|e| EventListenerError::EventDecodeError(e.to_string()))?;

        let trade_id = format!("0x{}", hex::encode(event.trade_id));
        let order_id = format!("0x{}", hex::encode(event.order_id));

        tracing::info!(
            "⏰ TradeExpired:\n  trade_id: {}\n  order_id: {}\n  tokenAmount: {} (returned)",
            trade_id,
            order_id,
            event.total_returned
        );

        // DATABASE SYNC: Update trade status to EXPIRED
        let trade_repo = PostgresTradeRepository::new(self.db_pool.clone());
        
        match trade_repo.update_status(&trade_id, 2).await {
            Ok(_) => {
                tracing::info!("✅ Trade {} status updated to EXPIRED", trade_id);
            }
            Err(e) => {
                tracing::error!("❌ Database update failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // Add tokens back to order (includes fee)
        let order_repo = PostgresOrderRepository::new(self.db_pool.clone());
        let delta = event.total_returned.to_string();
        
        match order_repo.adjust_remaining_amount(&order_id, &delta).await {
            Ok(_) => {
                tracing::info!("✅ Order {} remaining amount adjusted", order_id);
            }
            Err(e) => {
                tracing::error!("❌ Database update failed: {}", e);
                return Err(EventListenerError::DatabaseError(e.to_string()));
            }
        }

        // NOTE: TradeExpired emails removed - users see expired trades in their activity timeline instead

        Ok(())
    }

    // ================================================================
    // EMAIL NOTIFICATION HELPER (Account-based, not role-based)
    // ================================================================

    /// Send email notification to a wallet address if they have email configured
    async fn send_email_notification(
        &self,
        event: EmailEvent,
        wallet: &str,
        info: EmailInfo,
    ) {
        let email_service = match &self.email_service {
            Some(s) => s,
            None => return, // Email not configured
        };

        // Look up account's email settings
        let email_repo = AccountEmailRepository::new(self.db_pool.clone());
        let account_email = match email_repo.get_if_enabled(wallet).await {
            Ok(Some(e)) => e,
            Ok(None) => {
                tracing::debug!("📧 No email configured for wallet {}", wallet);
                return;
            }
            Err(e) => {
                tracing::warn!("📧 Failed to fetch account email: {}", e);
                return;
            }
        };

        // Send email asynchronously (don't block event processing)
        let email_service = email_service.clone();
        let to_email = account_email.email.clone();
        let language = account_email.language.clone();
        
        tokio::spawn(async move {
            match email_service.send_notification(&to_email, &language, event, &info).await {
                Ok(_) => tracing::info!("📧 Email sent successfully for {:?} event", event),
                Err(e) => tracing::error!("📧 Failed to send email: {}", e),
            }
        });
    }

    // ================================================================
    // DATABASE HELPERS
    // ================================================================

    async fn get_last_synced_block(
        pool: &sqlx::PgPool,
        contract_address: &Address,
    ) -> Result<u64, EventListenerError> {
        let addr = format!("{:#x}", contract_address).to_lowercase();
        let row: (i64,) = sqlx::query_as(
            "SELECT last_synced_block FROM event_sync_state WHERE contract_address = $1",
        )
        .bind(&addr)
        .fetch_one(pool)
        .await
        .map_err(|e| EventListenerError::DatabaseError(e.to_string()))?;

        Ok(row.0 as u64)
    }

    async fn save_last_synced_block(
        pool: &sqlx::PgPool,
        contract_address: &Address,
        block: u64,
    ) -> Result<(), EventListenerError> {
        let addr = format!("{:#x}", contract_address).to_lowercase();
        sqlx::query(
            "INSERT INTO event_sync_state (contract_address, last_synced_block) 
             VALUES ($1, $2) 
             ON CONFLICT (contract_address) 
             DO UPDATE SET last_synced_block = $2",
        )
        .bind(&addr)
        .bind(block as i64)
        .execute(pool)
        .await
        .map_err(|e| EventListenerError::DatabaseError(e.to_string()))?;

        Ok(())
    }
}

// ================================================================
// TOKEN HELPERS
// ================================================================

/// Get token symbol from address (Base Mainnet)
fn get_token_symbol(token_address: &str) -> String {
    let addr = token_address.to_lowercase();
    match addr.as_str() {
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" => "USDC".to_string(),
        "0x4200000000000000000000000000000000000006" => "WETH".to_string(),
        "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" => "cbBTC".to_string(),
        _ => "TOKEN".to_string(),
    }
}

/// Get token decimals from address (Base Mainnet)
fn get_token_decimals(token_address: &str) -> u8 {
    let addr = token_address.to_lowercase();
    match addr.as_str() {
        "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" => 6,  // USDC
        "0x4200000000000000000000000000000000000006" => 18, // WETH
        "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf" => 8,  // cbBTC
        _ => 18,
    }
}
