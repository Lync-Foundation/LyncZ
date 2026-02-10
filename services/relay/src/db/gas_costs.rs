//! Gas cost tracking for relay wallet transactions
//! 
//! Records every on-chain transaction's gas cost per chain,
//! enabling fee optimization and cost analysis.

use sqlx::PgPool;

use super::{DbResult};
use super::models::DbGasCost;

/// Summary of gas costs grouped by operation
#[derive(Debug, serde::Serialize)]
pub struct GasCostSummary {
    pub operation: String,
    pub count: i64,
    pub total_cost_wei: String,
    pub total_cost_eth: String,
    pub avg_gas_used: f64,
    pub avg_gas_price_gwei: f64,
}

pub struct GasCostRepository {
    pool: PgPool,
}

impl GasCostRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
    
    /// Record a new gas cost entry
    pub async fn create(&self, gas_cost: &DbGasCost) -> DbResult<()> {
        sqlx::query(
            r#"
            INSERT INTO gas_costs (
                "chainId", "operation", "tradeId", "orderId", "txHash",
                "gasUsed", "gasPriceGwei", "costWei", "costEth"
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9::numeric)
            "#,
        )
        .bind(gas_cost.chain_id)
        .bind(&gas_cost.operation)
        .bind(&gas_cost.trade_id)
        .bind(&gas_cost.order_id)
        .bind(&gas_cost.tx_hash)
        .bind(gas_cost.gas_used)
        .bind(&gas_cost.gas_price_gwei)
        .bind(&gas_cost.cost_wei)
        .bind(&gas_cost.cost_eth)
        .execute(&self.pool)
        .await?;
        
        Ok(())
    }
    
    /// Get summary statistics grouped by operation for a specific chain
    pub async fn get_summary_by_chain(&self, chain_id: i32) -> DbResult<Vec<GasCostSummary>> {
        let rows = sqlx::query(
            r#"
            SELECT 
                "operation",
                COUNT(*) as count,
                SUM("costWei")::TEXT as total_cost_wei,
                SUM("costEth")::TEXT as total_cost_eth,
                AVG("gasUsed")::FLOAT8 as avg_gas_used,
                AVG("gasPriceGwei"::FLOAT8) as avg_gas_price_gwei
            FROM gas_costs
            WHERE "chainId" = $1
            GROUP BY "operation"
            ORDER BY "operation"
            "#,
        )
        .bind(chain_id)
        .fetch_all(&self.pool)
        .await?;
        
        use sqlx::Row;
        let summaries = rows.into_iter().map(|row| {
            GasCostSummary {
                operation: row.get("operation"),
                count: row.get("count"),
                total_cost_wei: row.get::<Option<String>, _>("total_cost_wei").unwrap_or_default(),
                total_cost_eth: row.get::<Option<String>, _>("total_cost_eth").unwrap_or_default(),
                avg_gas_used: row.get::<Option<f64>, _>("avg_gas_used").unwrap_or(0.0),
                avg_gas_price_gwei: row.get::<Option<f64>, _>("avg_gas_price_gwei").unwrap_or(0.0),
            }
        }).collect();
        
        Ok(summaries)
    }
}
