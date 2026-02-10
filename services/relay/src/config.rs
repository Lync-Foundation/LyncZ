//! Configuration management for LyncZ relay backend
//! 
//! Two chains supported as equal peers: Base (8453) and Ethereum (1).
//! Each chain has its own RPC URL and escrow contract address.
//! The relay wallet (private key) is shared across all chains.

use std::env;

/// Per-chain configuration for a single blockchain
#[derive(Debug, Clone)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub rpc_url: String,
    pub escrow_address: String,
    pub name: String,          // "Base" or "Ethereum"
}

/// Main configuration struct - no primary chain, both are equal peers
#[derive(Debug, Clone)]
pub struct Config {
    // Database
    pub database_url: String,
    
    // API Server
    pub api_host: String,
    pub api_port: u16,
    
    // All supported chains (Base + Ethereum)
    pub chains: Vec<ChainConfig>,
    
    // Relayer (for signing transactions - same wallet for all chains)
    pub relayer_private_key: Option<String>,
    
    // Axiom API (for ZK proof generation)
    pub axiom_api_key: Option<String>,
    
    // Email service (for notifications)
    pub resend_api_key: Option<String>,
}

impl Config {
    /// Load configuration from environment variables
    /// 
    /// Chain config env vars (both optional - service starts with whichever chains are configured):
    /// 
    /// Base (chain 8453):
    ///   CHAIN_ID + RPC_URL + ESCROW_ADDRESS  (legacy, maps to Base)
    ///   — OR —
    ///   BASE_RPC_URL + BASE_ESCROW_ADDRESS   (explicit)
    ///
    /// Ethereum (chain 1):
    ///   ETH_RPC_URL + ETH_ESCROW_ADDRESS
    pub fn load() -> Result<Self, ConfigError> {
        // Database (required for production, has dev default)
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| "postgres://lyncz:lyncz_dev@localhost:5432/lyncz_orderbook".to_string());
        
        // API Server
        let api_host = env::var("API_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let api_port = env::var("PORT")
            .or_else(|_| env::var("API_PORT"))
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .unwrap_or(8080);
        
        // Relayer private key (for fillOrder, submitProof, cancelExpiredTrade)
        let relayer_private_key = env::var("RELAYER_PRIVATE_KEY").ok();
        
        // Axiom API key (for ZK proof generation)
        let axiom_api_key = env::var("AXIOM_API_KEY").ok();
        
        // Resend API key (for email notifications)
        let resend_api_key = env::var("RESEND_API_KEY").ok();
        
        // ====== Build chain configs (both chains are equal peers) ======
        let mut chains = Vec::new();
        
        // --- Base chain (8453) ---
        // Try explicit BASE_* vars first, fall back to legacy CHAIN_ID/RPC_URL/ESCROW_ADDRESS
        let base_rpc = env::var("BASE_RPC_URL")
            .or_else(|_| env::var("RPC_URL"));
        let base_escrow = env::var("BASE_ESCROW_ADDRESS")
            .or_else(|_| env::var("ESCROW_ADDRESS"))
            .or_else(|_| env::var("ESCROW_CONTRACT_ADDRESS"));
        
        if let (Ok(rpc), Ok(escrow)) = (base_rpc, base_escrow) {
            let chain_id = env::var("BASE_CHAIN_ID")
                .or_else(|_| env::var("CHAIN_ID"))
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8453);
            
            chains.push(ChainConfig {
                chain_id,
                rpc_url: rpc,
                escrow_address: escrow,
                name: "Base".to_string(),
            });
        }
        
        // --- Ethereum chain (1) ---
        let eth_rpc = env::var("ETH_RPC_URL");
        let eth_escrow = env::var("ETH_ESCROW_ADDRESS");
        
        if let (Ok(rpc), Ok(escrow)) = (eth_rpc, eth_escrow) {
            let chain_id = env::var("ETH_CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1);
            
            chains.push(ChainConfig {
                chain_id,
                rpc_url: rpc,
                escrow_address: escrow,
                name: "Ethereum".to_string(),
            });
        }
        
        // At least one chain must be configured
        if chains.is_empty() {
            return Err(ConfigError::Missing(
                "No chain configured. Set RPC_URL+ESCROW_ADDRESS (Base) and/or ETH_RPC_URL+ETH_ESCROW_ADDRESS (Ethereum)".to_string()
            ));
        }
        
        Ok(Config {
            database_url,
            api_host,
            api_port,
            chains,
            relayer_private_key,
            axiom_api_key,
            resend_api_key,
        })
    }
    
    /// Get chain config by chain_id (convenience helper)
    pub fn get_chain(&self, chain_id: u64) -> Option<&ChainConfig> {
        self.chains.iter().find(|c| c.chain_id == chain_id)
    }
    
    /// Log current configuration (hiding secrets)
    pub fn log_summary(&self) {
        tracing::info!("=== LyncZ Configuration ===");
        tracing::info!("Chains: {} configured", self.chains.len());
        for chain in &self.chains {
            tracing::info!("  {} (chain_id={}): escrow={}, rpc={}...", 
                chain.name, chain.chain_id, chain.escrow_address,
                &chain.rpc_url[..50.min(chain.rpc_url.len())]);
        }
        tracing::info!("Relayer: {}", if self.relayer_private_key.is_some() { "✅ Set" } else { "❌ Not set" });
        tracing::info!("Axiom API: {}", if self.axiom_api_key.is_some() { "✅ Set" } else { "❌ Not set" });
        tracing::info!("Resend API: {}", if self.resend_api_key.is_some() { "✅ Set" } else { "❌ Not set" });
        tracing::info!("===========================");
    }
}

#[derive(Debug)]
pub enum ConfigError {
    Missing(String),
    #[allow(dead_code)]
    Invalid(String),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::Missing(var) => write!(f, "Missing required config: {}", var),
            ConfigError::Invalid(msg) => write!(f, "Invalid config: {}", msg),
        }
    }
}

impl std::error::Error for ConfigError {}
