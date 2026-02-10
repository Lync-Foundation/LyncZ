//! Configuration management for LyncZ relay backend
//! 
//! Loads configuration from environment variables.
//! Most blockchain-related values (verifier addresses, trade limits, etc.)
//! are fetched directly from the smart contracts at runtime.

use std::env;

/// Per-chain configuration for a single blockchain
#[derive(Debug, Clone)]
pub struct ChainConfig {
    pub chain_id: u64,
    pub rpc_url: String,
    pub escrow_address: String,
    pub name: String,          // "Base" or "Ethereum"
}

/// Main configuration struct - only essential runtime values
#[derive(Debug, Clone)]
pub struct Config {
    // Database
    pub database_url: String,
    
    // API Server
    pub api_host: String,
    pub api_port: u16,
    
    // Primary chain (Base Mainnet by default)
    pub chain_id: u64,
    pub rpc_url: String,
    pub escrow_address: String,
    
    // All supported chains (populated from env vars)
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
        
        // Blockchain
        let chain_id = env::var("CHAIN_ID")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(8453); // Base mainnet default
        
        let rpc_url = env::var("RPC_URL")
            .unwrap_or_else(|_| "https://mainnet.base.org".to_string());
        
        // Escrow contract address (required)
        let escrow_address = env::var("ESCROW_ADDRESS")
            .or_else(|_| env::var("ESCROW_CONTRACT_ADDRESS"))
            .map_err(|_| ConfigError::Missing("ESCROW_ADDRESS".to_string()))?;
        
        // Relayer private key (for fillOrder, submitProof, cancelExpiredTrade)
        let relayer_private_key = env::var("RELAYER_PRIVATE_KEY").ok();
        
        // Axiom API key (for ZK proof generation)
        let axiom_api_key = env::var("AXIOM_API_KEY").ok();
        
        // Resend API key (for email notifications)
        let resend_api_key = env::var("RESEND_API_KEY").ok();
        
        // Build chain configs
        let mut chains = vec![
            ChainConfig {
                chain_id,
                rpc_url: rpc_url.clone(),
                escrow_address: escrow_address.clone(),
                name: if chain_id == 1 { "Ethereum".to_string() } else { "Base".to_string() },
            },
        ];
        
        // Optional: Ethereum Mainnet config (ETH_RPC_URL + ETH_ESCROW_ADDRESS)
        if let (Ok(eth_rpc), Ok(eth_escrow)) = (env::var("ETH_RPC_URL"), env::var("ETH_ESCROW_ADDRESS")) {
            let eth_chain_id: u64 = env::var("ETH_CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(1); // Ethereum mainnet default
            
            chains.push(ChainConfig {
                chain_id: eth_chain_id,
                rpc_url: eth_rpc,
                escrow_address: eth_escrow,
                name: "Ethereum".to_string(),
            });
        }
        
        // Optional: Base config when primary is ETH (BASE_RPC_URL + BASE_ESCROW_ADDRESS)
        if let (Ok(base_rpc), Ok(base_escrow)) = (env::var("BASE_RPC_URL"), env::var("BASE_ESCROW_ADDRESS")) {
            let base_chain_id: u64 = env::var("BASE_CHAIN_ID")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(8453);
            
            // Only add if not already the primary chain
            if !chains.iter().any(|c| c.chain_id == base_chain_id) {
                chains.push(ChainConfig {
                    chain_id: base_chain_id,
                    rpc_url: base_rpc,
                    escrow_address: base_escrow,
                    name: "Base".to_string(),
                });
            }
        }
        
        Ok(Config {
            database_url,
            api_host,
            api_port,
            chain_id,
            rpc_url,
            escrow_address,
            chains,
            relayer_private_key,
            axiom_api_key,
            resend_api_key,
        })
    }
    
    /// Log current configuration (hiding secrets)
    pub fn log_summary(&self) {
        tracing::info!("=== LyncZ Configuration ===");
        tracing::info!("Supported chains: {}", self.chains.len());
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
