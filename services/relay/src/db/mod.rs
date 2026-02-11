pub mod account_emails;
pub mod gas_costs;
pub mod models;
pub mod orders;
pub mod trades;
pub mod withdrawals;

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;
use thiserror::Error;
use chrono::{DateTime, Utc};
use trades::TradeRepository;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("Database error: {0}")]
    SqlxError(#[from] sqlx::Error),
    
    #[error("Migration error: {0}")]
    MigrationError(#[from] sqlx::migrate::MigrateError),
    
    #[error("Order not found: {0}")]
    OrderNotFound(String),
    
    #[error("Trade not found: {0}")]
    TradeNotFound(String),
    
    #[error("Invalid input: {0}")]
    InvalidInput(String),
}

pub type DbResult<T> = Result<T, DbError>;

/// Database connection manager for on-chain event tracking
pub struct Database {
    pool: PgPool,
}

impl Database {
    /// Create a new database connection from URL
    pub async fn new(database_url: &str) -> DbResult<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(10)
            .min_connections(1)
            .acquire_timeout(Duration::from_secs(30))
            // Railway drops idle connections aggressively - keep idle timeout short
            .idle_timeout(Duration::from_secs(60))
            // Force connection refresh every 5 minutes
            .max_lifetime(Duration::from_secs(300))
            // Test connections before use to detect stale connections
            .test_before_acquire(true)
            .connect(database_url)
            .await?;

        Ok(Self { pool })
    }

    /// Get the connection pool
    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    /// Run database migrations
    pub async fn migrate(&self) -> DbResult<()> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await?;
        Ok(())
    }

    /// Health check - verify database is accessible
    pub async fn health_check(&self) -> DbResult<()> {
        sqlx::query("SELECT 1")
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Close all connections
    pub async fn close(&self) {
        self.pool.close().await;
    }
    
    /// Get all active orders (convenience method for API)
    /// chain_id: None = all chains, Some(8453) = Base only, Some(1) = ETH only
    pub async fn get_active_orders(&self, limit: Option<i64>, chain_id: Option<i32>) -> DbResult<Vec<models::DbOrder>> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.get_active_orders(limit, chain_id).await
    }
    
    /// Get active orders filtered by token (convenience method for API)
    pub async fn get_active_orders_by_token(&self, token_address: &str, limit: Option<i64>, chain_id: Option<i32>) -> DbResult<Vec<models::DbOrder>> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.get_active_orders_by_token(token_address, limit, chain_id).await
    }
    
    /// Get single order by ID (convenience method for API)
    pub async fn get_order(&self, order_id: &str) -> DbResult<models::DbOrder> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.get(order_id).await
    }
    
    /// Get orders by seller (convenience method for API)
    pub async fn get_orders_by_seller(&self, seller: &str) -> DbResult<Vec<models::DbOrder>> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.get_by_seller(seller).await
    }
    
    /// Get order by private code (for unlisted orders)
    pub async fn get_order_by_private_code(&self, private_code: &str) -> DbResult<models::DbOrder> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.get_by_private_code(private_code).await
    }
    
    /// Set order visibility (public/private) and return private code if applicable
    pub async fn set_order_visibility(&self, order_id: &str, is_public: bool) -> DbResult<Option<String>> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.set_visibility(order_id, is_public).await
    }
    
    /// Get single trade by ID (convenience method for API)
    pub async fn get_trade(&self, trade_id: &str) -> DbResult<models::DbTrade> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.get(trade_id).await
    }
    
    /// Save PDF for a trade (convenience method for API)
    pub async fn save_trade_pdf(&self, trade_id: &str, pdf_data: &[u8], filename: &str) -> DbResult<DateTime<Utc>> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.save_pdf(trade_id, pdf_data, filename).await
    }
    
    /// Clear PDF for a trade when validation fails (allows retry)
    pub async fn clear_trade_pdf(&self, trade_id: &str) -> DbResult<()> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.clear_pdf(trade_id).await
    }
    
    /// Save proof for a trade (convenience method for API)
    pub async fn save_trade_proof(&self, trade_id: &str, user_public_values: &[u8], accumulator: &[u8], proof_data: &[u8], axiom_proof_id: &str, proof_json: &str) -> DbResult<()> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.save_proof(trade_id, user_public_values, accumulator, proof_data, axiom_proof_id, proof_json).await
    }
    
    /// Update trade payment info (transaction_id and payment_time from PDF)
    pub async fn update_trade_payment_info(&self, trade_id: &str, transaction_id: &str, payment_time: &str) -> DbResult<()> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.update_payment_info(trade_id, transaction_id, payment_time).await
    }
    
    /// Update order payment info (plain text accountId/accountName for v4 privacy)
    pub async fn update_payment_info(&self, order_id: &str, account_id: &str, account_name: &str) -> DbResult<()> {
        let repo = orders::PostgresOrderRepository::new(self.pool.clone());
        repo.update_payment_info(order_id, account_id, account_name).await
    }
    
    /// Get all expired pending trades for auto-cancellation
    pub async fn get_expired_pending_trades(&self) -> DbResult<Vec<models::DbTrade>> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.get_expired_pending_trades().await
    }
    
    /// Update trade status (convenience method for auto-cancellation)
    pub async fn update_trade_status(&self, trade_id: &str, new_status: i32) -> DbResult<()> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.update_status(trade_id, new_status).await
    }
    
    /// Get all trades (for debug purposes)
    pub async fn get_all_trades(&self) -> DbResult<Vec<models::DbTrade>> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.get_all_trades().await
    }
    
    /// Check if transaction ID has been used in any settled trade (anti-replay)
    pub async fn is_transaction_id_used(&self, transaction_id: &str) -> DbResult<bool> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.is_transaction_id_used(transaction_id).await
    }
    
    /// Save settlement error for a trade (when blockchain submission fails)
    pub async fn save_trade_settlement_error(&self, trade_id: &str, error_code: &str) -> DbResult<()> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.save_settlement_error(trade_id, error_code).await
    }
    
    // ===== Account Email Methods (account-based, not role-based) =====
    
    /// Get account email settings by wallet address
    pub async fn get_account_email(&self, wallet: &str) -> DbResult<Option<models::DbAccountEmail>> {
        let repo = account_emails::AccountEmailRepository::new(self.pool.clone());
        repo.get(wallet).await
    }
    
    /// Set or update account email (upsert)
    pub async fn upsert_account_email(&self, wallet: &str, email: &str, language: &str) -> DbResult<models::DbAccountEmail> {
        let repo = account_emails::AccountEmailRepository::new(self.pool.clone());
        repo.upsert(wallet, email, language).await
    }
    
    /// Enable or disable account notifications
    pub async fn set_account_email_enabled(&self, wallet: &str, enabled: bool) -> DbResult<()> {
        let repo = account_emails::AccountEmailRepository::new(self.pool.clone());
        repo.set_enabled(wallet, enabled).await
    }
    
    /// Delete account email (opt out)
    pub async fn delete_account_email(&self, wallet: &str) -> DbResult<()> {
        let repo = account_emails::AccountEmailRepository::new(self.pool.clone());
        repo.delete(wallet).await
    }
    
    /// Get account email if notifications are enabled
    pub async fn get_account_email_if_enabled(&self, wallet: &str) -> DbResult<Option<models::DbAccountEmail>> {
        let repo = account_emails::AccountEmailRepository::new(self.pool.clone());
        repo.get_if_enabled(wallet).await
    }
    
    // ===== Gas Cost Methods (relay gas tracking) =====
    
    /// Record a gas cost for a relay transaction
    pub async fn record_gas_cost(&self, gas_cost: &models::DbGasCost) -> DbResult<()> {
        let repo = gas_costs::GasCostRepository::new(self.pool.clone());
        repo.create(gas_cost).await
    }
    
    /// Get gas cost summary by chain and operation
    pub async fn get_gas_cost_summary(&self, chain_id: i32) -> DbResult<Vec<gas_costs::GasCostSummary>> {
        let repo = gas_costs::GasCostRepository::new(self.pool.clone());
        repo.get_summary_by_chain(chain_id).await
    }
    
    /// Get gas costs grouped by trade ID (for DB viewer)
    pub async fn get_gas_costs_by_trades(&self) -> DbResult<Vec<gas_costs::TradeGasCost>> {
        let repo = gas_costs::GasCostRepository::new(self.pool.clone());
        repo.get_costs_by_trade().await
    }
    
    // ===== Withdrawal Methods (order activity timeline) =====
    
    /// Create a withdrawal record
    pub async fn create_withdrawal(&self, order_id: &str, amount: &str, remaining_after: &str, tx_hash: Option<&str>) -> DbResult<()> {
        let repo = withdrawals::PostgresWithdrawalRepository::new(self.pool.clone());
        repo.create(order_id, amount, remaining_after, tx_hash).await
    }
    
    /// Get all withdrawals for an order
    pub async fn get_withdrawals_by_order(&self, order_id: &str) -> DbResult<Vec<models::DbWithdrawal>> {
        let repo = withdrawals::PostgresWithdrawalRepository::new(self.pool.clone());
        repo.get_by_order(order_id).await
    }
    
    /// Get all settled trades for an order (for activity timeline)
    pub async fn get_settled_trades_by_order(&self, order_id: &str) -> DbResult<Vec<models::DbTrade>> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.get_settled_by_order(order_id).await
    }
    
    /// Get all trades for an order (including pending, for activity timeline)
    pub async fn get_all_trades_by_order(&self, order_id: &str) -> DbResult<Vec<models::DbTrade>> {
        let repo = trades::PostgresTradeRepository::new(self.pool.clone());
        repo.get_all_by_order(order_id).await
    }
}
