//! LyncZ Relay API Server
//! 
//! Simplified architecture:
//! - Event listener syncs blockchain → DB
//! - Read-only APIs for orders and trades
//! - Two-step settlement: validate → settle

use std::sync::Arc;
use std::collections::HashMap;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use lyncz_relay::{Config, AppState, create_router};
use lyncz_relay::blockchain::client::EthereumClient;
use lyncz_relay::blockchain::events::EventListener;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,lyncz_relay=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("🚀 Starting LyncZ Relay Server");

    let config = Config::load()?;
    config.log_summary();

    let addr = format!("{}:{}", config.api_host, config.api_port);

    // Initialize state
    let mut state = AppState::new(&config.database_url).await?;
    tracing::info!("✅ Database connected");

    // Initialize blockchain clients for all configured chains
    if config.relayer_private_key.is_some() {
        let private_key = config.relayer_private_key.as_ref().unwrap();
        let mut clients: HashMap<u64, Arc<EthereumClient>> = HashMap::new();
        
        for chain_config in &config.chains {
            let escrow_address: ethers::types::Address = match chain_config.escrow_address.parse() {
                Ok(addr) => addr,
                Err(e) => {
                    tracing::warn!("⚠️ Invalid escrow address for {} (chain {}): {}", 
                        chain_config.name, chain_config.chain_id, e);
                    continue;
                }
            };
            
            match EthereumClient::new(
                &chain_config.rpc_url,
                private_key,
                escrow_address,
                chain_config.chain_id,
            ).await {
                Ok(client) => {
                    let client = Arc::new(client);
                    tracing::info!("✅ Blockchain client initialized for {} (chain {})", 
                        chain_config.name, chain_config.chain_id);
                    
                    // Start event listener for this chain
                    let rpc_url = chain_config.rpc_url.clone();
                    let chain_id = chain_config.chain_id;
                    let chain_name = chain_config.name.clone();
                    let db_pool = state.db.pool().clone();
                    
                    if let Ok(mut listener) = EventListener::new(&rpc_url, escrow_address, db_pool, None, chain_id).await {
                        tokio::spawn(async move {
                            tracing::info!("🎧 Event listener started for {} (chain {})", chain_name, chain_id);
                            if let Err(e) = listener.start().await {
                                tracing::error!("Event listener error for {} (chain {}): {:?}", chain_name, chain_id, e);
                            }
                        });
                    }
                    
                    clients.insert(chain_config.chain_id, client);
                }
                Err(e) => {
                    tracing::warn!("⚠️ Blockchain client failed for {} (chain {}): {}", 
                        chain_config.name, chain_config.chain_id, e);
                }
            }
        }
        
        if !clients.is_empty() {
            tracing::info!("✅ {} blockchain client(s) initialized", clients.len());
            state = state.with_blockchain_clients(clients);
        }
    } else {
        tracing::info!("⚠️ Blockchain disabled (no RELAYER_PRIVATE_KEY)");
    }

    let app = create_router(state);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    
    tracing::info!("✅ Server running on http://{}", addr);
    tracing::info!("");
    tracing::info!("📚 API Endpoints:");
    tracing::info!("   GET  /health                      Health check");
    tracing::info!("   GET  /api/orders/active           List orders (?chain_id=8453)");
    tracing::info!("   GET  /api/trades/:id              Get trade");
    tracing::info!("   POST /api/trades/:id/validate     Upload PDF + validate (~10s)");
    
    axum::serve(listener, app).await?;
    Ok(())
}
