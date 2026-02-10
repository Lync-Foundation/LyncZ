use async_trait::async_trait;
use sqlx::PgPool;
use chrono::{DateTime, Utc};

use super::{DbError, DbResult};
use super::models::DbTrade;

/// Repository for Trade operations - ONLY methods needed for event sync
#[async_trait]
pub trait TradeRepository: Send + Sync {
    /// Insert new trade from TradeCreated event
    async fn create(&self, trade: &DbTrade) -> DbResult<()>;
    
    /// Get trade by ID
    async fn get(&self, trade_id: &str) -> DbResult<DbTrade>;
    
    /// Update trade status from TradeSettled or TradeExpired events
    async fn update_status(&self, trade_id: &str, new_status: i32) -> DbResult<()>;
    
    /// Update proof hash from ProofSubmitted event (DEPRECATED)
    async fn update_proof_hash(&self, trade_id: &str, proof_hash: &str) -> DbResult<()>;
    
    /// Update settlement transaction hash from TradeSettled event
    async fn update_settlement_tx(&self, trade_id: &str, settlement_tx_hash: &str) -> DbResult<()>;
    
    /// Save PDF file for a trade
    async fn save_pdf(&self, trade_id: &str, pdf_data: &[u8], filename: &str) -> DbResult<DateTime<Utc>>;
    
    /// Clear PDF data when validation fails - allows user to retry
    async fn clear_pdf(&self, trade_id: &str) -> DbResult<()>;
    
    /// Save Axiom EVM proof data
    async fn save_proof(&self, trade_id: &str, user_public_values: &[u8], accumulator: &[u8], proof_data: &[u8], axiom_proof_id: &str, proof_json: &str) -> DbResult<()>;
    
    /// Update payment info (transaction_id and payment_time from PDF)
    async fn update_payment_info(&self, trade_id: &str, transaction_id: &str, payment_time: &str) -> DbResult<()>;
    
    /// Get all expired pending trades (status=0 and expiresAt < now)
    async fn get_expired_pending_trades(&self) -> DbResult<Vec<DbTrade>>;
    
    /// Get all trades (for debug purposes)
    async fn get_all_trades(&self) -> DbResult<Vec<DbTrade>>;
    
    /// Check if transaction ID has been used in any settled trade (anti-replay)
    async fn is_transaction_id_used(&self, transaction_id: &str) -> DbResult<bool>;
    
    /// Save settlement error when blockchain submission fails
    async fn save_settlement_error(&self, trade_id: &str, error_code: &str) -> DbResult<()>;
}

pub struct PostgresTradeRepository {
    pool: PgPool,
}

impl PostgresTradeRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl TradeRepository for PostgresTradeRepository {
    async fn create(&self, trade: &DbTrade) -> DbResult<()> {
        // Use dynamic query to avoid SQLX offline cache issues
        sqlx::query(
            r#"
            INSERT INTO trades (
                "tradeId", "orderId", "buyer", "token", "tokenAmount", "cnyAmount", "feeAmount",
                "rail", "transactionId", "paymentTime",
                "createdAt", "expiresAt", "status",
                "escrowTxHash", "settlementTxHash", "chainId"
            )
            VALUES ($1, $2, $3, $4, $5::numeric, $6::numeric, $7::numeric, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT ("tradeId") DO NOTHING
            "#,
        )
        .bind(&trade.trade_id)
        .bind(&trade.order_id)
        .bind(&trade.buyer)
        .bind(&trade.token)
        .bind(&trade.token_amount)
        .bind(&trade.cny_amount)
        .bind(&trade.fee_amount)
        .bind(trade.rail)
        .bind(&trade.transaction_id)
        .bind(&trade.payment_time)
        .bind(trade.created_at)
        .bind(trade.expires_at)
        .bind(trade.status)
        .bind(&trade.escrow_tx_hash)
        .bind(&trade.settlement_tx_hash)
        .bind(trade.chain_id)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn get(&self, trade_id: &str) -> DbResult<DbTrade> {
        // Use dynamic query to avoid SQLX offline cache issues
        let row = sqlx::query(
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
        .bind(trade_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| DbError::TradeNotFound(trade_id.to_string()))?;

        use sqlx::Row;
        Ok(DbTrade {
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
            token: None, // Not available in single trade query (would need JOIN)
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
            alipay_id: None, // Not available in single trade query
            alipay_name: None, // Not available in single trade query
        })
    }

    async fn update_status(&self, trade_id: &str, new_status: i32) -> DbResult<()> {
        let result = sqlx::query(
            r#"UPDATE trades SET "status" = $1 WHERE "tradeId" = $2"#,
        )
        .bind(new_status)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(())
    }
    
    async fn update_proof_hash(&self, _trade_id: &str, _proof_hash: &str) -> DbResult<()> {
        // DEPRECATED: This method is no longer used (we use save_proof instead)
        // Kept for compatibility but does nothing
        tracing::warn!("update_proof_hash called but is deprecated, use save_proof instead");
        Ok(())
    }
    
    async fn update_settlement_tx(&self, trade_id: &str, settlement_tx_hash: &str) -> DbResult<()> {
        let result = sqlx::query(
            r#"UPDATE trades SET "settlementTxHash" = $1 WHERE "tradeId" = $2"#,
        )
        .bind(settlement_tx_hash)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(())
    }
    
    async fn save_pdf(&self, trade_id: &str, pdf_data: &[u8], filename: &str) -> DbResult<DateTime<Utc>> {
        let uploaded_at = Utc::now();
        
        let result = sqlx::query(
            r#"
            UPDATE trades 
            SET pdf_file = $1, pdf_filename = $2, pdf_uploaded_at = $3
            WHERE "tradeId" = $4
            "#,
        )
        .bind(pdf_data)
        .bind(filename)
        .bind(uploaded_at)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(uploaded_at)
    }
    
    /// Clear PDF data when validation fails - allows user to retry with a different PDF
    async fn clear_pdf(&self, trade_id: &str) -> DbResult<()> {
        let result = sqlx::query(
            r#"
            UPDATE trades 
            SET pdf_file = NULL, pdf_filename = NULL, pdf_uploaded_at = NULL,
                "transactionId" = NULL, "paymentTime" = NULL
            WHERE "tradeId" = $1
            "#,
        )
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(())
    }
    
    async fn save_proof(&self, trade_id: &str, user_public_values: &[u8], accumulator: &[u8], proof_data: &[u8], axiom_proof_id: &str, proof_json: &str) -> DbResult<()> {
        let generated_at = Utc::now();
        
        let result = sqlx::query(
            r#"
            UPDATE trades 
            SET proof_user_public_values = $1,
                proof_accumulator = $2,
                proof_data = $3,
                axiom_proof_id = $4,
                proof_generated_at = $5,
                proof_json = $6
            WHERE "tradeId" = $7
            "#,
        )
        .bind(user_public_values)
        .bind(accumulator)
        .bind(proof_data)
        .bind(axiom_proof_id)
        .bind(generated_at)
        .bind(proof_json)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(())
    }
    
    async fn update_payment_info(&self, trade_id: &str, transaction_id: &str, payment_time: &str) -> DbResult<()> {
        // Use dynamic query to avoid SQLX offline cache issues
        let result = sqlx::query(
            r#"
            UPDATE trades 
            SET "transactionId" = $1, "paymentTime" = $2
            WHERE "tradeId" = $3
            "#,
        )
        .bind(transaction_id)
        .bind(payment_time)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(())
    }
    
    async fn get_expired_pending_trades(&self) -> DbResult<Vec<DbTrade>> {
        // Find all trades where:
        // - status = 0 (PENDING)
        // - expiresAt (unix timestamp) < current unix timestamp
        let rows = sqlx::query(
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
            WHERE status = 0 AND "expiresAt" < EXTRACT(EPOCH FROM NOW())::bigint
            ORDER BY "expiresAt" ASC
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut trades = Vec::new();
        for row in rows {
            use sqlx::Row;
            trades.push(DbTrade {
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
                token: None, // Not needed for auto-cancellation
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
                alipay_id: None, // Not needed for auto-cancellation
                alipay_name: None, // Not needed for auto-cancellation
            });
        }
        Ok(trades)
    }
    
    async fn get_all_trades(&self) -> DbResult<Vec<DbTrade>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                t."tradeId", t."orderId", t."buyer", t."tokenAmount"::text, t."cnyAmount"::text, t."feeAmount"::text,
                t."rail", t."transactionId", t."paymentTime",
                t."createdAt", t."expiresAt", t."status",
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
            ORDER BY t."createdAt" DESC
            LIMIT 100
            "#,
        )
        .fetch_all(&self.pool)
        .await?;

        let mut trades = Vec::new();
        for row in rows {
            use sqlx::Row;
            trades.push(DbTrade {
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
                token: row.get("token"),
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
                alipay_id: row.get("alipay_id"),
                alipay_name: row.get("alipay_name"),
            });
        }
        Ok(trades)
    }
    
    async fn save_settlement_error(&self, trade_id: &str, error_code: &str) -> DbResult<()> {
        let result = sqlx::query(
            r#"UPDATE trades SET settlement_error = $1 WHERE "tradeId" = $2"#,
        )
        .bind(error_code)
        .bind(trade_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::TradeNotFound(trade_id.to_string()));
        }

        Ok(())
    }
    
    async fn is_transaction_id_used(&self, transaction_id: &str) -> DbResult<bool> {
        // Check if any SETTLED trade (status=1) has this transaction ID
        let result: Option<(i32,)> = sqlx::query_as(
            r#"
            SELECT 1 as exists_flag
            FROM trades
            WHERE "transactionId" = $1 AND status = 1
            LIMIT 1
            "#,
        )
        .bind(transaction_id)
        .fetch_optional(&self.pool)
        .await?;
        
        Ok(result.is_some())
    }
}

impl PostgresTradeRepository {
    /// Helper to map a joined trade row to DbTrade (includes token, alipay_id, alipay_name from orders JOIN)
    fn map_joined_row(row: sqlx::postgres::PgRow) -> DbTrade {
        use sqlx::Row;
        DbTrade {
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
            token: row.get("token"),
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
            alipay_id: row.get("alipay_id"),
            alipay_name: row.get("alipay_name"),
        }
    }
    
    /// Get all settled trades for an order (status=1), sorted by creation time descending
    /// Used for order activity timeline
    pub async fn get_settled_by_order(&self, order_id: &str) -> DbResult<Vec<DbTrade>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                t."tradeId", t."orderId", t.buyer,
                t."tokenAmount"::TEXT, t."cnyAmount"::TEXT, t."feeAmount"::TEXT,
                t.rail, t."transactionId", t."paymentTime",
                t."createdAt", t."expiresAt", t.status,
                t."syncedAt", t."escrowTxHash", t."settlementTxHash",
                t.pdf_file, t.pdf_filename, t.pdf_uploaded_at,
                t.proof_user_public_values, t.proof_accumulator, t.proof_data,
                t.axiom_proof_id, t.proof_generated_at, t.proof_json, t.settlement_error,
                t."chainId",
                COALESCE(t.token, o.token) as token,
                o."accountId" as "alipay_id",
                o."accountName" as "alipay_name"
            FROM trades t
            LEFT JOIN orders o ON t."orderId" = o."orderId"
            WHERE t."orderId" = $1 AND t.status = 1
            ORDER BY t."createdAt" DESC
            "#,
        )
        .bind(order_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(Self::map_joined_row).collect())
    }
    
    /// Get all trades for an order (all statuses), sorted by creation time descending
    /// Used for order activity timeline to show pending trades too
    pub async fn get_all_by_order(&self, order_id: &str) -> DbResult<Vec<DbTrade>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                t."tradeId", t."orderId", t.buyer,
                t."tokenAmount"::TEXT, t."cnyAmount"::TEXT, t."feeAmount"::TEXT,
                t.rail, t."transactionId", t."paymentTime",
                t."createdAt", t."expiresAt", t.status,
                t."syncedAt", t."escrowTxHash", t."settlementTxHash",
                t.pdf_file, t.pdf_filename, t.pdf_uploaded_at,
                t.proof_user_public_values, t.proof_accumulator, t.proof_data,
                t.axiom_proof_id, t.proof_generated_at, t.proof_json, t.settlement_error,
                t."chainId",
                COALESCE(t.token, o.token) as token,
                o."accountId" as "alipay_id",
                o."accountName" as "alipay_name"
            FROM trades t
            LEFT JOIN orders o ON t."orderId" = o."orderId"
            WHERE t."orderId" = $1
            ORDER BY t."createdAt" DESC
            "#,
        )
        .bind(order_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(Self::map_joined_row).collect())
    }
}
