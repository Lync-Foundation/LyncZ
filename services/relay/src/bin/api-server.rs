//! LyncZ Relay API Server
//! 
//! Simplified architecture:
//! - Event listener syncs blockchain → DB
//! - Read-only APIs for orders and trades
//! - Two-step settlement: validate → settle

use std::sync::Arc;
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

    // Initialize blockchain client
    if config.relayer_private_key.is_some() {
        match EthereumClient::from_config(&config).await {
            Ok(eth_client) => {
                let escrow_address: ethers::types::Address = config.escrow_address.parse()?;
                state = state.with_blockchain_client(Arc::new(eth_client));
                tracing::info!("✅ Blockchain client initialized");
                
                // Start event listener
                let rpc_url = config.rpc_url.clone();
                let db_pool = state.db.pool().clone();
                
                if let Ok(mut listener) = EventListener::new(&rpc_url, escrow_address, db_pool, None, config.chain_id).await {
                    tokio::spawn(async move {
                        tracing::info!("🎧 Event listener started");
                        if let Err(e) = listener.start().await {
                            tracing::error!("Event listener error: {:?}", e);
                        }
                    });
                }
            }
            Err(e) => {
                tracing::warn!("⚠️ Blockchain client failed: {}", e);
            }
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
    tracing::info!("   GET  /api/orders/active           List orders");
    tracing::info!("   GET  /api/trades/:id              Get trade");
    tracing::info!("   POST /api/trades/:id/validate     Upload PDF + validate (~10s)");
    tracing::info!("   POST /api/trades/:id/settle       Generate proof + submit (~2-3 min)");
    
    axum::serve(listener, app).await?;
    Ok(())
}
