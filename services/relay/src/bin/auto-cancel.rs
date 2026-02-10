//! Auto-Cancellation Service for LyncZ
//! 
//! Monitors for expired trades and automatically cancels them,
//! returning escrowed funds to sellers.
//! 
//! Runs as a separate process alongside the API server.
//! The relay wallet pays gas fees for each cancellation (~0.0001 ETH on L2).

use std::sync::Arc;
use std::collections::HashMap;
use std::time::Duration;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use lyncz_relay::{Config, Database};
use lyncz_relay::blockchain::client::EthereumClient;

/// Check interval for expired trades (30 seconds)
const CHECK_INTERVAL_SECS: u64 = 30;

/// Status codes matching the smart contract (from LyncZEscrow.sol enum TradeStatus)
#[allow(dead_code)]
const TRADE_STATUS_PENDING: i32 = 0;  // Trade created, waiting for payment proof
#[allow(dead_code)]
const TRADE_STATUS_SETTLED: i32 = 1;  // Trade completed, tokens released to buyer
const TRADE_STATUS_EXPIRED: i32 = 2;  // Trade expired, tokens returned to order pool

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,lyncz_relay=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("🕐 Starting LyncZ Auto-Cancellation Service");

    let config = Config::load()?;
    config.log_summary();

    // Connect to database
    let db = Database::new(&config.database_url).await?;
    tracing::info!("✅ Database connected");

    // Initialize blockchain clients for all configured chains
    let private_key = config.relayer_private_key.as_ref()
        .ok_or("RELAYER_PRIVATE_KEY not set")?;
    
    let mut clients: HashMap<u64, Arc<EthereumClient>> = HashMap::new();
    
    for chain_config in &config.chains {
        let escrow_address: ethers::types::Address = chain_config.escrow_address.parse()?;
        
        match EthereumClient::new(
            &chain_config.rpc_url,
            private_key,
            escrow_address,
            chain_config.chain_id,
        ).await {
            Ok(client) => {
                let client = Arc::new(client);
                tracing::info!("✅ Blockchain client for {} (chain {}), relayer: {:?}", 
                    chain_config.name, chain_config.chain_id, client.relayer_address());
                clients.insert(chain_config.chain_id, client);
            }
            Err(e) => {
                tracing::warn!("⚠️ Failed to init client for {} (chain {}): {}", 
                    chain_config.name, chain_config.chain_id, e);
            }
        }
    }
    
    if clients.is_empty() {
        return Err("No blockchain clients initialized".into());
    }

    // Track total gas spent for logging
    let mut total_gas_spent_wei: u128 = 0;
    let mut total_trades_cancelled: u64 = 0;

    tracing::info!("🔄 Starting monitoring loop (check every {} seconds, {} chain(s))", 
        CHECK_INTERVAL_SECS, clients.len());

    loop {
        match check_and_cancel_expired(&db, &clients).await {
            Ok((cancelled_count, gas_spent)) => {
                if cancelled_count > 0 {
                    total_trades_cancelled += cancelled_count;
                    total_gas_spent_wei += gas_spent;
                    
                    let gas_eth = gas_spent as f64 / 1e18;
                    let total_gas_eth = total_gas_spent_wei as f64 / 1e18;
                    
                    tracing::info!(
                        "✅ Cancelled {} trades (gas: {:.6} ETH) | Total: {} trades, {:.6} ETH",
                        cancelled_count,
                        gas_eth,
                        total_trades_cancelled,
                        total_gas_eth
                    );
                }
            }
            Err(e) => {
                tracing::error!("❌ Error checking expired trades: {}", e);
            }
        }

        tokio::time::sleep(Duration::from_secs(CHECK_INTERVAL_SECS)).await;
    }
}

/// Check for expired trades and cancel them using the correct chain's client
/// Returns (number_cancelled, total_gas_spent_wei)
async fn check_and_cancel_expired(
    db: &Database,
    clients: &HashMap<u64, Arc<EthereumClient>>,
) -> Result<(u64, u128), Box<dyn std::error::Error + Send + Sync>> {
    // Get all expired pending trades from database (across all chains)
    let expired_trades = db.get_expired_pending_trades().await?;
    
    if expired_trades.is_empty() {
        return Ok((0, 0));
    }

    tracing::info!("📋 Found {} expired trades to cancel", expired_trades.len());

    let mut cancelled_count = 0u64;
    let mut total_gas_wei = 0u128;

    for trade in expired_trades {
        let trade_id = &trade.trade_id;
        let trade_chain_id = trade.chain_id as u64;
        
        // Get the correct blockchain client for this trade's chain
        let eth_client = match clients.get(&trade_chain_id) {
            Some(client) => client,
            None => {
                tracing::warn!("⚠️ No client for chain {} (trade {}), skipping", trade_chain_id, trade_id);
                continue;
            }
        };
        
        // Parse trade_id to bytes32
        let trade_id_bytes = parse_trade_id(trade_id)?;
        
        tracing::info!("🔄 Cancelling trade {} on chain {}", trade_id, trade_chain_id);
        
        match eth_client.cancel_expired_trade(trade_id_bytes).await {
            Ok((tx_hash, gas_cost)) => {
                tracing::info!(
                    "✅ Trade {} cancelled on chain {}: tx={:#x}, gas_cost={} wei ({:.6} ETH)",
                    trade_id,
                    trade_chain_id,
                    tx_hash,
                    gas_cost,
                    gas_cost.as_u128() as f64 / 1e18
                );
                
                // Update database status
                if let Err(e) = db.update_trade_status(trade_id, TRADE_STATUS_EXPIRED).await {
                    tracing::warn!("⚠️ Failed to update DB status for {}: {}", trade_id, e);
                }
                
                cancelled_count += 1;
                total_gas_wei += gas_cost.as_u128();
            }
            Err(e) => {
                tracing::warn!(
                    "⚠️ Failed to cancel trade {} on chain {}: {}",
                    trade_id,
                    trade_chain_id,
                    e
                );
            }
        }
    }

    Ok((cancelled_count, total_gas_wei))
}

/// Parse trade_id string (0x...) to [u8; 32]
fn parse_trade_id(trade_id: &str) -> Result<[u8; 32], Box<dyn std::error::Error + Send + Sync>> {
    let trade_id = trade_id.strip_prefix("0x").unwrap_or(trade_id);
    let bytes = hex::decode(trade_id)?;
    
    if bytes.len() != 32 {
        return Err(format!("Trade ID must be 32 bytes, got {}", bytes.len()).into());
    }
    
    let mut result = [0u8; 32];
    result.copy_from_slice(&bytes);
    Ok(result)
}

