use std::sync::Arc;
use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use crate::db::Database;
use crate::blockchain::client::EthereumClient;
use crate::blockchain::types::ContractConfig;
use crate::auth::NonceStore;

/// Cache entry with expiration
pub struct CachedConfig {
    pub config: ContractConfig,
    pub cached_at: Instant,
}

/// Shared application state
/// Uses DB-based orderbook (no in-memory cache)
#[derive(Clone)]
pub struct AppState {
    /// Database connection for persistence and queries
    pub db: Arc<Database>,
    
    /// Blockchain client for Ethereum interaction (optional for testing)
    pub blockchain_client: Option<Arc<EthereumClient>>,
    
    /// In-memory cache for input streams (trade_id -> 46 hex strings)
    /// Used to avoid regenerating input streams between validation and proof generation
    pub input_streams_cache: Arc<RwLock<HashMap<String, Vec<String>>>>,
    
    /// Cache for contract config (avoids excessive RPC calls)
    /// Default TTL: 5 minutes
    pub config_cache: Arc<RwLock<Option<CachedConfig>>>,
    
    /// Set of trade IDs currently generating proofs (prevents duplicate requests)
    pub proof_in_progress: Arc<RwLock<HashSet<String>>>,
    
    /// Nonce store for SIWE authentication
    pub nonce_store: NonceStore,
}

impl AppState {
    /// Config cache TTL (15 minutes)
    pub const CONFIG_CACHE_TTL: Duration = Duration::from_secs(900);
}

impl AppState {
    /// Create new app state
    pub async fn new(database_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // Connect to database
        let db = Database::new(database_url).await?;
        
        // Run migrations
        db.migrate().await?;
        
        tracing::info!("App state initialized (DB-based orderbook with direct queries)");
        
        Ok(Self {
            db: Arc::new(db),
            blockchain_client: None,
            input_streams_cache: Arc::new(RwLock::new(HashMap::new())),
            config_cache: Arc::new(RwLock::new(None)),
            proof_in_progress: Arc::new(RwLock::new(HashSet::new())),
            nonce_store: NonceStore::new(),
        })
    }
    
    /// Set blockchain client (optional, for blockchain integration)
    pub fn with_blockchain_client(mut self, client: Arc<EthereumClient>) -> Self {
        self.blockchain_client = Some(client);
        self
    }
    
    /// Get cached config or fetch fresh from blockchain
    pub async fn get_config(&self, force_refresh: bool) -> Result<ContractConfig, String> {
        let blockchain_client = self.blockchain_client.as_ref()
            .ok_or_else(|| "Blockchain client not available".to_string())?;
        
        // Check cache first (unless force refresh)
        if !force_refresh {
            let cache = self.config_cache.read().await;
            if let Some(cached) = cache.as_ref() {
                if cached.cached_at.elapsed() < Self::CONFIG_CACHE_TTL {
                    tracing::debug!("Returning cached config (age: {:?})", cached.cached_at.elapsed());
                    return Ok(cached.config.clone());
                }
            }
        }
        
        // Fetch fresh from blockchain
        tracing::info!("Fetching fresh contract config from blockchain");
        let config = blockchain_client.get_contract_config().await
            .map_err(|e| format!("Failed to get contract config: {}", e))?;
        
        // Update cache
        let mut cache = self.config_cache.write().await;
        *cache = Some(CachedConfig {
            config: config.clone(),
            cached_at: Instant::now(),
        });
        
        Ok(config)
    }
}
