use async_trait::async_trait;
use sqlx::PgPool;
use rust_decimal::Decimal;
use std::str::FromStr;
use rand::Rng;

use super::{DbError, DbResult};
use super::models::DbOrder;

/// Repository for Order operations - ONLY methods needed for event sync
#[async_trait]
pub trait OrderRepository: Send + Sync {
    /// Insert new order from OrderCreatedAndLocked event
    async fn create(&self, order: &DbOrder) -> DbResult<()>;
    
    /// Adjust order remaining amount by delta (+ or -)
    /// Used by: OrderPartiallyWithdrawn (negative), TradeCreated (negative), TradeExpired (positive)
    /// Positive delta: add funds back (e.g. TradeExpired)
    /// Negative delta: subtract funds (e.g. OrderPartiallyWithdrawn, TradeCreated)
    async fn adjust_remaining_amount(&self, order_id: &str, delta: &str) -> DbResult<()>;
}

pub struct PostgresOrderRepository {
    pool: PgPool,
}

impl PostgresOrderRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
    
    /// Get all active PUBLIC orders (remainingAmount > 0, is_public = true) sorted by exchange rate
    /// Used by API for matching and order list queries
    /// Optionally filtered by chain_id (None = all chains)
    pub async fn get_active_orders(&self, limit: Option<i64>, chain_id: Option<i32>) -> DbResult<Vec<DbOrder>> {
        let limit = limit.unwrap_or(100);
        
        let rows = if let Some(cid) = chain_id {
            sqlx::query(
                r#"
                SELECT 
                    "orderId", seller, token,
                    "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                    rail, "accountId", "accountName", "createdAt", "syncedAt",
                    "isPublic", "privateCode", "chainId"
                FROM orders
                WHERE "remainingAmount" > 0 AND "isPublic" = true AND "chainId" = $1
                ORDER BY CAST("exchangeRate" AS NUMERIC) ASC, "createdAt" ASC
                LIMIT $2
                "#
            )
            .bind(cid)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                SELECT 
                    "orderId", seller, token,
                    "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                    rail, "accountId", "accountName", "createdAt", "syncedAt",
                    "isPublic", "privateCode", "chainId"
                FROM orders
                WHERE "remainingAmount" > 0 AND "isPublic" = true
                ORDER BY CAST("exchangeRate" AS NUMERIC) ASC, "createdAt" ASC
                LIMIT $1
                "#
            )
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        
        let orders: Vec<DbOrder> = rows
            .into_iter()
            .map(|row| Self::map_row_to_order(row))
            .collect();
        
        Ok(orders)
    }
    
    /// Helper function to map a row to DbOrder
    fn map_row_to_order(row: sqlx::postgres::PgRow) -> DbOrder {
        use sqlx::Row;
        DbOrder {
            order_id: row.get("orderId"),
            seller: row.get("seller"),
            token: row.get("token"),
            total_amount: row.get::<Option<String>, _>("totalAmount").unwrap_or_default(),
            remaining_amount: row.get::<Option<String>, _>("remainingAmount").unwrap_or_default(),
            exchange_rate: row.get::<Option<String>, _>("exchangeRate").unwrap_or_default(),
            rail: row.get("rail"),
            alipay_id: row.get("accountId"),
            alipay_name: row.get("accountName"),
            created_at: row.get("createdAt"),
            chain_id: row.get("chainId"),
            synced_at: row.get("syncedAt"),
            is_public: row.get("isPublic"),
            private_code: row.get("privateCode"),
        }
    }
    
    /// Get active PUBLIC orders filtered by token address (case-insensitive)
    /// Used by API for token-specific matching
    /// Optionally filtered by chain_id
    pub async fn get_active_orders_by_token(&self, token_address: &str, limit: Option<i64>, chain_id: Option<i32>) -> DbResult<Vec<DbOrder>> {
        let limit = limit.unwrap_or(100);
        let token_lower = token_address.to_lowercase();
        
        let rows = if let Some(cid) = chain_id {
            sqlx::query(
                r#"
                SELECT 
                    "orderId", seller, token,
                    "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                    rail, "accountId", "accountName", "createdAt", "syncedAt",
                    "isPublic", "privateCode", "chainId"
                FROM orders
                WHERE "remainingAmount" > 0 AND "isPublic" = true
                AND LOWER(token) = $1 AND "chainId" = $2
                ORDER BY CAST("exchangeRate" AS NUMERIC) ASC, "createdAt" ASC
                LIMIT $3
                "#
            )
            .bind(&token_lower)
            .bind(cid)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        } else {
            sqlx::query(
                r#"
                SELECT 
                    "orderId", seller, token,
                    "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                    rail, "accountId", "accountName", "createdAt", "syncedAt",
                    "isPublic", "privateCode", "chainId"
                FROM orders
                WHERE "remainingAmount" > 0 AND "isPublic" = true
                AND LOWER(token) = $1
                ORDER BY CAST("exchangeRate" AS NUMERIC) ASC, "createdAt" ASC
                LIMIT $2
                "#
            )
            .bind(&token_lower)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?
        };
        
        let orders: Vec<DbOrder> = rows
            .into_iter()
            .map(|row| Self::map_row_to_order(row))
            .collect();
        
        Ok(orders)
    }
    
    /// Get single order by ID
    pub async fn get(&self, order_id: &str) -> DbResult<DbOrder> {
        let row = sqlx::query(
            r#"
            SELECT 
                "orderId", seller, token,
                "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                rail, "accountId", "accountName", "createdAt", "syncedAt",
                "isPublic", "privateCode", "chainId"
            FROM orders
            WHERE "orderId" = $1
            "#,
        )
        .bind(order_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| DbError::OrderNotFound(order_id.to_string()))?;
        
        Ok(Self::map_row_to_order(row))
    }
    
    /// Get single order by private code
    pub async fn get_by_private_code(&self, private_code: &str) -> DbResult<DbOrder> {
        let row = sqlx::query(
            r#"
            SELECT 
                "orderId", seller, token,
                "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                rail, "accountId", "accountName", "createdAt", "syncedAt",
                "isPublic", "privateCode", "chainId"
            FROM orders
            WHERE "privateCode" = $1
            "#,
        )
        .bind(private_code)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| DbError::OrderNotFound(format!("private_code:{}", private_code)))?;
        
        Ok(Self::map_row_to_order(row))
    }
    
    /// Set order visibility (public/private) and generate private code if needed
    pub async fn set_visibility(&self, order_id: &str, is_public: bool) -> DbResult<Option<String>> {
        // Generate a 6-digit code if making private
        let private_code = if !is_public {
            Some(Self::generate_unique_code(&self.pool).await?)
        } else {
            None
        };
        
        let result = sqlx::query(
            r#"
            UPDATE orders 
            SET "isPublic" = $1, "privateCode" = $2
            WHERE "orderId" = $3
            "#,
        )
        .bind(is_public)
        .bind(&private_code)
        .bind(order_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OrderNotFound(order_id.to_string()));
        }

        Ok(private_code)
    }
    
    /// Generate a unique 6-digit code
    async fn generate_unique_code(pool: &PgPool) -> DbResult<String> {
        for _ in 0..10 {
            // Generate random 6-digit code (100000 - 999999)
            // Use gen_range outside of async context by generating before the await
            let code: u32 = {
                let mut rng = rand::thread_rng();
                rng.gen_range(100000..1000000)
            };
            let code_str = code.to_string();
            
            // Check if code already exists
            let exists: Option<(i64,)> = sqlx::query_as(
                r#"SELECT 1 FROM orders WHERE "privateCode" = $1"#
            )
            .bind(&code_str)
            .fetch_optional(pool)
            .await?;
            
            if exists.is_none() {
                return Ok(code_str);
            }
        }
        
        Err(DbError::InvalidInput("Failed to generate unique private code after 10 attempts".to_string()))
    }
    
    /// Update exchange rate for an order
    pub async fn update_exchange_rate(&self, order_id: &str, new_rate: &str) -> DbResult<()> {
        let result = sqlx::query(
            r#"
            UPDATE orders 
            SET "exchangeRate" = $1::numeric
            WHERE "orderId" = $2
            "#,
        )
        .bind(new_rate)
        .bind(order_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OrderNotFound(order_id.to_string()));
        }

        Ok(())
    }
    
    /// Update payment info (accountId and accountName) for an order
    /// Uses UPSERT to handle race condition where payment info arrives before event handler creates order
    pub async fn update_payment_info(&self, order_id: &str, account_id: &str, account_name: &str) -> DbResult<()> {
        // First try to update existing order
        let result = sqlx::query(
            r#"
            UPDATE orders 
            SET "accountId" = $1, "accountName" = $2
            WHERE "orderId" = $3
            "#,
        )
        .bind(account_id)
        .bind(account_name)
        .bind(order_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            // Order doesn't exist yet (race condition with event handler)
            // Create a minimal placeholder order that will be updated by event handler
            tracing::info!("Order {} doesn't exist yet, creating placeholder with payment info", order_id);
            
            sqlx::query(
                r#"
                INSERT INTO orders (
                    "orderId", "seller", "token", "totalAmount", "remainingAmount",
                    "exchangeRate", "rail", "accountId", "accountName", "createdAt", "isPublic", "chainId"
                )
                VALUES ($1, '', '', 0, 0, 0, 0, $2, $3, 0, true, 8453)
                ON CONFLICT ("orderId") DO UPDATE SET
                    "accountId" = EXCLUDED."accountId",
                    "accountName" = EXCLUDED."accountName"
                "#,
            )
            .bind(order_id)
            .bind(account_id)
            .bind(account_name)
            .execute(&self.pool)
            .await?;
        }

        Ok(())
    }
    
    /// Get orders by seller (includes both public and private orders - for seller's own view)
    pub async fn get_by_seller(&self, seller: &str) -> DbResult<Vec<DbOrder>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                "orderId", seller, token,
                "totalAmount"::TEXT, "remainingAmount"::TEXT, "exchangeRate"::TEXT,
                rail, "accountId", "accountName", "createdAt", "syncedAt",
                "isPublic", "privateCode", "chainId"
            FROM orders
            WHERE seller = $1
            ORDER BY "createdAt" DESC
            "#,
        )
        .bind(seller)
        .fetch_all(&self.pool)
        .await?;
        
        let orders: Vec<DbOrder> = rows
            .into_iter()
            .map(|row| Self::map_row_to_order(row))
            .collect();
        
        Ok(orders)
    }
}

#[async_trait]
impl OrderRepository for PostgresOrderRepository {
    async fn create(&self, order: &DbOrder) -> DbResult<()> {
        // Use UPSERT to handle race condition:
        // - If order doesn't exist: insert with provided values
        // - If order exists (e.g., from payment-info endpoint): preserve existing accountId/accountName
        sqlx::query(
            r#"
            INSERT INTO orders (
                "orderId", "seller", "token", "totalAmount", "remainingAmount",
                "exchangeRate", "rail", "accountId", "accountName", "createdAt", "isPublic", "chainId"
            )
            VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric, $7, $8, $9, $10, $11, $12)
            ON CONFLICT ("orderId") DO UPDATE SET
                -- Update blockchain-authoritative fields
                "seller" = EXCLUDED."seller",
                "token" = EXCLUDED."token",
                "totalAmount" = EXCLUDED."totalAmount",
                "remainingAmount" = EXCLUDED."remainingAmount",
                "exchangeRate" = EXCLUDED."exchangeRate",
                "rail" = EXCLUDED."rail",
                "createdAt" = EXCLUDED."createdAt",
                "isPublic" = EXCLUDED."isPublic",
                "chainId" = EXCLUDED."chainId",
                -- PRESERVE existing accountId/accountName if already set (race condition handling)
                "accountId" = CASE 
                    WHEN orders."accountId" IS NOT NULL AND orders."accountId" != '' 
                    THEN orders."accountId" 
                    ELSE EXCLUDED."accountId" 
                END,
                "accountName" = CASE 
                    WHEN orders."accountName" IS NOT NULL AND orders."accountName" != '' 
                    THEN orders."accountName" 
                    ELSE EXCLUDED."accountName" 
                END
            "#,
        )
        .bind(&order.order_id)
        .bind(&order.seller)
        .bind(&order.token)
        .bind(&order.total_amount)
        .bind(&order.remaining_amount)
        .bind(&order.exchange_rate)
        .bind(order.rail)
        .bind(&order.alipay_id)
        .bind(&order.alipay_name)
        .bind(order.created_at)
        .bind(order.is_public)
        .bind(order.chain_id)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }

    async fn adjust_remaining_amount(&self, order_id: &str, delta: &str) -> DbResult<()> {
        let delta_decimal = Decimal::from_str(delta)
            .map_err(|e| DbError::InvalidInput(format!("Invalid delta: {}", e)))?;
        
        let result = sqlx::query(
            r#"
            UPDATE orders 
            SET "remainingAmount" = "remainingAmount" + $1::numeric
            WHERE "orderId" = $2
            "#,
        )
        .bind(delta_decimal)
        .bind(order_id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(DbError::OrderNotFound(order_id.to_string()));
        }

        Ok(())
    }
}
