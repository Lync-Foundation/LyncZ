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
    
    /// Blockchain client for primary chain (backward compat - Base by default)
    pub blockchain_client: Option<Arc<EthereumClient>>,
    
    /// Multi-chain blockchain clients: chain_id -> EthereumClient
    pub blockchain_clients: Arc<HashMap<u64, Arc<EthereumClient>>>,
    
    /// In-memory cache for input streams (trade_id -> 46 hex strings)
    /// Used to avoid regenerating input streams between validation and proof generation
    pub input_streams_cache: Arc<RwLock<HashMap<String, Vec<String>>>>,
    
    /// Cache for contract config per chain: chain_id -> CachedConfig
    pub config_cache: Arc<RwLock<HashMap<u64, CachedConfig>>>,
    
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
            blockchain_clients: Arc::new(HashMap::new()),
            input_streams_cache: Arc::new(RwLock::new(HashMap::new())),
            config_cache: Arc::new(RwLock::new(HashMap::new())),
            proof_in_progress: Arc::new(RwLock::new(HashSet::new())),
            nonce_store: NonceStore::new(),
        })
    }
    
    /// Set blockchain client for primary chain (backward compat)
    pub fn with_blockchain_client(mut self, client: Arc<EthereumClient>) -> Self {
        self.blockchain_client = Some(client);
        self
    }
    
    /// Set multi-chain blockchain clients
    pub fn with_blockchain_clients(mut self, clients: HashMap<u64, Arc<EthereumClient>>) -> Self {
        // Also set the primary client to the first one (or Base if available)
        if self.blockchain_client.is_none() {
            if let Some(base_client) = clients.get(&8453) {
                self.blockchain_client = Some(base_client.clone());
            } else if let Some((_, first_client)) = clients.iter().next() {
                self.blockchain_client = Some(first_client.clone());
            }
        }
        self.blockchain_clients = Arc::new(clients);
        self
    }
    
    /// Get blockchain client for a specific chain ID
    /// Falls back to the primary client if chain_id not found
    pub fn get_blockchain_client(&self, chain_id: u64) -> Option<&Arc<EthereumClient>> {
        self.blockchain_clients.get(&chain_id)
            .or(self.blockchain_client.as_ref())
    }
    
    /// Get cached config or fetch fresh from blockchain
    /// Uses the primary blockchain client
    pub async fn get_config(&self, force_refresh: bool) -> Result<ContractConfig, String> {
        let blockchain_client = self.blockchain_client.as_ref()
            .ok_or_else(|| "Blockchain client not available".to_string())?;
        
        let chain_id = blockchain_client.chain_id();
        self.get_config_for_chain(chain_id, force_refresh).await
    }
    
    /// Get cached config for a specific chain
    pub async fn get_config_for_chain(&self, chain_id: u64, force_refresh: bool) -> Result<ContractConfig, String> {
        let blockchain_client = self.get_blockchain_client(chain_id)
            .ok_or_else(|| format!("No blockchain client for chain {}", chain_id))?;
        
        // Check cache first (unless force refresh)
        if !force_refresh {
            let cache = self.config_cache.read().await;
            if let Some(cached) = cache.get(&chain_id) {
                if cached.cached_at.elapsed() < Self::CONFIG_CACHE_TTL {
                    tracing::debug!("Returning cached config for chain {} (age: {:?})", chain_id, cached.cached_at.elapsed());
                    return Ok(cached.config.clone());
                }
            }
        }
        
        // Fetch fresh from blockchain
        tracing::info!("Fetching fresh contract config from chain {}", chain_id);
        let config = blockchain_client.get_contract_config().await
            .map_err(|e| format!("Failed to get contract config for chain {}: {}", chain_id, e))?;
        
        // Update cache
        let mut cache = self.config_cache.write().await;
        cache.insert(chain_id, CachedConfig {
            config: config.clone(),
            cached_at: Instant::now(),
        });
        
        Ok(config)
    }
}
